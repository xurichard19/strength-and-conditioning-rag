"""Run database and concurrency checks in an owned disposable PostgreSQL container."""

from pathlib import Path
import subprocess
import sys
import time
import tomllib
from uuid import uuid4


TESTS = Path(__file__).resolve().parent
ROOT = TESTS.parents[1]


def main() -> None:
    """Apply local fixtures and migrations without reading production configuration."""
    config = tomllib.loads((ROOT / "supabase/config.toml").read_text(encoding="utf-8"))
    version = int(config["db"]["major_version"])
    container = f"arcel-db-tests-{uuid4().hex}"
    print(f"Starting disposable PostgreSQL {version} database checks", flush=True)
    try:
        container = subprocess.run([
            "docker", "create", "--name", container,
            "--env", "POSTGRES_PASSWORD=local-test-only", "--env", "TZ=UTC", "--env", "PGTZ=UTC",
            f"postgres:{version}",
        ], text=True, stdout=subprocess.PIPE, check=True, timeout=300).stdout.strip()
        subprocess.run(["docker", "start", container], stdout=subprocess.DEVNULL, check=True, timeout=30)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            ready = subprocess.run([
                "docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            subprocess.run(["docker", "logs", container], check=False, timeout=10)
            raise RuntimeError("PostgreSQL did not become ready within 60 seconds")

        migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
        suites = sorted(path for path in TESTS.glob("*.sql") if path.name != "bootstrap.sql")
        def check_sql(path: Path) -> None:
            print(f"Checking {path.relative_to(ROOT)}", flush=True)
            subprocess.run([
                "docker", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
                "-v", "ON_ERROR_STOP=1", "--quiet",
            ], input=path.read_bytes(), check=True, timeout=120)

        for path in [TESTS / "bootstrap.sql", *migrations, *suites]:
            transition = path.name.endswith("_event_driven_planning_billing.sql")
            restore_refresh_helper = path.name.endswith("_restore_latest_refresh_occurrence.sql")
            if transition:
                check_sql(TESTS / "migrations/event_driven_before.sql")
            if restore_refresh_helper:
                check_sql(TESTS / "migrations/refresh_helper_before.sql")
            check_sql(path)
            if transition:
                check_sql(TESTS / "migrations/event_driven_after.sql")
            if restore_refresh_helper:
                check_sql(TESTS / "migrations/refresh_helper_after.sql")
                # a fresh database already has the helper; replacement must also be safe.
                check_sql(path)
                check_sql(TESTS / "migrations/refresh_helper_after.sql")
        subprocess.run([sys.executable, "-u", str(TESTS / "concurrency.py"), container],
            cwd=ROOT, check=True, timeout=120)
        subprocess.run([sys.executable, "-u", str(TESTS / "billing_concurrency.py"), container],
            cwd=ROOT, check=True, timeout=120)
        subprocess.run([sys.executable, "-u", str(TESTS / "planning_billing_concurrency.py"), container],
            cwd=ROOT, check=True, timeout=120)
        # The privilege cutover is intentionally outside automatic migrations.
        # Exercise it last without affecting the migration-first compatibility suites.
        staged = ROOT / "supabase/staged/backend_only_training_access.sql"
        access_test = TESTS / "staged/protected_access.sql"
        print("Checking staged backend-only training access", flush=True)
        subprocess.run([
            "docker", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1", "--quiet",
        ], input=b"begin;\n" + staged.read_bytes() + access_test.read_bytes() + b"\nrollback;\n",
            check=True, timeout=120)
        # Inactivity enforcement waits for foreground reporting to ship. Test the
        # staged SQL only after compatibility checks against ordinary migrations.
        check_sql(ROOT / "supabase/staged/planning_inactivity.sql")
        check_sql(TESTS / "staged/planning_inactivity.sql")
        subprocess.run([sys.executable, "-u", str(TESTS / "activity_concurrency.py"), container],
            cwd=ROOT, check=True, timeout=120)
        print(f"Passed {len(suites)} SQL suites and concurrent database checks", flush=True)
    finally:
        cleanup = subprocess.run(["docker", "rm", "--force", "--volumes", container],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=30)
        if cleanup.returncode and "No such container" not in cleanup.stderr:
            print(cleanup.stderr, file=sys.stderr, end="")
            cleanup.check_returncode()


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        print(f"Database checks failed: {exc}", file=sys.stderr)
        sys.exit(1)
