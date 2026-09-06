import datetime
import unittest
from unittest.mock import patch
from uuid import UUID

from app.contracts import (
    PlannedExercise,
    PlannedExerciseSet,
    PlannedWorkout,
    PlannedWorkoutPlan,
    WorkoutRecord,
)
from app.db.supabase.messages import get_recent_messages
from app.db.supabase.onboarding_responses import save_onboarding_response
from app.db.supabase.planning_changes import (
    get_recent_planning_changes,
    rollback_planning_change,
)
from app.db.supabase.profiles import get_profile, update_profile
from app.db.supabase.sports_workouts import get_sports_workouts_in_range
from app.db.supabase.workouts import (
    get_planned_workouts_for_replanning,
    get_workouts_in_range,
    replace_planned_workouts,
)


USER_ID = "11111111-1111-4111-8111-111111111111"
CHANGE_ID = "22222222-2222-4222-8222-222222222222"
WORKOUT_ID = "33333333-3333-4333-8333-333333333333"
ROLLBACK_ID = "44444444-4444-4444-8444-444444444444"
NOW = "2026-09-02T12:00:00Z"


def workout_row() -> dict:
    return {
        "id": WORKOUT_ID,
        "user_id": USER_ID,
        "created_by_change_id": CHANGE_ID,
        "scheduled_date": "2026-09-03",
        "name": "strength",
        "created_at": NOW,
        "updated_at": NOW,
        "exercises": [],
    }


def planned_workout_plan() -> PlannedWorkoutPlan:
    return PlannedWorkoutPlan(
        workouts=[
            PlannedWorkout(
                scheduled_date=datetime.date(2026, 9, 3),
                name="strength",
                exercises=[
                    PlannedExercise(
                        name="squat",
                        sets=[PlannedExerciseSet(planned_reps=5, planned_rpe=7)],
                    )
                ],
            )
        ]
    )


class ProfileQueryTests(unittest.TestCase):
    @patch("app.db.supabase.profiles.select_rows")
    def test_get_profile_scopes_by_user(self, select_rows) -> None:
        select_rows.return_value = [
            {
                "id": USER_ID,
                "timezone": "UTC",
                "created_at": NOW,
                "updated_at": NOW,
            }
        ]

        profile = get_profile(USER_ID, "token")

        self.assertEqual(str(profile.id), USER_ID)
        self.assertIn(("id", f"eq.{USER_ID}"), select_rows.call_args.args[1])

    def test_profile_update_rejects_unknown_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid profile update fields"):
            update_profile(USER_ID, {"user_id": "other"}, "token")


class OnboardingQueryTests(unittest.TestCase):
    @patch("app.db.supabase.onboarding_responses.upsert_rows")
    def test_save_onboarding_replaces_json_answers(self, upsert_rows) -> None:
        completed_at = datetime.datetime(2026, 9, 2, tzinfo=datetime.UTC)
        upsert_rows.return_value = [
            {
                "user_id": USER_ID,
                "answers": {"goal": "hybrid"},
                "completed_at": completed_at.isoformat(),
                "created_at": NOW,
                "updated_at": NOW,
            }
        ]

        response = save_onboarding_response(
            USER_ID,
            "token",
            {"goal": "hybrid"},
            completed_at=completed_at,
        )

        self.assertEqual(response.answers, {"goal": "hybrid"})
        self.assertEqual(upsert_rows.call_args.args[1]["completed_at"], completed_at.isoformat())


