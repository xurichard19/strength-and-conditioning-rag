"""bind this project's local supabase ports to loopback without replacing data volumes"""

import argparse
import copy
import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.parse import quote, unquote, urlencode, urlsplit
from uuid import uuid4


PROJECT_ID = "strength-and-conditioning-rag"
PROJECT_LABEL = "com.supabase.cli.project"
LOOPBACK = "127.0.0.1"
NETWORK = "arcel-local"
REPO_ROOT = Path(__file__).resolve().parents[2]


class DockerError(RuntimeError):
    """a local docker operation failed without exposing container secrets"""


class UnixConnection(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=30)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


class LocalDocker:
    def __init__(self):
        host = os.environ.get("DOCKER_HOST")
        if not host:
            result = subprocess.run(
                ["docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"],
                check=True, capture_output=True, text=True,
            )
            host = json.loads(result.stdout)
        url = urlsplit(host)
        if url.scheme != "unix" or not url.path or url.netloc:
            raise DockerError("only a local unix docker socket is supported")
        self.path = unquote(url.path)

    def request(self, method, path, body=None):
        connection = UnixConnection(self.path)
        try:
            payload = None if body is None else json.dumps(body).encode()
            connection.request(method, path, payload, {"Content-Type": "application/json"})
            response = connection.getresponse()
            data = response.read()
            if response.status >= 400:
                raise DockerError(f"docker {method} {path.split('?')[0]} failed ({response.status})")
            return json.loads(data) if data else None
        finally:
            connection.close()


def validate_project(container):
    """
    reject containers outside this repository's local supabase stack

    - **container**: docker inspect response
    """
    name = container["Name"].lstrip("/")
    labels = container["Config"].get("Labels") or {}
    if (labels.get(PROJECT_LABEL) != PROJECT_ID or not name.startswith("supabase_")
            or not name.endswith("_" + PROJECT_ID)):
        raise DockerError("refusing to modify a container outside this local supabase project")


def is_loopback(container):
    """check both requested and active bindings, including ipv6 mappings"""
    bindings = container["HostConfig"].get("PortBindings") or {}
    active = container["NetworkSettings"].get("Ports") or {}
    return all(
        binding.get("HostIp") == LOOPBACK
        for mapping in (bindings, active)
        for values in mapping.values()
        for binding in values or []
    )


def replacement_config(container):
    """
    preserve container configuration and mounted data with explicit loopback ports

    - **container**: validated docker inspect response
    - **returns**: docker container-create payload
    """
    validate_project(container)
    config = copy.deepcopy(container["Config"])
    host = copy.deepcopy(container["HostConfig"])
    if host.get("AutoRemove") or host.get("PublishAllPorts"):
        raise DockerError("automatic removal or automatic port publishing is unsupported")
    for port, bindings in (host.get("PortBindings") or {}).items():
        unique = {}
        for binding in bindings or []:
            binding["HostIp"] = LOOPBACK
            unique[binding["HostPort"]] = binding
        host["PortBindings"][port] = list(unique.values())

    # Anonymous image volumes must retain their existing data, too.
    host["Binds"] = host.get("Binds") or []
    targets = {mount["Target"] for mount in host.get("Mounts") or []}
    targets.update(bind.split(":")[1] for bind in host.get("Binds") or [])
    for mount in container.get("Mounts") or []:
        if mount["Type"] == "volume" and mount["Destination"] not in targets:
            source = mount["Name"]
            mode = mount.get("Mode") or ("rw" if mount["RW"] else "ro")
            host.setdefault("Binds", []).append(f'{source}:{mount["Destination"]}:{mode}')

    networks = {}
    for name, endpoint in container["NetworkSettings"]["Networks"].items():
        if endpoint.get("IPAMConfig"):
            raise DockerError("static container addresses need manual recreation")
        networks[name] = {
            key: copy.deepcopy(endpoint[key])
            for key in ("Aliases", "Links", "DriverOpts", "GwPriority")
            if endpoint.get(key) is not None
        }
    config["HostConfig"] = host
    config["NetworkingConfig"] = {"EndpointsConfig": networks}
    return config


