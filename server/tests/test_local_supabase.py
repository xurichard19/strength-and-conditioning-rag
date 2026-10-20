import copy
import unittest
from unittest.mock import Mock, patch

from server.scripts import bind_local_supabase as local


def container_fixture():
    return {
        "Id": "original", "Name": "/supabase_db_" + local.PROJECT_ID,
        "State": {"Running": True, "Health": {"Status": "healthy"}},
        "Config": {"Image": "supabase/postgres:test", "Env": ["TEST_SECRET=kept"],
            "Labels": {local.PROJECT_LABEL: local.PROJECT_ID},
            "Healthcheck": {"Test": ["CMD", "pg_isready"]}},
        "HostConfig": {"PortBindings": {"5432/tcp": [{"HostIp": "", "HostPort": "54322"}]},
            "Binds": ["arcel_data:/var/lib/postgresql/data:rw"], "NetworkMode": local.NETWORK,
            "RestartPolicy": {"Name": "always"}},
        "Mounts": [{"Type": "volume", "Name": "arcel_data", "Destination": "/var/lib/postgresql/data", "RW": True}],
        "NetworkSettings": {"Ports": {"5432/tcp": [{"HostIp": "0.0.0.0", "HostPort": "54322"}]},
            "Networks": {local.NETWORK: {"Aliases": ["db", "db.supabase.internal"], "IPAMConfig": None}}},
    }


class LocalSupabaseTests(unittest.TestCase):
    def test_configuration_preserves_keys_data_health_and_network_aliases(self):
        original = container_fixture()
        snapshot = copy.deepcopy(original)
        config = local.replacement_config(original)
        self.assertEqual(original, snapshot)
        for key, value in original["Config"].items():
            self.assertEqual(config[key], value)
        self.assertEqual(config["HostConfig"]["Binds"], original["HostConfig"]["Binds"])
        self.assertEqual(config["HostConfig"]["RestartPolicy"], {"Name": "always"})
        self.assertEqual(config["HostConfig"]["PortBindings"]["5432/tcp"], [{"HostIp": "127.0.0.1", "HostPort": "54322"}])
        self.assertEqual(config["NetworkingConfig"]["EndpointsConfig"][local.NETWORK]["Aliases"], ["db", "db.supabase.internal"])

    def test_anonymous_data_volumes_are_reused(self):
        original = container_fixture()
        original["HostConfig"]["Binds"] = None
        config = local.replacement_config(original)
        self.assertEqual(config["HostConfig"]["Binds"], ["arcel_data:/var/lib/postgresql/data:rw"])

    def test_other_projects_and_stopped_containers_are_never_changed(self):
        for change in ("label", "name", "state"):
            original = container_fixture()
            if change == "label":
                original["Config"]["Labels"][local.PROJECT_LABEL] = "another-project"
            elif change == "name":
                original["Name"] = "/unrelated"
            else:
                original["State"]["Running"] = False
            docker = Mock()
            with self.subTest(change=change), self.assertRaises(local.DockerError):
                local.recreate_container(docker, original)
            docker.request.assert_not_called()

    def test_already_bound_containers_are_untouched(self):
        original = container_fixture()
        for source in (original["HostConfig"]["PortBindings"], original["NetworkSettings"]["Ports"]):
            source["5432/tcp"][0]["HostIp"] = local.LOOPBACK
        docker = Mock()
        self.assertFalse(local.recreate_container(docker, original))
        docker.request.assert_not_called()

    def docker_for_replacement(self, health):
        docker = Mock()

        def request(method, path, body=None):
            if path.startswith("/containers/create?"):
                return {"Id": "replacement"}
            if method == "GET":
                current = container_fixture()
                current["State"]["Health"]["Status"] = health
                for source in (current["HostConfig"]["PortBindings"], current["NetworkSettings"]["Ports"]):
                    source["5432/tcp"][0]["HostIp"] = local.LOOPBACK
                return current

        docker.request.side_effect = request
        return docker

    def test_healthy_replacement_removes_original_without_removing_volumes(self):
        docker = self.docker_for_replacement("healthy")
        self.assertTrue(local.recreate_container(docker, container_fixture()))
        operations = [call.args[:2] for call in docker.request.call_args_list]
        self.assertEqual(operations[-2:], [("GET", "/containers/replacement/json"), ("DELETE", "/containers/original?v=false")])

    def test_failed_health_check_restores_original_and_keeps_volumes(self):
        docker = self.docker_for_replacement("unhealthy")
        with self.assertRaisesRegex(local.DockerError, "restored"):
            local.recreate_container(docker, container_fixture())
        operations = [call.args[:2] for call in docker.request.call_args_list]
        self.assertEqual(operations[-3][0:2], ("DELETE", "/containers/replacement?force=true&v=false"))
        self.assertIn("/containers/original/rename?name=supabase_db_", operations[-2][1])
        self.assertEqual(operations[-1], ("POST", "/containers/original/start"))
        self.assertNotIn(("DELETE", "/containers/original?v=false"), operations)

    def test_create_failure_restores_original_before_returning_error(self):
        docker = Mock()

        def request(method, path, body=None):
            if path.startswith("/containers/create?"):
                raise local.DockerError("create failed")

        docker.request.side_effect = request
        with self.assertRaisesRegex(local.DockerError, "restored"):
            local.recreate_container(docker, container_fixture())
        operations = [call.args[:2] for call in docker.request.call_args_list]
        self.assertIn("/containers/original/rename?name=supabase_db_", operations[-2][1])
        self.assertEqual(operations[-1], ("POST", "/containers/original/start"))
        self.assertFalse(any(method == "DELETE" for method, _ in operations))

    def test_active_wildcard_binding_is_never_mistaken_for_loopback(self):
        original = container_fixture()
        original["HostConfig"]["PortBindings"]["5432/tcp"][0]["HostIp"] = local.LOOPBACK
        self.assertFalse(local.is_loopback(original))
        original["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostIp"] = "::"
        self.assertFalse(local.is_loopback(original))

    def test_start_uses_only_local_stack_and_actual_image_exclusion_names(self):
        docker = Mock()
        docker.request.return_value = []
        with patch.object(local.subprocess, "run", return_value=Mock(returncode=0)) as run:
            local.start_stack(docker)
        command = run.call_args.args[0]
        self.assertEqual(command[1:4], ["start", "--network-id", local.NETWORK])
        self.assertIn("logflare", command)
        self.assertIn("storage-api", command)
        self.assertNotIn("--linked", command)
        self.assertEqual(docker.request.call_args.args[2]["Options"], {"com.docker.network.bridge.host_binding_ipv4": local.LOOPBACK})

    def test_existing_network_with_different_settings_is_not_changed(self):
        docker = Mock()
        docker.request.return_value = [{"Name": local.NETWORK, "Driver": "bridge", "Options": None}]
        with patch.object(local.subprocess, "run") as run, self.assertRaises(local.DockerError):
            local.start_stack(docker)
        run.assert_not_called()
        docker.request.assert_called_once()
