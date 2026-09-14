import datetime as dt
import json
import re
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from pydantic import SecretStr, ValidationError

from app.contracts import (
    ClaimedReplanJob, ExerciseSetResult, PlannedExercise, PlannedExerciseSet,
    PlannedWorkout, PlannedWorkoutPlan, PlanningChangeRecord, PlanningChangeWorkoutRecord,
    ProfileUpdate, SportsWorkoutUpdate, WorkoutRecord,
)
from app.db.supabase import calendar, messages, onboarding_responses, planning_changes
from app.db.supabase import planning_schedules, profiles, replan_jobs, sports_workouts, workouts
from app.db.supabase.transport import SupabaseDataError
from server.tests.test_supabase_data import FakeResponse


USER = UUID('11111111-1111-4111-8111-111111111111')
JOB = UUID('22222222-2222-4222-8222-222222222222')
WORKOUT = UUID('33333333-3333-4333-8333-333333333333')
TOKEN = UUID('44444444-4444-4444-8444-444444444444')
NOW = dt.datetime(2026, 9, 14, tzinfo=dt.UTC)
DAY = NOW.date()


def job_row():
    return dict(id=str(JOB), user_id=str(USER), kind='adjustment', reason='sleep',
        effective_from=str(DAY), effective_through=str(DAY), deduplication_key='request-1',
        available_at=NOW.isoformat(), created_at=NOW.isoformat(), updated_at=NOW.isoformat())


def workout_row():
    return dict(id=str(WORKOUT), user_id=str(USER), created_by_change_id=str(JOB),
        scheduled_date=str(DAY), name='strength', exercises=[],
        created_at=NOW.isoformat(), updated_at=NOW.isoformat())


def schedule_row(revision=1):
    return dict(user_id=str(USER), horizon_end=str(DAY + dt.timedelta(days=6)),
        revision=revision, next_refresh_at=NOW.isoformat(), created_at=NOW.isoformat(), updated_at=NOW.isoformat())


