import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routers import onboarding, profile
from app.auth.supabase import AuthUser, require_user
from app.contracts import ProfileRecord
from app.db.supabase import SupabaseDataError


USER = AuthUser(id="11111111-1111-4111-8111-111111111111", email="athlete@example.invalid", access_token="caller-jwt")
NOW = "2026-09-14T12:00:00Z"
PROFILE = ProfileRecord(id=USER.id, email=USER.email, display_name="Ada", timezone="UTC", created_at=NOW, updated_at=NOW)


def api_client(authenticated=True):
    app = FastAPI()
    app.include_router(profile.router)
    app.include_router(onboarding.router)
    if authenticated:
        app.dependency_overrides[require_user] = lambda: USER
    return TestClient(app)


class ProfileRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = api_client()
        self.addCleanup(self.client.close)

    @patch("app.api.routers.profile.profiles.get_profile", return_value=PROFILE)
    def test_get_uses_authenticated_handler_and_private_cache(self, handler):
        response = self.client.get("/profile")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), PROFILE.model_dump(mode="json"))
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        handler.assert_called_once_with(USER.id, USER.access_token)

    @patch("app.api.routers.profile.profiles.update_profile", return_value=PROFILE)
    def test_patch_normalizes_name_and_preserves_omitted_fields(self, handler):
        response = self.client.patch("/profile", json={"display_name": "  Ada  "})
        self.assertEqual(response.status_code, 200)
        owner, values, token = handler.call_args.args
        self.assertEqual((owner, token), (USER.id, USER.access_token))
        self.assertEqual(values.model_dump(exclude_unset=True), {"display_name": "Ada"})

    @patch("app.api.routers.profile.profiles.update_profile", return_value=PROFILE)
    def test_patch_allows_clearing_name_and_valid_timezone(self, handler):
        response = self.client.patch("/profile", json={"display_name": None, "timezone": "America/New_York"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(handler.call_args.args[1].model_dump(exclude_unset=True),
                         {"display_name": None, "timezone": "America/New_York"})

    @patch("app.api.routers.profile.profiles.update_profile")
    def test_invalid_patch_never_reaches_handler(self, handler):
        for payload in ({}, {"timezone": None}, {"timezone": "not/a/zone"}, {"display_name": "   "},
                        {"display_name": "x" * 61}, {"user_id": USER.id}, {"email": "other@example.invalid"},
                        {"primary_goal": "strength"}, {"onboarding_completed_at": NOW}):
            with self.subTest(payload=payload):
                self.assertEqual(self.client.patch("/profile", json=payload).status_code, 422)
        handler.assert_not_called()

    @patch("app.api.routers.profile.profiles.get_profile", return_value=None)
    @patch("app.api.routers.profile.profiles.update_profile", return_value=None)
    def test_missing_profile_is_not_recreated(self, update, get):
        self.assertEqual(self.client.get("/profile").status_code, 404)
        self.assertEqual(self.client.patch("/profile", json={"display_name": "Ada"}).status_code, 404)

    @patch("app.api.routers.profile.profiles.get_profile")
    def test_upstream_errors_are_sanitized(self, handler):
        for upstream, expected in ((None, 502), (500, 502), (400, 502), (401, 401), (403, 403), (409, 409)):
            with self.subTest(status=upstream):
                handler.side_effect = SupabaseDataError("private-database-detail", status_code=upstream)
                response = self.client.get("/profile")
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("private-database-detail", response.text)
                self.assertEqual(response.headers["cache-control"], "private, no-store")
                if expected == 401:
                    self.assertEqual(response.headers["www-authenticate"], "Bearer")

    @patch("app.api.routers.profile.profiles.get_profile")
    def test_malformed_database_record_is_not_a_client_validation_error(self, handler):
        try:
            ProfileRecord.model_validate({})
        except ValidationError as exc:
            handler.side_effect = exc
        response = self.client.get("/profile")
        self.assertEqual(response.status_code, 502)

    def test_routes_require_authentication(self):
        with api_client(authenticated=False) as client:
            for method, path, body in (("get", "/profile", None), ("patch", "/profile", {"display_name": "Ada"}),
                                       ("get", "/onboarding", None), ("put", "/onboarding", {"answers": {}}),
                                       ("post", "/onboarding/complete", None)):
                with self.subTest(path=path, method=method):
                    response = client.request(method, path, json=body)
                    self.assertEqual(response.status_code, 401)
                    self.assertEqual(response.headers["www-authenticate"], "Bearer")

    def test_old_profile_mutation_routes_are_removed(self):
        self.assertEqual(self.client.post("/profile").status_code, 405)
        self.assertEqual(self.client.post("/profile/onboarding/complete").status_code, 404)


if __name__ == "__main__":
    unittest.main()
