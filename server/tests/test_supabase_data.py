import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.db.supabase import SupabaseDataError, update_rows


class FakeResponse:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class UpdateRowsTests(unittest.TestCase):
    @patch("app.db.supabase.urlopen")
    @patch("app.db.supabase.get_settings")
    def test_patch_request_forwards_caller_auth_and_returns_representation(
        self,
        get_settings,
        urlopen,
    ) -> None:
        get_settings.return_value = SimpleNamespace(
            supabase_url="https://project.supabase.co/",
            supabase_publishable_key="publishable-key",
        )
        returned_profile = {"display_name": "Ada"}
        urlopen.return_value = FakeResponse([returned_profile])

        result = update_rows(
            "profiles",
            {"display_name": "Ada"},
            [
                ("select", "display_name,onboarding_completed_at"),
                ("id", "eq.user-123"),
                ("onboarding_completed_at", "is.null"),
            ],
            "caller-jwt",
        )

        self.assertEqual(result, [returned_profile])
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_method(), "PATCH")
        self.assertEqual(
            request.full_url,
            "https://project.supabase.co/rest/v1/profiles?"
            "select=display_name,onboarding_completed_at&"
            "id=eq.user-123&onboarding_completed_at=is.null",
        )
        self.assertEqual(json.loads(request.data), {"display_name": "Ada"})
        self.assertEqual(request.get_header("Authorization"), "Bearer caller-jwt")
        self.assertEqual(request.get_header("Apikey"), "publishable-key")
        self.assertEqual(request.get_header("Prefer"), "return=representation")
        urlopen.assert_called_once_with(request, timeout=10)

    @patch("app.db.supabase.urlopen")
    @patch("app.db.supabase.get_settings")
    def test_patch_rejects_an_unexpected_data_api_response(self, get_settings, urlopen) -> None:
        get_settings.return_value = SimpleNamespace(
            supabase_url="https://project.supabase.co",
            supabase_publishable_key="publishable-key",
        )
        urlopen.return_value = FakeResponse({"message": "unexpected"})

        with self.assertRaises(SupabaseDataError):
            update_rows(
                "profiles",
                {"display_name": "Ada"},
                [("id", "eq.user-123")],
                "caller-jwt",
            )


if __name__ == "__main__":
    unittest.main()
