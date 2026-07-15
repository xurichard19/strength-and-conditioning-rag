import datetime
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import profile
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError


USER = AuthUser(id="user-123", email="athlete@example.com", access_token="caller-jwt")
INCOMPLETE_PROFILE = {
    "display_name": None,
    "primary_goal": None,
    "experience_level": None,
    "training_days_per_week": None,
    "session_duration_minutes": None,
    "equipment_access": None,
    "onboarding_completed_at": None,
}
COMPLETE_ANSWERS = {
    "display_name": "Ada",
    "primary_goal": "balanced_hybrid",
    "experience_level": "intermediate",
    "training_days_per_week": 4,
    "session_duration_minutes": 60,
    "equipment_access": "full_gym",
    "onboarding_completed_at": None,
}


def authenticated_client() -> TestClient:
    app = FastAPI()
    app.include_router(profile.router)
    app.dependency_overrides[require_user] = lambda: USER
    return TestClient(app)


class ProfileRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = authenticated_client()

    @patch("app.api.routers.profile.select_rows", return_value=[INCOMPLETE_PROFILE])
    def test_get_returns_only_authenticated_users_profile(self, select_rows) -> None:
        response = self.client.get("/profile/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), INCOMPLETE_PROFILE)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        select_rows.assert_called_once_with(
            "profiles",
            [
                ("select", profile.PROFILE_COLUMNS),
                ("id", f"eq.{USER.id}"),
                ("limit", "1"),
            ],
            USER.access_token,
        )

    @patch("app.api.routers.profile.upsert_rows")
    @patch(
        "app.api.routers.profile.select_rows",
        side_effect=[[], [INCOMPLETE_PROFILE]],
    )
    def test_get_recreates_an_unexpectedly_missing_profile(self, select_rows, upsert_rows) -> None:
        response = self.client.get("/profile/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(select_rows.call_count, 2)
        upsert_rows.assert_called_once_with(
            "profiles",
            {"id": USER.id, "email": USER.email},
            USER.access_token,
            on_conflict="id",
        )

    @patch("app.api.routers.profile.update_rows")
    def test_patch_updates_only_allowed_fields_for_the_authenticated_user(self, update_rows) -> None:
        updated_profile = {**INCOMPLETE_PROFILE, "display_name": "Ada"}
        update_rows.return_value = [updated_profile]

        response = self.client.patch("/profile/", json={"display_name": "  Ada  "})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["display_name"], "Ada")
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        update_rows.assert_called_once_with(
            "profiles",
            {"display_name": "Ada"},
            [
                ("select", profile.PROFILE_COLUMNS),
                ("id", f"eq.{USER.id}"),
            ],
            USER.access_token,
        )

    @patch("app.api.routers.profile.update_rows")
    def test_patch_rejects_empty_null_invalid_and_unwritable_fields(self, update_rows) -> None:
        invalid_payloads = (
            {},
            {"primary_goal": None},
            {"training_days_per_week": 1},
            {"onboarding_completed_at": "2026-07-14T12:00:00Z"},
            {"id": "another-user"},
        )

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.patch("/profile/", json=payload)
                self.assertEqual(response.status_code, 422)

        update_rows.assert_not_called()

    @patch("app.api.routers.profile.upsert_rows")
    @patch("app.api.routers.profile.update_rows")
    def test_patch_recovers_when_the_profile_row_is_missing(self, update_rows, upsert_rows) -> None:
        updated_profile = {**INCOMPLETE_PROFILE, "training_days_per_week": 4}
        update_rows.side_effect = [[], [updated_profile]]

        response = self.client.patch("/profile/", json={"training_days_per_week": 4})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(update_rows.call_count, 2)
        upsert_rows.assert_called_once_with(
            "profiles",
            {"id": USER.id, "email": USER.email},
            USER.access_token,
            on_conflict="id",
        )

    @patch("app.api.routers.profile.update_rows")
    @patch("app.api.routers.profile.select_rows", return_value=[INCOMPLETE_PROFILE])
    def test_completion_rejects_missing_answers(self, select_rows, update_rows) -> None:
        response = self.client.post("/profile/onboarding/complete")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["detail"],
            "Complete every onboarding question before continuing.",
        )
        update_rows.assert_not_called()

    @patch("app.api.routers.profile.update_rows")
    @patch("app.api.routers.profile.select_rows")
    def test_completion_is_idempotent_and_preserves_the_first_timestamp(
        self,
        select_rows,
        update_rows,
    ) -> None:
        original_timestamp = "2026-07-14T12:00:00+00:00"
        select_rows.return_value = [
            {**COMPLETE_ANSWERS, "onboarding_completed_at": original_timestamp}
        ]

        response = self.client.post("/profile/onboarding/complete")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            datetime.datetime.fromisoformat(response.json()["onboarding_completed_at"]),
            datetime.datetime.fromisoformat(original_timestamp),
        )
        update_rows.assert_not_called()

    @patch("app.api.routers.profile.update_rows")
    @patch("app.api.routers.profile.select_rows", return_value=[COMPLETE_ANSWERS])
    def test_completion_sets_a_server_utc_timestamp_with_an_atomic_null_filter(
        self,
        select_rows,
        update_rows,
    ) -> None:
        completed_profile = {
            **COMPLETE_ANSWERS,
            "onboarding_completed_at": "2026-07-14T13:30:00+00:00",
        }
        update_rows.return_value = [completed_profile]

        response = self.client.post("/profile/onboarding/complete")

        self.assertEqual(response.status_code, 200)
        values = update_rows.call_args.args[1]
        generated_at = datetime.datetime.fromisoformat(values["onboarding_completed_at"])
        self.assertEqual(generated_at.utcoffset(), datetime.timedelta(0))
        update_rows.assert_called_once_with(
            "profiles",
            values,
            [
                ("select", profile.PROFILE_COLUMNS),
                ("id", f"eq.{USER.id}"),
                ("onboarding_completed_at", "is.null"),
            ],
            USER.access_token,
        )

    @patch("app.api.routers.profile.upsert_rows")
    @patch("app.api.routers.profile.update_rows", return_value=[])
    @patch("app.api.routers.profile.select_rows")
    def test_concurrent_completion_returns_the_existing_completed_profile(
        self,
        select_rows,
        update_rows,
        upsert_rows,
    ) -> None:
        completed_profile = {
            **COMPLETE_ANSWERS,
            "onboarding_completed_at": "2026-07-14T13:30:00+00:00",
        }
        select_rows.side_effect = [[COMPLETE_ANSWERS], [completed_profile]]

        response = self.client.post("/profile/onboarding/complete")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            datetime.datetime.fromisoformat(response.json()["onboarding_completed_at"]),
            datetime.datetime.fromisoformat(completed_profile["onboarding_completed_at"]),
        )
        upsert_rows.assert_not_called()

    @patch(
        "app.api.routers.profile.update_rows",
        side_effect=SupabaseDataError("database-secret-detail"),
    )
    def test_patch_supabase_failures_are_sanitized(self, update_rows) -> None:
        response = self.client.patch("/profile/", json={"display_name": "Ada"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Profile update failed"})
        self.assertNotIn("database-secret-detail", response.text)

    @patch(
        "app.api.routers.profile.select_rows",
        side_effect=SupabaseDataError("database-secret-detail"),
    )
    def test_supabase_failures_are_sanitized(self, select_rows) -> None:
        response = self.client.get("/profile/")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Profile load failed"})
        self.assertNotIn("database-secret-detail", response.text)

    def test_profile_routes_require_authentication(self) -> None:
        app = FastAPI()
        app.include_router(profile.router)
        client = TestClient(app)

        response = client.get("/profile/")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["www-authenticate"], "Bearer")


if __name__ == "__main__":
    unittest.main()