def wait_until_healthy(docker, container_id, timeout=180):
    """wait for the replacement to run and pass its existing health check"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        current = docker.request("GET", f"/containers/{container_id}/json")
        state = current["State"]
        if not state.get("Running"):
            raise DockerError("replacement container stopped before becoming healthy")
        health = state.get("Health", {}).get("Status", "healthy")
        if health == "healthy":
            if not is_loopback(current):
                raise DockerError("docker did not apply explicit loopback bindings")
            return
        if health == "unhealthy":
            raise DockerError("replacement container failed its health check")
        time.sleep(1)
    raise DockerError("replacement container health check timed out")


def recreate_container(docker, container):
    """
    replace one running container, retaining the original until verification succeeds

    - **docker**: local docker api client
    - **container**: docker inspect response for this project's running container
    - **returns**: true when replaced, false when already bound to loopback
    """
    validate_project(container)
    if not container["State"].get("Running"):
        raise DockerError("refusing to change a stopped container")
    if is_loopback(container):
        return False
    config = replacement_config(container)
    original_id = container["Id"]
    original_name = container["Name"].lstrip("/")
    backup_name = original_name + "-loopback-backup-" + uuid4().hex[:8]
    replacement_id = None
    renamed = False
    try:
        docker.request("POST", f"/containers/{original_id}/stop?t=10")
        docker.request("POST", f"/containers/{original_id}/rename?" + urlencode({"name": backup_name}))
        renamed = True
        created = docker.request("POST", "/containers/create?" + urlencode({"name": original_name}), config)
        replacement_id = created["Id"]
        docker.request("POST", f"/containers/{replacement_id}/start")
        wait_until_healthy(docker, replacement_id)
    except BaseException as error:
        try:
            if replacement_id:
                docker.request("DELETE", f"/containers/{replacement_id}?force=true&v=false")
            if renamed:
                docker.request("POST", f"/containers/{original_id}/rename?" + urlencode({"name": original_name}))
            docker.request("POST", f"/containers/{original_id}/start")
        except Exception as rollback_error:
            raise DockerError(
                f"replacement failed and automatic rollback needs attention; original container {original_id} was preserved"
            ) from rollback_error
        raise DockerError(f"replacement failed; restored {original_name}") from error

    # Never remove a volume; the healthy replacement uses the same data.
    docker.request("DELETE", f"/containers/{original_id}?v=false")
    return True


def start_stack(docker):
    """start only this repository's local stack on its dedicated docker network"""
    option = "com.docker.network.bridge.host_binding_ipv4"
    filters = json.dumps({"name": [NETWORK]})
    networks = docker.request("GET", "/networks?" + urlencode({"filters": filters}))
    network = next((item for item in networks if item["Name"] == NETWORK), None)
    if network is None:
        docker.request("POST", "/networks/create", {
            "Name": NETWORK, "Driver": "bridge", "Options": {option: LOOPBACK},
        })
    elif network["Driver"] != "bridge" or (network.get("Options") or {}).get(option) != LOOPBACK:
        raise DockerError("arcel-local exists with different network settings; no changes made")
    command = [str(REPO_ROOT / "node_modules/.bin/supabase"), "start", "--network-id", NETWORK]
    for service in ("logflare", "vector", "realtime", "storage-api", "imgproxy", "edge-runtime"):
        command.extend(["--exclude", service])
    print("Starting local Supabase...", flush=True)
    result = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True)
    if result.returncode:
        raise DockerError("local supabase startup failed; inspect local docker container status")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", action="store_true", help="start the local stack before enforcing loopback bindings")
    args = parser.parse_args()
    docker = LocalDocker()
    if args.start:
        start_stack(docker)
    filters = json.dumps({"label": [f"{PROJECT_LABEL}={PROJECT_ID}"]})
    containers = docker.request("GET", "/containers/json?" + urlencode({"filters": filters}))
    if not containers:
        raise DockerError("this project's local supabase stack is not running")
    for item in containers:
        container = docker.request("GET", f'/containers/{quote(item["Id"], safe="")}/json')
        if not container["HostConfig"].get("PortBindings"):
            continue
        changed = recreate_container(docker, container)
        action = "bound to" if changed else "already bound to"
        print(f'{container["Name"].lstrip("/")}: {action} {LOOPBACK}', flush=True)


if __name__ == "__main__":
    try:
        main()
    except (DockerError, OSError, subprocess.SubprocessError, ValueError) as error:
        # Docker responses/configuration can contain keys; never print raw payloads.
        message = str(error) if isinstance(error, DockerError) else "local docker communication failed"
        raise SystemExit(message)
