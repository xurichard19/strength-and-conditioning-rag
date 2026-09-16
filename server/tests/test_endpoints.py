import datetime as dt
import json
import unittest
from unittest.mock import patch
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import calendar, chat, health, onboarding, planning, profile, sports_workouts, workouts
from app.auth.supabase import require_user
from app.contracts import MessageRecord, PlanningHistoryPage, PlanningScheduleRecord, ReplanJobRecord, SportsWorkoutRecord, WorkoutWriteResult
from app.db.supabase import SupabaseDataError
from server.tests.test_profile import NOW, USER


ID = UUID('22222222-2222-4222-8222-222222222222')
DAY = dt.date(2026, 9, 14)
SPORT = SportsWorkoutRecord(id=ID, user_id=USER.id, sport='basketball', scheduled_date=DAY, created_at=NOW, updated_at=NOW)
JOB = ReplanJobRecord(id=ID, user_id=USER.id, kind='adjustment', reason='sleep',
    effective_from=DAY, effective_through=DAY, deduplication_key='private-key', error='private-error',
    lease_token=ID, available_at=NOW, created_at=NOW, updated_at=NOW)
SCHEDULE = PlanningScheduleRecord(user_id=USER.id, next_refresh_at=NOW, created_at=NOW, updated_at=NOW)


def client(auth=True):
    app = FastAPI()
    for module in (calendar, chat, health, onboarding, planning, profile, sports_workouts, workouts):
        app.include_router(module.router)
    app.state.chat_graph = object()
    if auth:
        app.dependency_overrides[require_user] = lambda: USER
    return TestClient(app)


