import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import calendar, workouts
from app.auth.supabase import require_user
from app.contracts import CalendarSnapshot, WorkoutRecord, WorkoutSnapshot
from app.db.supabase import SupabaseDataError
from server.tests.test_profile import USER, NOW


ID = UUID("22222222-2222-4222-8222-222222222222")
WORKOUT = WorkoutRecord(id=ID, user_id=USER.id, created_by_change_id=ID, scheduled_date="2026-09-14",
    name="strength", exercises=[], created_at=NOW, updated_at=NOW)


class WorkoutRouteTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(calendar.router)
        app.include_router(workouts.router)
        app.dependency_overrides[require_user] = lambda: USER
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    @patch("app.api.routers.calendar.calendar.get_calendar_snapshot")
    def test_calendar_has_revision_and_current_data(self, handler):
        handler.return_value = CalendarSnapshot(workouts=[WORKOUT], sports_workouts=[], revision=4)
        response = self.client.get("/calendar?start_date=2026-09-14&end_date=2026-09-20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision"], 4)
        self.assertEqual(response.json()["workouts"][0]["name"], "strength")
        self.assertEqual(handler.call_args.args[0], USER.id)
        self.assertEqual(handler.call_args.args[-1], USER.access_token)
        self.assertEqual(response.headers["cache-control"], "private, no-store")

    @patch("app.api.routers.calendar.calendar.get_calendar_snapshot")
    def test_invalid_range_does_not_query(self, handler):
        for query in ("start_date=2026-09-20&end_date=2026-09-14",
                      "start_date=2020-01-01&end_date=2026-09-14", "start_date=bad&end_date=2026-09-14"):
            self.assertEqual(self.client.get("/calendar?" + query).status_code, 422)
        handler.assert_not_called()

    @patch("app.api.routers.calendar.calendar.get_calendar_snapshot")
    def test_calendar_preloads_at_most_31_inclusive_dates(self, handler):
        handler.return_value = CalendarSnapshot(workouts=[], sports_workouts=[], revision=None)
        self.assertEqual(self.client.get('/calendar?start_date=2026-10-01&end_date=2026-10-31').status_code, 200)
        handler.reset_mock()
        self.assertEqual(self.client.get('/calendar?start_date=2026-10-01&end_date=2026-11-01').status_code, 422)
        handler.assert_not_called()

    @patch("app.api.routers.workouts.workouts.get_workout_snapshot")
    def test_workout_detail_and_missing(self, handler):
        handler.return_value = WorkoutSnapshot(workout=WORKOUT, revision=4)
        response = self.client.get(f"/workouts/{ID}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision"], 4)
        handler.assert_called_once_with(USER.id, ID, USER.access_token)
        handler.return_value = None
        self.assertEqual(self.client.get(f"/workouts/{ID}").status_code, 404)

    @patch("app.api.routers.workouts.workouts.record_workout_results", return_value=5)
    def test_results_go_through_atomic_handler(self, handler):
        response = self.client.put(f"/workouts/{ID}/results", json={"expected_revision": 4, "status": "in_progress",
            "sets": [{"id": str(ID), "actual_reps": 5, "result_status": "completed"}]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"revision": 5})
        self.assertEqual(handler.call_args.args[:4], (USER.id, ID, 4, "in_progress"))
        self.assertIsNone(handler.call_args.args[4][0].actual_weight)

    @patch("app.api.routers.workouts.workouts.record_workout_results")
    def test_results_validate_revision_status_and_unique_sets(self, handler):
        for body in ({"status": "completed"}, {"expected_revision": -1, "status": "completed"},
                     {"expected_revision": 1, "status": "missed"},
                     {"expected_revision": 1, "status": "planned", "user_id": USER.id},
                     {"expected_revision": 1, "status": "planned", "sets": [{"id": str(ID)}, {"id": str(ID)}]}):
            self.assertEqual(self.client.put(f"/workouts/{ID}/results", json=body).status_code, 422)
        handler.assert_not_called()

    @patch("app.api.routers.workouts.workouts.record_workout_results",
           side_effect=SupabaseDataError("private conflict details", 409, "PT409"))
    def test_stale_revision_is_conflict_not_gateway_failure(self, handler):
        response = self.client.put(f"/workouts/{ID}/results", json={"expected_revision": 1, "status": "completed"})
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("private conflict details", response.text)


if __name__ == "__main__":
    unittest.main()
