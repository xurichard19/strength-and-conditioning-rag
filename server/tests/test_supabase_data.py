import json
import unittest
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch

from app.db.supabase.transport import (
    SupabaseDataError,
    call_rpc,
    delete_rows,
    insert_rows,
    select_rows,
    update_rows,
    upsert_rows,
)


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
    @patch("app.db.supabase.transport.urlopen")
    @patch("app.db.supabase.transport.settings")
    def test_patch_request_forwards_caller_auth_and_returns_representation(
        self,
        settings,
        urlopen,
    ) -> None:
        settings.supabase_url = "https://project.supabase.co/"
        settings.supabase_publishable_key = "publishable-key"
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

    @patch("app.db.supabase.transport.urlopen")
    @patch("app.db.supabase.transport.settings")
    def test_patch_rejects_an_unexpected_data_api_response(self, settings, urlopen) -> None:
        settings.supabase_url = "https://project.supabase.co"
        settings.supabase_publishable_key = "publishable-key"
        urlopen.return_value = FakeResponse({"message": "unexpected"})

        with self.assertRaises(SupabaseDataError):
            update_rows(
                "profiles",
                {"display_name": "Ada"},
                [("id", "eq.user-123")],
                "caller-jwt",
            )


class TransportTests(unittest.TestCase):
    @patch("app.db.supabase.transport.urlopen")
    @patch("app.db.supabase.transport.settings")
    def test_rpc_uses_rpc_path(self, settings, urlopen) -> None:
        settings.supabase_url = "https://project.supabase.co"
        settings.supabase_publishable_key = "publishable-key"
        urlopen.return_value = FakeResponse({"status": "applied"})

        result = call_rpc("apply_planning_change", {"id": "123"}, "caller-jwt")

        self.assertEqual(result, {"status": "applied"})
        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://project.supabase.co/rest/v1/rpc/apply_planning_change",
        )

    @patch("app.db.supabase.transport.urlopen")
    @patch("app.db.supabase.transport.settings")
    def test_mutations_return_rows(self, settings, urlopen) -> None:
        settings.supabase_url = "https://project.supabase.co"
        settings.supabase_publishable_key = "publishable-key"
        row = {"id": "123"}
        urlopen.side_effect = [FakeResponse([row]), FakeResponse([row]), FakeResponse([row])]

        self.assertEqual(insert_rows("profiles", row, "caller-jwt"), [row])
        self.assertEqual(upsert_rows("profiles", row, "caller-jwt", "id"), [row])
        self.assertEqual(
            delete_rows("profiles", [("id", "eq.123")], "caller-jwt"),
            [row],
        )

        insert_request, upsert_request, delete_request = [
            call.args[0] for call in urlopen.call_args_list
        ]
        self.assertEqual(insert_request.get_header("Prefer"), "return=representation")
        self.assertEqual(
            upsert_request.get_header("Prefer"),
            "resolution=merge-duplicates,return=representation",
        )
        self.assertEqual(delete_request.get_method(), "DELETE")
        self.assertEqual(delete_request.get_header("Prefer"), "return=representation")

    @patch("app.db.supabase.transport.urlopen")
    @patch("app.db.supabase.transport.settings")
    def test_http_errors_have_structured_fields(self, settings, urlopen) -> None:
        settings.supabase_url = "https://project.supabase.co"
        settings.supabase_publishable_key = "publishable-key"
        urlopen.side_effect = HTTPError(
            "https://project.supabase.co/rest/v1/profiles",
            409,
            "conflict",
            {},
            BytesIO(b'{"message":"Duplicate Row","code":"23505"}'),
        )

        with self.assertRaises(SupabaseDataError) as caught:
            insert_rows("profiles", {"id": "123"}, "caller-jwt")

        self.assertEqual(str(caught.exception), "duplicate row")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.code, "23505")

    @patch("app.db.supabase.transport.urlopen")
    def test_table_and_rpc_names_are_validated(self, urlopen) -> None:
        with self.assertRaisesRegex(ValueError, "invalid supabase resource name"):
            select_rows("../profiles", [], "caller-jwt")
        with self.assertRaisesRegex(ValueError, "invalid supabase resource name"):
            call_rpc("apply-change", {}, "caller-jwt")
        urlopen.assert_not_called()

    def test_update_and_delete_require_filters(self) -> None:
        with self.assertRaisesRegex(ValueError, "update filters are required"):
            update_rows("profiles", {}, [], "caller-jwt")
        with self.assertRaisesRegex(ValueError, "delete filters are required"):
            delete_rows("profiles", [], "caller-jwt")


if __name__ == "__main__":
    unittest.main()