class WorkoutQueryTests(unittest.TestCase):
    @patch("app.db.supabase.workouts.select_rows")
    def test_calendar_returns_only_unsuperseded_workouts(self, select_rows) -> None:
        select_rows.return_value = [workout_row()]

        workouts = get_workouts_in_range(
            USER_ID,
            "token",
            datetime.date(2026, 9, 1),
            datetime.date(2026, 9, 7),
        )

        params = select_rows.call_args.args[1]
        self.assertEqual(str(workouts[0].id), WORKOUT_ID)
        self.assertIn(("superseded_at", "is.null"), params)
        self.assertIn(("order", "scheduled_date.asc,id.asc"), params)

    @patch("app.db.supabase.workouts.select_rows")
    def test_replanning_selects_replaceable_workouts(self, select_rows) -> None:
        select_rows.return_value = [workout_row()]

        get_planned_workouts_for_replanning(
            USER_ID,
            "token",
            datetime.date(2026, 9, 3),
            datetime.date(2026, 9, 9),
        )

        params = select_rows.call_args.args[1]
        self.assertIn(("user_id", f"eq.{USER_ID}"), params)
        self.assertIn(("status", "eq.planned"), params)
        self.assertIn(("superseded_at", "is.null"), params)

    @patch("app.db.supabase.workouts.call_rpc")
    def test_replacement_uses_atomic_rpc(self, call_rpc) -> None:
        call_rpc.return_value = {
            "change_id": CHANGE_ID,
            "workout_ids": [WORKOUT_ID],
        }

        result = replace_planned_workouts(
            "token",
            UUID(CHANGE_ID),
            "sports workout added",
            datetime.date(2026, 9, 3),
            datetime.date(2026, 9, 9),
            [WorkoutRecord.model_validate(workout_row())],
            planned_workout_plan(),
        )

        self.assertEqual(str(result.change_id), CHANGE_ID)
        self.assertEqual(call_rpc.call_args.args[0], "replace_planned_workouts")
        payload = call_rpc.call_args.args[1]
        self.assertEqual(payload["p_reason"], "sports workout added")
        self.assertEqual(payload["p_expected_workout_ids"], [WORKOUT_ID])
        self.assertEqual(payload["p_workouts"][0]["scheduled_date"], "2026-09-03")
        self.assertEqual(
            payload["p_workouts"][0]["exercises"][0]["sets"][0]["planned_reps"],
            5,
        )


class PlanningChangeQueryTests(unittest.TestCase):
    @patch("app.db.supabase.planning_changes.select_rows")
    def test_recent_changes_are_scoped_by_user(self, select_rows) -> None:
        select_rows.return_value = [
            {
                "id": CHANGE_ID,
                "user_id": USER_ID,
                "reason": "sports workout added",
                "effective_from": "2026-09-03",
                "horizon_end": "2026-09-09",
                "created_at": NOW,
            }
        ]

        changes = get_recent_planning_changes(USER_ID, "token")

        self.assertEqual(changes[0].reason, "sports workout added")
        self.assertIn(("user_id", f"eq.{USER_ID}"), select_rows.call_args.args[1])

    @patch("app.db.supabase.planning_changes.call_rpc")
    def test_rollback_uses_atomic_rpc(self, call_rpc) -> None:
        call_rpc.return_value = {
            "change_id": ROLLBACK_ID,
            "workout_ids": [WORKOUT_ID],
        }

        result = rollback_planning_change(
            "token",
            UUID(CHANGE_ID),
            UUID(ROLLBACK_ID),
            "restore previous schedule",
        )

        self.assertEqual(str(result.change_id), ROLLBACK_ID)
        self.assertEqual(call_rpc.call_args.args[0], "rollback_planning_change")
        self.assertEqual(call_rpc.call_args.args[1]["p_change_id"], CHANGE_ID)


class SportsWorkoutQueryTests(unittest.TestCase):
    @patch("app.db.supabase.sports_workouts.select_rows")
    def test_sports_range_excludes_cancelled_rows(self, select_rows) -> None:
        select_rows.return_value = [
            {
                "id": WORKOUT_ID,
                "user_id": USER_ID,
                "sport": "soccer",
                "scheduled_date": "2026-09-04",
                "created_at": NOW,
                "updated_at": NOW,
            }
        ]

        workouts = get_sports_workouts_in_range(
            USER_ID,
            "token",
            datetime.date(2026, 9, 1),
            datetime.date(2026, 9, 7),
        )

        self.assertEqual(workouts[0].sport, "soccer")
        self.assertIn(("status", "neq.cancelled"), select_rows.call_args.args[1])


class MessageQueryTests(unittest.TestCase):
    @patch("app.db.supabase.messages.select_rows")
    def test_recent_messages_are_returned_oldest_first(self, select_rows) -> None:
        newest = {
            "id": "55555555-5555-4555-8555-555555555555",
            "user_id": USER_ID,
            "role": "assistant",
            "content": "new",
            "created_at": "2026-09-02T12:01:00Z",
        }
        oldest = {
            **newest,
            "id": "66666666-6666-4666-8666-666666666666",
            "role": "user",
            "content": "old",
            "created_at": NOW,
        }
        select_rows.return_value = [newest, oldest]

        messages = get_recent_messages(USER_ID, "token", limit=2)

        self.assertEqual([message.content for message in messages], ["old", "new"])
        self.assertIn(("order", "created_at.desc,id.desc"), select_rows.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
