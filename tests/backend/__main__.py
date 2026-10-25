"""Run backend tests with dummy settings and external networking disabled."""

import os
from pathlib import Path
import socket
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
_connect = socket.socket.connect


def local_connect(connection, address):
    """Allow only loopback connections needed by Windows asyncio socket pairs."""
    if connection.family in (socket.AF_INET, socket.AF_INET6) and address[0] not in ("127.0.0.1", "::1"):
        raise AssertionError("external network access is disabled in backend tests")
    return _connect(connection, address)


def main() -> int:
    sys.path.insert(0, str(ROOT / "server"))
    os.environ.update({
        "CHROMA_TENANT": "test", "CHROMA_DATABASE": "test", "CHROMA_API_KEY": "test",
        "OPENAI_API_KEY": "test", "COHERE_API_KEY": "test", "TAVILY_API_KEY": "test",
        "SUPABASE_URL": "https://test.invalid", "SUPABASE_PUBLISHABLE_KEY": "test",
        "SUPABASE_SECRET_KEY": "test", "ENVIRONMENT": "test", "PLANNING_ENABLED": "false",
        "LANGSMITH_TRACING": "false", "LANGCHAIN_TRACING_V2": "false", "LANGCHAIN_TRACING": "false",
        "LANGSMITH_API_KEY": "test", "LANGCHAIN_API_KEY": "test", "SENTRY_DSN": "",
    })
    from app.config import DatabaseSettings, RuntimeSettings, Settings

    Settings.model_config["env_file"] = None
    DatabaseSettings.model_config["env_file"] = None
    RuntimeSettings.model_config["env_file"] = None
    with patch("dotenv.load_dotenv", return_value=False), \
            patch("socket.socket.connect", new=local_connect), \
            patch("socket.socket.connect_ex", side_effect=AssertionError("network access is disabled in backend tests")), \
            patch("socket.getaddrinfo", side_effect=AssertionError("DNS access is disabled in backend tests")):
        suite = unittest.defaultTestLoader.discover(str(ROOT / "tests/backend"), top_level_dir=str(ROOT))
        return int(not unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful())


if __name__ == "__main__":
    raise SystemExit(main())