class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = client()
        self.addCleanup(self.client.close)

    def test_every_private_endpoint_requires_auth(self):
        routes = [
            ('GET', '/calendar?start_date=2026-09-14&end_date=2026-09-20', None),
            ('GET', f'/workouts/{ID}', None),
            ('PUT', f'/workouts/{ID}/results', {'expected_revision': 0, 'status': 'planned'}),
            ('GET', f'/sports-workouts/{ID}', None),
            ('POST', '/sports-workouts', {'sport': 'running', 'scheduled_date': str(DAY)}),
            ('PATCH', f'/sports-workouts/{ID}', {'notes': 'easy'}),
            ('PUT', f'/sports-workouts/{ID}/status', {'status': 'cancelled'}),
            ('DELETE', f'/sports-workouts/{ID}', None),
            ('GET', '/planning/schedule', None),
            ('PUT', '/planning/schedule', {'next_refresh_at': NOW}),
            ('POST', '/planning/adjustments', {'deduplication_key': 'k', 'reason': 'sleep',
                'effective_from': str(DAY), 'effective_through': str(DAY)}),
            ('GET', '/planning/jobs', None), ('GET', f'/planning/jobs/{ID}', None),
            ('POST', f'/planning/jobs/{ID}/cancel', None), ('POST', f'/planning/jobs/{ID}/retry', None),
            ('GET', '/planning/changes', None), ('GET', f'/planning/changes/{ID}', None),
            ('POST', f'/planning/changes/{ID}/undo', {'expected_revision': 0}),
            ('POST', f'/planning/changes/{ID}/redo', {'expected_revision': 0}),
            ('GET', '/chat/messages', None), ('POST', '/chat', {'text': 'hello'}),
        ]
        with client(False) as anonymous:
            for method, url, body in routes:
                with self.subTest(method=method, url=url):
                    self.assertEqual(anonymous.request(method, url, json=body).status_code, 401)
            self.assertEqual(anonymous.get('/health').json(), {'status': 'ok'})

    def test_schedule_read_configure_and_validation(self):
        with patch.object(planning.planning_schedules, 'get_planning_schedule', return_value=None) as get:
            self.assertIsNone(self.client.get('/planning/schedule').json())
            get.assert_called_once_with(USER.id, USER.access_token)
        with patch.object(planning.planning_schedules, 'configure_planning_schedule', return_value=SCHEDULE) as save:
            self.assertEqual(self.client.put('/planning/schedule', json={'next_refresh_at': NOW}).status_code, 200)
            self.assertEqual(save.call_args.args[0], USER.id)
            self.assertEqual(save.call_args.args[2:], (7, 7))
            save.reset_mock()
            for body in ({'next_refresh_at': '2026-09-14T12:00:00'},
                         {'next_refresh_at': NOW, 'horizon_days': 7, 'refresh_interval_days': 8},
                         {'next_refresh_at': NOW, 'user_id': str(ID)}):
                self.assertEqual(self.client.put('/planning/schedule', json=body).status_code, 422)
            save.assert_not_called()

    def test_adjustment_and_job_endpoints_redact_internal_data(self):
        with patch.object(planning.replan_jobs, 'enqueue_adjustment', return_value=JOB) as enqueue:
            response = self.client.post('/planning/adjustments', json={'deduplication_key': 'k', 'reason': 'sleep',
                'effective_from': str(DAY), 'effective_through': str(DAY)})
            self.assertEqual(response.status_code, 202)
            enqueue.assert_called_once_with(USER.id, 'k', 'sleep', DAY, DAY)
        calls = [('get_pending_replans', 'GET', '/planning/jobs', [JOB]),
                 ('get_replan_job', 'GET', f'/planning/jobs/{ID}', JOB),
                 ('cancel_replan_job', 'POST', f'/planning/jobs/{ID}/cancel', JOB),
                 ('retry_replan_job', 'POST', f'/planning/jobs/{ID}/retry', JOB)]
        for name, method, url, result in calls:
            with self.subTest(name=name), patch.object(planning.replan_jobs, name, return_value=result) as handler:
                response = self.client.request(method, url)
                self.assertIn(response.status_code, (200, 202))
                self.assertEqual(handler.call_args.args[0], USER.id)
                for forbidden in ('lease_token', 'lease_expires_at', 'error', 'deduplication_key', 'private-key'):
                    self.assertNotIn(forbidden, response.text)

    def test_invalid_adjustment_and_missing_job(self):
        with patch.object(planning.replan_jobs, 'enqueue_adjustment') as handler:
            body = {'deduplication_key': 'k', 'reason': 'sleep', 'effective_from': '2026-09-20', 'effective_through': str(DAY)}
            self.assertEqual(self.client.post('/planning/adjustments', json=body).status_code, 422)
            handler.assert_not_called()
        with patch.object(planning.replan_jobs, 'get_replan_job', return_value=None):
            self.assertEqual(self.client.get(f'/planning/jobs/{ID}').status_code, 404)

    def test_history_and_undo_redo_pass_explicit_revision(self):
        with patch.object(planning.planning_changes, 'get_history_page', return_value=PlanningHistoryPage(changes=[], revision=8)) as history:
            self.assertEqual(self.client.get('/planning/changes?before_revision=5').json()['revision'], 8)
            history.assert_called_once_with(USER.id, USER.access_token, 20, 5)
        with patch.object(planning.planning_changes, 'get_change_preview', return_value=None):
            self.assertEqual(self.client.get(f'/planning/changes/{ID}').status_code, 404)
        for action in ('undo', 'redo'):
            with patch.object(planning.planning_changes, action + '_planning_change',
                              return_value=WorkoutWriteResult(change_id=ID, workout_ids=[], revision=9)) as handler:
                response = self.client.post(f'/planning/changes/{ID}/{action}', json={'expected_revision': 8})
                self.assertEqual(response.status_code, 200)
                handler.assert_called_once_with(USER.id, ID, 8)

    def test_sports_crud_uses_owner_handlers(self):
        cases = [('get_sports_workout', 'GET', f'/sports-workouts/{ID}', None, 200),
                 ('create_sports_workout', 'POST', '/sports-workouts', {'sport': 'basketball', 'scheduled_date': str(DAY)}, 201),
                 ('update_sports_workout', 'PATCH', f'/sports-workouts/{ID}', {'notes': None}, 200),
                 ('set_sports_workout_status', 'PUT', f'/sports-workouts/{ID}/status', {'status': 'cancelled'}, 200),
                 ('delete_sports_workout', 'DELETE', f'/sports-workouts/{ID}', None, 200)]
        for name, method, url, body, expected in cases:
            with self.subTest(name=name), patch.object(sports_workouts.sports_workouts, name, return_value=SPORT) as handler:
                response = self.client.request(method, url, json=body)
                self.assertEqual(response.status_code, expected)
                self.assertEqual(handler.call_args.args[0], USER.id)
                self.assertEqual(handler.call_args.args[-1], USER.access_token)
                self.assertEqual(response.headers['cache-control'], 'private, no-store')
                if name == 'update_sports_workout':
                    self.assertEqual(handler.call_args.args[2].model_dump(exclude_unset=True), {'notes': None})

    def test_mobile_sports_form_reaches_the_insert_handler_with_local_date_and_owner(self):
        body = dict(sport='boxing', scheduled_date='2026-09-20', start_time='23:30:00',
            planned_duration_minutes=180, intensity='variable', notes='Sparring')
        row = {**SPORT.model_dump(mode='json'), **body}
        with patch.object(sports_workouts.sports_workouts, 'insert_rows', return_value=[row]) as insert:
            response = self.client.post('/sports-workouts', json=body)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['start_time'], '23:30:00')
        self.assertEqual(response.json()['scheduled_date'], '2026-09-20')
        insert.assert_called_once_with('sports_workouts', {'user_id': str(USER.id), **body}, USER.access_token)

    def test_sports_invalid_input_and_missing_record(self):
        with patch.object(sports_workouts.sports_workouts, 'update_sports_workout') as handler:
            for body in ({}, {'sport': None}, {'sport': '   '}, {'start_time': '12:00:00+00:00'}, {'user_id': USER.id}):
                self.assertEqual(self.client.patch(f'/sports-workouts/{ID}', json=body).status_code, 422)
            handler.assert_not_called()
        with patch.object(sports_workouts.sports_workouts, 'delete_sports_workout', return_value=None):
            self.assertEqual(self.client.delete(f'/sports-workouts/{ID}').status_code, 404)

    def test_rpc_argument_errors_are_client_errors_not_leaked_sql(self):
        with patch.object(planning.replan_jobs, 'retry_replan_job', side_effect=SupabaseDataError('private sql', 400, 'PT400')):
            response = self.client.post(f'/planning/jobs/{ID}/retry')
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('private sql', response.text)

    def test_chat_history_cursor_validation(self):
        with patch.object(chat.messages, 'get_recent_messages', return_value=[]) as handler:
            self.assertEqual(self.client.get('/chat/messages?conversation_id=' + str(ID)).status_code, 200)
            handler.reset_mock()
            self.assertEqual(self.client.get('/chat/messages?before_id=' + str(ID)).status_code, 422)
            self.assertEqual(self.client.get('/chat/messages?before_id=' + str(ID) + '&before_created_at=2026-09-14T12:00:00').status_code, 422)
            handler.assert_not_called()

    def test_conversation_management_scopes_owner_and_validates_title(self):
        row = dict(id=ID, user_id=USER.id, title='Named chat', created_at=NOW)
        path = f'/chat/conversations/{ID}'
        with patch.object(chat.messages, 'rename_conversation', return_value=row) as rename:
            response = self.client.patch(path, json={'title': '  Named chat  '})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['title'], 'Named chat')
            rename.assert_called_once_with(USER.id, ID, 'Named chat', USER.access_token)
            for title in (' ', 'x' * 121):
                self.assertEqual(self.client.patch(path, json={'title': title}).status_code, 422)
        with patch.object(chat.messages, 'get_conversation', return_value=None):
            self.assertEqual(self.client.get(path).status_code, 404)
        with patch.object(chat.messages, 'delete_conversation') as delete:
            self.assertEqual(self.client.delete(path).status_code, 204)
            delete.assert_called_once_with(USER.id, ID, USER.access_token)
        with client(auth=False) as anonymous:
            self.assertEqual(anonymous.patch(path, json={'title': 'name'}).status_code, 401)
            self.assertEqual(anonymous.delete(path).status_code, 401)

    def test_chat_persists_only_user_and_completed_assistant_then_signals_done(self):
        prior = MessageRecord(conversation_id=ID, id=ID, user_id=USER.id, role='assistant', content='previous', created_at=NOW)
        async def stream(graph, **kwargs):
            self.assertNotIn('history', kwargs)
            self.assertEqual(kwargs['message'], 'hi')
            self.assertFalse(hasattr(kwargs['context'], 'conversation_id'))
            yield {'type': 'text', 'delta': 'hello'}
            yield {'type': 'sources', 'sources': []}
            yield {'type': 'done'}
        with patch.object(chat, 'stream_workflow', side_effect=stream), \
             patch.object(chat.messages, 'get_recent_messages', return_value=[prior]) as history, \
             patch.object(chat.messages, 'append_message', return_value=prior) as save:
            response = self.client.post('/chat', json={'text': 'hi', 'conversation_id': str(ID)},
                headers={'X-Chat-Saved-Events': '1'})
            history.assert_not_called()
            events = [json.loads(line) for line in response.text.splitlines()]
            self.assertEqual(events[0]['type'], 'saved')
            self.assertEqual(events[0]['message']['id'], str(ID))
            self.assertEqual(events[-1]['type'], 'done')
            self.assertEqual(events[-1]['message_id'], str(ID))
            self.assertEqual(events[-1]['message']['id'], str(ID))
            self.assertEqual([call.args[1:3] for call in save.call_args_list], [('user', 'hi'), ('assistant', 'hello')])
            self.assertEqual(save.call_args_list[0].args[-1], USER.access_token)
            self.assertIsNone(save.call_args_list[1].args[-1])
            self.assertTrue(all(call.kwargs['conversation_id'] == ID for call in save.call_args_list))

    def test_older_clients_do_not_receive_an_unknown_saved_event(self):
        row = MessageRecord(conversation_id=ID, id=ID, user_id=USER.id, role='assistant', content='hi', created_at=NOW)
        async def stream(graph, **kwargs):
            yield {'type': 'text', 'delta': 'hello'}
        with patch.object(chat, 'stream_workflow', side_effect=stream), \
             patch.object(chat.messages, 'append_message', return_value=row):
            response = self.client.post('/chat', json={'text': 'hi', 'conversation_id': str(ID)})
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual([event['type'] for event in events], ['text', 'done'])
        self.assertEqual(events[-1]['message_id'], str(ID))

    def test_chat_failure_does_not_save_partial_reply_or_send_done(self):
        async def stream(graph, **kwargs):
            yield {'type': 'text', 'delta': 'partial'}
            raise RuntimeError('private provider error')
        with patch.object(chat.sentry_sdk, 'capture_exception') as capture, \
             patch.object(chat, 'stream_workflow', side_effect=stream), \
             patch.object(chat.messages, 'get_recent_messages', return_value=[]), \
             patch.object(chat.messages, 'append_message', return_value=MessageRecord(
                 id=ID, conversation_id=ID, user_id=USER.id, role='user', content='hi', created_at=NOW)) as save:
            response = self.client.post('/chat', json={'text': 'hi', 'conversation_id': str(ID)})
            events = [json.loads(line) for line in response.text.splitlines()]
            self.assertEqual(events[-1]['type'], 'error')
            self.assertNotIn('private provider error', response.text)
            self.assertNotIn('done', [event['type'] for event in events])
            save.assert_called_once_with(USER.id, 'user', 'hi', USER.access_token, conversation_id=ID)
            capture.assert_called_once()
            self.assertIsInstance(capture.call_args.args[0], RuntimeError)

    def test_openapi_has_new_routes_and_no_legacy_plan_surface(self):
        paths = self.client.get('/openapi.json').json()['paths']
        self.assertIn('/planning/adjustments', paths)
        self.assertIn('/calendar', paths)
        self.assertNotIn('/plan', paths)
        self.assertNotIn('/profile/onboarding/complete', paths)


if __name__ == '__main__':
    unittest.main()
