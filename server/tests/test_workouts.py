import datetime
import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import workouts
from app.auth.supabase import AuthUser, require_user
from app.db.supabase import SupabaseDataError


USER = AuthUser(id="user-123", email="athlete@example.com", access_token="caller-jwt")
WORKOUT_ID = "11111111-1111-4111-8111-111111111111"
EXERCISE_ID = "22222222-2222-4222-8222-222222222222"
COMPLETED_AT = "2026-08-17T21:45:00+00:00"
PENDING_EXERCISE_ROW = {
    "id": EXERCISE_ID,
    "workout_id": WORKOUT_ID,
    "scheduled_date": "2026-08-17",
    "order_index": 0,
    "name": "Back squat",
    "sets": 4,
    "reps": "5",
    "duration": None,
    "rest": "90 seconds",
    "notes": None,
    "metadata": {},
    "completed_at": None,
}
WORKOUT_ROW = {
    "id": WORKOUT_ID,
    "title": "Lower body",
    "goal": "Strength",
    "notes": None,
}
WORKOUT_RESPONSE = {
    "id": WORKOUT_ID,
    "scheduled_date": "2026-08-17",
    "title": "Lower body",
    "goal": "Strength",
    "notes": None,
    "exercises": [
        {
            key: value
            for key, value in PENDING_EXERCISE_ROW.items()
            if key != "scheduled_date"
        }
    ],
}


def authenticated_client() -> TestClient:
    app = FastAPI()
    app.include_router(workouts.router)
    app.dependency_overrides[require_user] = lambda: USER
    return TestClient(app)


class WorkoutRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = authenticated_client()

    @patch("app.api.routers.workouts.select_rows")
    def test_range_returns_persisted_exercises_with_inclusive_filters(self, select_rows) -> None:
        select_rows.side_effect = [
            [PENDING_EXERCISE_ROW],
            [PENDING_EXERCISE_ROW],
            [WORKOUT_ROW],
        ]

        response = self.client.get(
            "/workouts",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [WORKOUT_RESPONSE])
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(select_rows.call_count, 3)
        self.assertEqual(
            select_rows.call_args_list[0].args,
            (
                "exercises",
                workouts._range_query(
                    datetime.date(2026, 8, 1),
                    datetime.date(2026, 8, 31),
                    limit=workouts.MAX_RANGE_EXERCISES,
                    offset=0,
                ),
                USER.access_token,
            ),
        )
        self.assertEqual(
            select_rows.call_args_list[1].args,
            (
                "exercises",
                workouts._all_exercises_query(
                    [UUID(WORKOUT_ID)],
                    limit=workouts.MAX_RANGE_EXERCISES,
                    offset=0,
                ),
                USER.access_token,
            ),
        )
        self.assertEqual(
            select_rows.call_args_list[2].args,
            (
                "workouts",
                [
                    ("select", workouts.WORKOUT_COLUMNS),
                    ("id", f"in.({WORKOUT_ID})"),
                    ("order", "id.asc"),
                    ("limit", "1"),
                ],
                USER.access_token,
            ),
        )

    @patch("app.api.routers.workouts.select_rows", return_value=[])
    def test_empty_range_avoids_workout_metadata_query(self, select_rows) -> None:
        response = self.client.get(
            "/workouts/",
            params={
                "start_date": "2026-08-17",
                "end_date": "2026-08-17",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])
        self.assertEqual(select_rows.call_count, 1)

    @patch("app.api.routers.workouts.select_rows")
    def test_range_rejects_invalid_dates_and_span(self, select_rows) -> None:
        invalid_queries = (
            {},
            {"start_date": "2026-08-18", "end_date": "2026-08-17"},
            {"start_date": "2026-01-01", "end_date": "2027-01-02"},
            {"start_date": "not-a-date", "end_date": "2026-08-17"},
        )

        for params in invalid_queries:
            with self.subTest(params=params):
                response = self.client.get("/workouts/", params=params)
                self.assertEqual(response.status_code, 422)

        select_rows.assert_not_called()

    @patch("app.api.routers.workouts.select_rows")
    def test_range_rejects_results_that_exceed_safe_response_size(self, select_rows) -> None:
        select_rows.side_effect = [
            [PENDING_EXERCISE_ROW] * workouts.MAX_RANGE_EXERCISES,
            [PENDING_EXERCISE_ROW],
        ]

        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(),
            {"detail": "Workout range contains too many exercises; narrow the date range"},
        )
        self.assertEqual(select_rows.call_count, 2)

    @patch("app.api.routers.workouts.select_rows")
    def test_range_rejects_complete_workout_that_exceeds_safe_response_size(
        self,
        select_rows,
    ) -> None:
        select_rows.side_effect = [
            [PENDING_EXERCISE_ROW],
            [PENDING_EXERCISE_ROW] * workouts.MAX_RANGE_EXERCISES,
            [PENDING_EXERCISE_ROW],
        ]

        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(),
            {"detail": "Workout range contains too many exercises; narrow the date range"},
        )
        self.assertEqual(select_rows.call_count, 3)

    @patch(
        "app.api.routers.workouts.select_rows",
        side_effect=SupabaseDataError("database-secret-detail"),
    )
    def test_range_supabase_failure_is_sanitized(self, select_rows) -> None:
        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Workout range load failed"})
        self.assertNotIn("database-secret-detail", response.text)

    @patch("app.api.routers.workouts.select_rows")
    def test_range_metadata_failure_is_sanitized(self, select_rows) -> None:
        select_rows.side_effect = [
            [PENDING_EXERCISE_ROW],
            [PENDING_EXERCISE_ROW],
            SupabaseDataError("database-secret-detail"),
        ]

        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Workout range load failed"})
        self.assertNotIn("database-secret-detail", response.text)

    @patch(
        "app.api.routers.workouts.select_rows",
        return_value=[{"workout_id": WORKOUT_ID}],
    )
    def test_range_rejects_invalid_database_rows(self, select_rows) -> None:
        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Workout data is invalid"})

    @patch("app.api.routers.workouts.select_rows")
    def test_range_rejects_mixed_dates_outside_the_requested_range(self, select_rows) -> None:
        second_exercise = {
            **PENDING_EXERCISE_ROW,
            "id": "33333333-3333-4333-8333-333333333333",
            "scheduled_date": "2026-08-18",
            "order_index": 1,
        }
        select_rows.side_effect = [
            [PENDING_EXERCISE_ROW],
            [PENDING_EXERCISE_ROW, second_exercise],
            [WORKOUT_ROW],
        ]

        response = self.client.get(
            "/workouts/",
            params={"start_date": "2026-08-17", "end_date": "2026-08-17"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Workout data is invalid"})

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows")
    def test_completion_sets_server_timestamp_with_atomic_filters(
        self,
        update_rows,
        select_rows,
    ) -> None:
        update_rows.return_value = [
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": COMPLETED_AT,
            }
        ]

        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(
            datetime.datetime.fromisoformat(response.json()["completed_at"]),
            datetime.datetime.fromisoformat(COMPLETED_AT),
        )
        values = update_rows.call_args.args[1]
        generated_at = datetime.datetime.fromisoformat(values["completed_at"])
        self.assertEqual(generated_at.utcoffset(), datetime.timedelta(0))
        update_rows.assert_called_once_with(
            "exercises",
            values,
            [
                ("select", workouts.COMPLETION_COLUMNS),
                ("id", f"eq.{EXERCISE_ID}"),
                ("workout_id", f"eq.{WORKOUT_ID}"),
                ("completed_at", "is.null"),
            ],
            USER.access_token,
        )
        select_rows.assert_not_called()

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_repeated_completion_preserves_first_timestamp(
        self,
        update_rows,
        select_rows,
    ) -> None:
        select_rows.return_value = [
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": COMPLETED_AT,
            }
        ]

        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            datetime.datetime.fromisoformat(response.json()["completed_at"]),
            datetime.datetime.fromisoformat(COMPLETED_AT),
        )
        select_rows.assert_called_once_with(
            "exercises",
            [
                ("select", workouts.COMPLETION_COLUMNS),
                ("id", f"eq.{EXERCISE_ID}"),
                ("workout_id", f"eq.{WORKOUT_ID}"),
                ("limit", "1"),
            ],
            USER.access_token,
        )

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows")
    def test_completion_rejects_mismatched_or_incorrect_update_responses(
        self,
        update_rows,
        select_rows,
    ) -> None:
        invalid_rows = (
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "workout_id": WORKOUT_ID,
                "completed_at": COMPLETED_AT,
            },
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": None,
            },
        )

        for invalid_row in invalid_rows:
            with self.subTest(invalid_row=invalid_row):
                update_rows.return_value = [invalid_row]
                response = self.client.patch(
                    f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
                    json={"completed": True},
                )
                self.assertEqual(response.status_code, 502)
                self.assertEqual(
                    response.json(),
                    {"detail": "Exercise completion data is invalid"},
                )

        select_rows.assert_not_called()

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows")
    def test_marking_incomplete_clears_completion(
        self,
        update_rows,
        select_rows,
    ) -> None:
        update_rows.return_value = [
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": None,
            }
        ]

        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": False},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["completed_at"])
        update_rows.assert_called_once_with(
            "exercises",
            {"completed_at": None},
            [
                ("select", workouts.COMPLETION_COLUMNS),
                ("id", f"eq.{EXERCISE_ID}"),
                ("workout_id", f"eq.{WORKOUT_ID}"),
                ("completed_at", "not.is.null"),
            ],
            USER.access_token,
        )
        select_rows.assert_not_called()

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_repeated_mark_incomplete_is_idempotent(
        self,
        update_rows,
        select_rows,
    ) -> None:
        select_rows.return_value = [
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": None,
            }
        ]

        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": False},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["completed_at"])
        self.assertEqual(update_rows.call_count, 1)
        self.assertEqual(select_rows.call_count, 1)

    @patch("app.api.routers.workouts.select_rows", return_value=[])
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_completion_hides_missing_mismatched_and_unowned_rows(
        self,
        update_rows,
        select_rows,
    ) -> None:
        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Exercise not found"})

    @patch(
        "app.api.routers.workouts.select_rows",
        return_value=[
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "workout_id": WORKOUT_ID,
                "completed_at": COMPLETED_AT,
            }
        ],
    )
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_completion_rejects_mismatched_fallback_response(
        self,
        update_rows,
        select_rows,
    ) -> None:
        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {"detail": "Exercise completion data is invalid"},
        )

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_completion_returns_conflict_after_opposing_state_races(
        self,
        update_rows,
        select_rows,
    ) -> None:
        select_rows.return_value = [
            {
                "id": EXERCISE_ID,
                "workout_id": WORKOUT_ID,
                "completed_at": None,
            }
        ]

        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(update_rows.call_count, 2)
        self.assertEqual(select_rows.call_count, 2)

    @patch("app.api.routers.workouts.select_rows")
    @patch("app.api.routers.workouts.update_rows")
    def test_completion_rejects_invalid_requests_without_database_calls(
        self,
        update_rows,
        select_rows,
    ) -> None:
        invalid_payloads = (
            {},
            {"completed": "true"},
            {"completed": 1},
            {"completed": None},
            {"completed": True, "completed_at": COMPLETED_AT},
        )
        path = f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion"

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.patch(path, json=payload)
                self.assertEqual(response.status_code, 422)

        response = self.client.patch(
            f"/workouts/not-a-uuid/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )
        self.assertEqual(response.status_code, 422)
        update_rows.assert_not_called()
        select_rows.assert_not_called()

    @patch("app.api.routers.workouts.select_rows")
    @patch(
        "app.api.routers.workouts.update_rows",
        side_effect=SupabaseDataError("database-secret-detail"),
    )
    def test_completion_supabase_failure_is_sanitized(
        self,
        update_rows,
        select_rows,
    ) -> None:
        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {"detail": "Exercise completion update failed"},
        )
        self.assertNotIn("database-secret-detail", response.text)

    @patch(
        "app.api.routers.workouts.select_rows",
        side_effect=SupabaseDataError("database-secret-detail"),
    )
    @patch("app.api.routers.workouts.update_rows", return_value=[])
    def test_completion_fallback_failure_is_sanitized(
        self,
        update_rows,
        select_rows,
    ) -> None:
        response = self.client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {"detail": "Exercise completion update failed"},
        )
        self.assertNotIn("database-secret-detail", response.text)

    def test_workout_routes_require_authentication(self) -> None:
        app = FastAPI()
        app.include_router(workouts.router)
        client = TestClient(app)

        range_response = client.get(
            "/workouts/",
            params={"start_date": "2026-08-01", "end_date": "2026-08-31"},
        )
        completion_response = client.patch(
            f"/workouts/{WORKOUT_ID}/exercises/{EXERCISE_ID}/completion",
            json={"completed": True},
        )

        self.assertEqual(range_response.status_code, 401)
        self.assertEqual(range_response.headers["www-authenticate"], "Bearer")
        self.assertEqual(completion_response.status_code, 401)
        self.assertEqual(completion_response.headers["www-authenticate"], "Bearer")


if __name__ == "__main__":
    unittest.main()