class HandlerTests(unittest.TestCase):
    def test_planning_contracts_reject_unknown_fields(self):
        for model, payload in (
            (PlannedExerciseSet, {'reps': 5}),
            (PlannedExercise, {'name': 'squat', 'rationale': 'old field'}),
            (PlannedWorkout, {'name': 'strength', 'scheduled_date': DAY, 'exercises': [], 'intent': 'old field'}),
            (PlannedWorkoutPlan, {'workouts': [], 'legacy': True}),
        ):
            with self.subTest(model=model):
                with self.assertRaises(ValidationError):
                    model.model_validate(payload)
        self.assertEqual(PlannedExerciseSet(planned_reps=5).planned_reps, 5)

    def setUp(self):
        self.http = patch('app.db.supabase.transport.urlopen').start()
        self.settings = patch('app.db.supabase.transport.settings').start()
        self.addCleanup(patch.stopall)
        self.settings.supabase_url = 'https://test.invalid'
        self.settings.supabase_publishable_key = 'public-key'
        self.settings.supabase_service_role_key = SecretStr('backend-key')

    def response(self, payload):
        self.http.return_value = FakeResponse(payload)

    def test_all_rpc_handlers_match_migration_arguments_and_backend_auth(self):
        receipt = dict(change_id=str(JOB), workout_ids=[str(WORKOUT)], revision=2)
        claim = dict(job={**job_row(), 'status': 'running', 'expected_revision': 1,
            'lease_token': str(TOKEN), 'lease_expires_at': NOW.isoformat()},
            effective_from=str(DAY), effective_through=str(DAY), horizon_end=str(DAY))
        calls = [
            (lambda: planning_schedules.configure_planning_schedule(USER, NOW), [schedule_row()]),
            (lambda: planning_schedules.invalidate_planning_inputs(USER), 2),
            (lambda: replan_jobs.enqueue_adjustment(USER, 'request-1', 'sleep', DAY, DAY), [job_row()]),
            (lambda: replan_jobs.enqueue_due_replans(), 1),
            (lambda: replan_jobs.claim_replan_job(), claim),
            (lambda: replan_jobs.renew_replan_lease(JOB, TOKEN), NOW.isoformat()),
            (lambda: replan_jobs.fail_replan_job(JOB, TOKEN, 'temporary'), [job_row()]),
            (lambda: replan_jobs.cancel_replan_job(USER, JOB), [job_row()]),
            (lambda: replan_jobs.retry_replan_job(USER, JOB), [job_row()]),
            (lambda: replan_jobs.purge_replan_jobs(NOW), 3),
            (lambda: replan_jobs.complete_replan_job(JOB, TOKEN, [], []), receipt),
            (lambda: planning_changes.undo_planning_change(USER, JOB, 1), receipt),
            (lambda: planning_changes.redo_planning_change(USER, JOB, 1), receipt),
            (lambda: workouts.record_workout_results(USER, WORKOUT, 1, 'in_progress'), 2),
        ]
        migration = (Path(__file__).resolve().parents[2] / 'supabase/migrations/20260903000000_workout_rpcs.sql').read_text()
        for operation, response in calls:
            with self.subTest(operation=operation):
                self.response(response)
                operation()
                request = self.http.call_args.args[0]
                name = request.full_url.rsplit('/', 1)[1]
                signature = re.search(r'function public\.' + name + r'\((.*?)\)\s*returns', migration, re.S).group(1)
                parameters = set(re.findall(r'\bp_\w+', signature))
                self.assertEqual(set(json.loads(request.data)), parameters)
                self.assertEqual(request.get_header('Authorization'), 'Bearer backend-key')
                self.assertEqual(request.get_header('Apikey'), 'backend-key')

    def test_user_read_keeps_caller_jwt_and_explicit_owner(self):
        self.response([workout_row()])
        result = workouts.get_workout(USER, WORKOUT, 'user-jwt')
        request = self.http.call_args.args[0]
        self.assertEqual(result.id, WORKOUT)
        self.assertEqual(request.get_header('Authorization'), 'Bearer user-jwt')
        self.assertEqual(request.get_header('Apikey'), 'public-key')
        self.assertIn('user_id=eq.' + str(USER), request.full_url)
        self.assertIn('superseded_at=is.null', request.full_url)
        self.assertNotIn('superseded_by_change_id', request.full_url)

    def test_backend_key_missing_fails_before_network(self):
        self.settings.supabase_service_role_key = None
        with self.assertRaisesRegex(SupabaseDataError, 'service role key'):
            replan_jobs.claim_replan_job()
        self.http.assert_not_called()

    def test_no_available_job_and_no_change_receipt(self):
        self.response(None)
        self.assertIsNone(replan_jobs.claim_replan_job())
        self.response(dict(change_id=None, workout_ids=[], revision=7))
        receipt = replan_jobs.complete_replan_job(JOB, TOKEN, [], [])
        self.assertIsNone(receipt.change_id)
        self.assertEqual(receipt.revision, 7)

    def test_nested_plan_fields_are_json_serializable(self):
        self.response(dict(change_id=str(JOB), workout_ids=[str(WORKOUT)], revision=2))
        replan_jobs.complete_replan_job(JOB, TOKEN, [WORKOUT], [PlannedWorkout(name='strength',
            scheduled_date=DAY, exercises=[PlannedExercise(name='squat',
                sets=[PlannedExerciseSet(planned_reps=5, planned_weight=40)])])])
        payload = json.loads(self.http.call_args.args[0].data)
        self.assertEqual(payload['p_before_ids'], [str(WORKOUT)])
        self.assertEqual(payload['p_workouts'][0]['scheduled_date'], str(DAY))
        self.assertEqual(payload['p_workouts'][0]['exercises'][0]['sets'][0]['planned_weight'], 40)

    def test_result_update_sends_nulls_to_clear_previous_values(self):
        self.response(3)
        workouts.record_workout_results(USER, WORKOUT, 2, 'in_progress', [ExerciseSetResult(id=TOKEN, actual_reps=5)])
        payload = json.loads(self.http.call_args.args[0].data)['p_sets'][0]
        self.assertEqual(payload['actual_reps'], 5)
        self.assertIn('actual_weight', payload)
        self.assertIsNone(payload['actual_weight'])

    def test_partial_sports_update_preserves_omissions_and_sends_null(self):
        self.response([])
        sports_workouts.update_sports_workout(USER, WORKOUT, SportsWorkoutUpdate(notes=None), 'user-jwt')
        self.assertEqual(json.loads(self.http.call_args.args[0].data), {'notes': None})
        with self.assertRaises(ValidationError):
            SportsWorkoutUpdate(sport=None)

    def test_profile_update_cannot_change_owner_and_validates_timezone(self):
        with self.assertRaises(ValidationError):
            ProfileUpdate(user_id=str(USER))
        with self.assertRaisesRegex(ValueError, 'timezone'):
            profiles.update_profile(USER, ProfileUpdate(timezone='not/a/zone'), 'user-jwt')
        self.http.assert_not_called()

    def test_pagination_continues_after_server_short_pages(self):
        self.http.side_effect = [FakeResponse([workout_row()]), FakeResponse([workout_row()]), FakeResponse([])]
        result = workouts.get_workouts_in_range(USER, DAY, DAY, 'user-jwt', planned_only=True)
        self.assertEqual(len(result), 2)
        urls = [call.args[0].full_url for call in self.http.call_args_list]
        self.assertIn('offset=1', urls[1])
        self.assertTrue(all('status=eq.planned' in url and 'superseded_at=is.null' in url for url in urls))

    def test_invalid_id_and_date_range_do_not_reach_network(self):
        with self.assertRaises(ValueError):
            workouts.get_workout('bad-id', WORKOUT, 'user-jwt')
        with self.assertRaises(ValueError):
            workouts.get_workouts_in_range(USER, DAY, DAY - dt.timedelta(days=1), 'user-jwt')
        self.http.assert_not_called()

    def test_history_cursor_and_message_timestamp_tie(self):
        self.response([])
        planning_changes.get_recent_planning_changes(USER, 'user-jwt', before_revision=12)
        self.assertIn('revision=lt.12', self.http.call_args.args[0].full_url)
        messages.get_recent_messages(USER, 'user-jwt', before_created_at=NOW, before_id=WORKOUT)
        self.assertIn('id.lt.' + str(WORKOUT), self.http.call_args.args[0].full_url)
        self.assertIn('user_id=eq.' + str(USER), self.http.call_args.args[0].full_url)

    def test_context_rejects_revision_change_during_reads(self):
        claim = ClaimedReplanJob(job={**job_row(), 'expected_revision': 1}, effective_from=DAY,
            effective_through=DAY, horizon_end=DAY)
        profile = dict(id=str(USER), timezone='UTC', created_at=NOW.isoformat(), updated_at=NOW.isoformat())
        self.http.side_effect = [FakeResponse([schedule_row(1)]), FakeResponse([profile]),
            FakeResponse([]), FakeResponse([]), FakeResponse([]), FakeResponse([]), FakeResponse([schedule_row(2)])]
        with self.assertRaisesRegex(SupabaseDataError, 'changed during context'):
            calendar.get_replan_context(claim)

    def test_table_valued_rpc_rejects_wrong_cardinality(self):
        for payload in ([], [job_row(), job_row()], job_row()):
            with self.subTest(payload=payload):
                self.response(payload)
                with self.assertRaisesRegex(SupabaseDataError, 'exactly one row'):
                    replan_jobs.cancel_replan_job(USER, JOB)

    def test_onboarding_replaces_answers_without_resetting_completion(self):
        self.response([dict(user_id=str(USER), answers={'goal': 'hybrid'},
            created_at=NOW.isoformat(), updated_at=NOW.isoformat())])
        result = onboarding_responses.save_onboarding_response(USER, {'goal': 'hybrid'}, 'user-jwt')
        payload = json.loads(self.http.call_args.args[0].data)
        self.assertEqual(result.answers, {'goal': 'hybrid'})
        self.assertEqual(payload, {'user_id': str(USER), 'answers': {'goal': 'hybrid'}})

    def test_completion_conditionally_sets_only_timestamp(self):
        row = dict(user_id=str(USER), answers={'goal': 'hybrid'}, completed_at=NOW.isoformat(),
            created_at=NOW.isoformat(), updated_at=NOW.isoformat())
        self.response([row])
        result = onboarding_responses.complete_onboarding_response(USER, 'user-jwt')
        request = self.http.call_args.args[0]
        self.assertEqual(set(json.loads(request.data)), {'completed_at'})
        self.assertIn('completed_at=is.null', request.full_url)
        self.assertIn('user_id=eq.' + str(USER), request.full_url)
        self.assertEqual(result.completed_at, NOW)

    def test_repeated_or_concurrent_completion_reads_existing_timestamp(self):
        row = dict(user_id=str(USER), answers={}, completed_at=NOW.isoformat(),
            created_at=NOW.isoformat(), updated_at=NOW.isoformat())
        self.http.side_effect = [FakeResponse([]), FakeResponse([row])]
        result = onboarding_responses.complete_onboarding_response(USER, 'user-jwt')
        self.assertEqual(result.completed_at, NOW)
        self.assertEqual(self.http.call_args.args[0].get_method(), 'GET')

    def test_completion_missing_response_returns_none(self):
        self.response([])
        self.assertIsNone(onboarding_responses.complete_onboarding_response(USER, 'user-jwt'))

    def test_calendar_combines_current_workouts_and_sports(self):
        sport = dict(id=str(TOKEN), user_id=str(USER), sport='basketball', scheduled_date=str(DAY),
            created_at=NOW.isoformat(), updated_at=NOW.isoformat())
        self.http.side_effect = [FakeResponse([workout_row()]), FakeResponse([]),
            FakeResponse([sport]), FakeResponse([])]
        result = calendar.get_calendar(USER, DAY, DAY, 'user-jwt')
        self.assertEqual(result.workouts[0].id, WORKOUT)
        self.assertEqual(result.sports_workouts[0].sport, 'basketball')
        self.assertIn('status=neq.cancelled', self.http.call_args.args[0].full_url)

    def test_calendar_snapshot_matches_revision_and_preserves_unconfigured_state(self):
        for revision_rows, expected in (([{'revision': 3}], 3), ([], None)):
            with self.subTest(revision=expected):
                self.http.side_effect = [FakeResponse(revision_rows), FakeResponse([workout_row()]),
                    FakeResponse([]), FakeResponse([]), FakeResponse(revision_rows)]
                result = calendar.get_calendar_snapshot(USER, DAY, DAY, 'user-jwt')
                self.assertEqual(result.revision, expected)
                self.assertEqual(result.workouts[0].id, WORKOUT)

    def test_workout_snapshot_rejects_a_concurrent_revision_change(self):
        self.http.side_effect = [FakeResponse([{'revision': 3}]), FakeResponse([workout_row()]),
            FakeResponse([{'revision': 4}])]
        with self.assertRaises(SupabaseDataError) as error:
            workouts.get_workout_snapshot(USER, WORKOUT, 'user-jwt')
        self.assertEqual(error.exception.status_code, 409)

    def test_change_preview_keeps_original_before_and_after_versions(self):
        change = PlanningChangeRecord(id=JOB, user_id=USER, revision=2, kind='adjustment', reason='sleep',
            effective_from=DAY, effective_through=DAY, horizon_end_before=DAY, horizon_end_after=DAY, created_at=NOW)
        old = WorkoutRecord.model_validate({**workout_row(), 'superseded_at': NOW})
        new = old.model_copy(update={'id': TOKEN, 'superseded_at': None})
        links = [PlanningChangeWorkoutRecord(change_id=JOB, workout_id=row.id, user_id=USER, side=side)
            for row, side in ((old, 'before'), (new, 'after'))]
        self.response([{'revision': 5}])
        with patch.object(planning_changes, 'get_planning_change', return_value=change), \
             patch.object(planning_changes, 'get_change_workouts', return_value=links), \
             patch.object(planning_changes, 'get_workouts_by_ids', return_value=[new, old]) as read:
            preview = planning_changes.get_change_preview(USER, JOB, 'user-jwt')
        self.assertEqual(preview.before, [old])
        self.assertEqual(preview.after, [new])
        self.assertEqual(preview.revision, 5)
        read.assert_called_once_with(USER, [WORKOUT, TOKEN], 'user-jwt')

    def test_history_page_keeps_change_cursor_separate_from_current_revision(self):
        self.http.side_effect = [FakeResponse([{'revision': 9}]), FakeResponse([]), FakeResponse([{'revision': 9}])]
        page = planning_changes.get_history_page(USER, 'user-jwt', before_revision=5)
        self.assertEqual(page.revision, 9)
        self.assertEqual(page.changes, [])
        self.assertIn('revision=lt.5', self.http.call_args_list[1].args[0].full_url)


if __name__ == '__main__':
    unittest.main()
