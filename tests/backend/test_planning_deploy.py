"""Run the deployment activation shell against scripted, offline cloud responses."""

import os
from pathlib import Path
from shlex import quote
import shutil
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[2]
GIT = shutil.which("git")
BASH = str(Path(GIT).parents[1] / "bin/bash.exe") if os.name == "nt" and GIT else shutil.which("bash")
SCHEDULER = "scheduler jobs describe"
RESUME = "scheduler jobs resume"
QUEUE = "tasks queues describe"
QUEUE_RESUME = "tasks queues resume"


class PlanningDeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        workflow = (ROOT / ".github/workflows/deploy-planning-cloud-run.yml").read_text()
        step = workflow.split("      - name: apply desired planning state\n", 1)[1]
        lines = step.split("        run: |\n", 1)[1].splitlines()
        body = []
        for line in lines:
            if line.strip() and not line.startswith("          "):
                break
            body.append(line)
        cls.script = textwrap.dedent("\n".join(body))

    def run_activation(self, replies, *, enabled=True, success=True):
        # File-backed counters survive command substitutions; every unexpected command fails.
        cases = []
        for index, (command, output, status) in enumerate(replies):
            cases.append(f"{index}) [[ \"$1\" == {quote(command)} ]] || return 97; "
                f"printf '%s\\n' {quote(output)}{' >&2' if status else ''}; return {status} ;;")
        stub = """
            call() {
              local index
              read -r index < .index
              printf '%s\\n' "$((index + 1))" > .index
              printf '%s\\n' "$1" >> .calls
              case "$index" in
        """ + "\n".join(cases) + """
                *) echo "unexpected command: $1" >&2; return 98 ;;
              esac
            }
            gcloud() { call "$1 $2 $3"; }
            sleep() { call "sleep $1"; }
        """
        environment = {key: os.environ[key] for key in ("PATH", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP") if key in os.environ}
        environment.update(PLANNING_ENABLED=str(enabled).lower(), GCP_REGION="test-region",
            GCP_PROJECT_ID="test-project", GITHUB_STEP_SUMMARY="summary")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / ".index").write_bytes(b"0\n")
            (path / ".calls").touch()
            result = subprocess.run([BASH, "--noprofile", "--norc", "-c", stub + "\n" + self.script],
                cwd=directory, env=environment, capture_output=True, text=True, timeout=10)
            self.assertEqual(success, result.returncode == 0, result.stdout + result.stderr)
            self.assertEqual((path / ".calls").read_text().splitlines(), [reply[0] for reply in replies])
            if success:
                self.assertIn(f"enabled: {str(enabled).lower()}", (path / "summary").read_text())
        return result

    def test_enabled_resources_are_not_resumed_again(self):
        self.run_activation([(SCHEDULER, "ENABLED", 0), (QUEUE, "RUNNING", 0)])

    def test_queue_resumes_only_after_scheduler_is_confirmed_enabled(self):
        self.run_activation([(SCHEDULER, "PAUSED", 0), (RESUME, "", 0),
            (SCHEDULER, "ENABLED", 0), (QUEUE, "PAUSED", 0), (QUEUE_RESUME, "", 0)])

    def test_transient_errors_retry_with_fresh_state_and_bounded_delays(self):
        replies = []
        for error, delay in zip(("ABORTED", "UNAVAILABLE", "DEADLINE_EXCEEDED", "INTERNAL"), (5, 10, 20, 40)):
            replies.extend([(SCHEDULER, "PAUSED", 0), (RESUME, error, 1),
                (SCHEDULER, "PAUSED", 0), (f"sleep {delay}", "", 0)])
        # A concurrent deployment enabled it during backoff, so another resume is unnecessary.
        replies.extend([(SCHEDULER, "ENABLED", 0), (QUEUE, "PAUSED", 0), (QUEUE_RESUME, "", 0)])
        self.run_activation(replies)

    def test_successful_resume_waits_for_enabled_state(self):
        self.run_activation([(SCHEDULER, "PAUSED", 0), (RESUME, "", 0),
            (SCHEDULER, "PAUSED", 0), ("sleep 5", "", 0),
            (SCHEDULER, "ENABLED", 0), (QUEUE, "RUNNING", 0)])

    def test_timed_out_resume_that_succeeded_does_not_retry(self):
        self.run_activation([(SCHEDULER, "PAUSED", 0), (RESUME, "DEADLINE_EXCEEDED", 1),
            (SCHEDULER, "ENABLED", 0), (QUEUE, "PAUSED", 0), (QUEUE_RESUME, "", 0)])

    def test_permanent_resume_failure_stops_without_retrying_or_touching_queue(self):
        self.run_activation([(SCHEDULER, "PAUSED", 0), (RESUME, "PERMISSION_DENIED", 1)], success=False)

    def test_retry_exhaustion_leaves_queue_paused(self):
        replies = []
        for attempt in range(6):
            replies.extend([(SCHEDULER, "PAUSED", 0), (RESUME, "ABORTED", 1), (SCHEDULER, "PAUSED", 0)])
            if attempt < 5:
                replies.append((f"sleep {(5, 10, 20, 40, 60)[attempt]}", "", 0))
        result = self.run_activation(replies, success=False)
        self.assertIn("did not become enabled after six attempts", result.stdout)

    def test_failed_state_reads_do_not_activate_queue(self):
        for replies in ([(SCHEDULER, "PERMISSION_DENIED", 1)],
                [(SCHEDULER, "PAUSED", 0), (RESUME, "", 0), (SCHEDULER, "UNAVAILABLE", 1)]):
            with self.subTest(replies=replies):
                self.run_activation(replies, success=False)

    def test_disabled_planning_does_not_call_cloud(self):
        self.run_activation([], enabled=False)
