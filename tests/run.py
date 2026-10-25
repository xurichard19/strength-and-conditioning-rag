"""Run the same checks locally and before deployment: python tests/run.py [suite]."""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
NPM = shutil.which("npm.cmd" if os.name == "nt" else "npm") or "npm"
CHECKS = {
    "backend": [[sys.executable, "-m", "tests.backend"]],
    "mobile": [[NPM, "--prefix", "mobile", "run", command] for command in ("test", "typecheck", "lint")],
    "web": [[NPM, "--prefix", "client", "run", command] for command in ("lint", "build")],
    "database": [[sys.executable, "tests/database/run.py"]],
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", nargs="?", choices=["all", *CHECKS], default="all")
    suite = parser.parse_args().suite
    environment = {**os.environ, "EXPO_NO_DOTENV": "1"}
    try:
        for name in CHECKS if suite == "all" else [suite]:
            print(f"Running {name} checks", flush=True)
            for command in CHECKS[name]:
                subprocess.run(command, cwd=ROOT, env=environment, check=True)
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"Checks failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
