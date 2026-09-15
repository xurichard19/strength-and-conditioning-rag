"""Run against the disposable Docker PostgreSQL fixture after its SQL tests."""

import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor


container = sys.argv[1]


def sql(statement):
    return subprocess.run(
        ['docker', 'exec', container, 'psql', '-U', 'postgres', '-At',
         '-v', 'ON_ERROR_STOP=1', '-c', statement],
        capture_output=True, text=True, check=True,
    ).stdout


users = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
for user in users:
    sql(f"insert into auth.users values ('{user}', 'concurrency@example.invalid');"
        f"select public.configure_planning_schedule('{user}', date_trunc('day', now()));")
sql('select public.enqueue_due_replans();')

with ThreadPoolExecutor(max_workers=2) as pool:
    first = pool.submit(sql, "begin; set local role service_role; "
                       "set local application_name = 'rpc-worker-one'; "
                       "select public.claim_replan_job(); select pg_sleep(2); commit;")
    for _ in range(100):
        if 't' in sql("select exists(select 1 from pg_stat_activity "
                      "where application_name = 'rpc-worker-one' and wait_event = 'PgSleep');"):
            break
        time.sleep(0.05)
    else:
        raise AssertionError('first worker did not reach its held transaction')
    second = pool.submit(sql, 'set role service_role; select public.claim_replan_job();')
    results = [first.result(), second.result()]

jobs = [json.loads(next(line for line in result.splitlines() if line.startswith('{')))['job']
        for result in results]
assert jobs[0]['user_id'] != jobs[1]['user_id'], 'workers claimed the same user'
assert sql('select public.claim_replan_job() is null;').strip() == 't', 'double claim accepted'

# Concurrent duplicate publication must insert only one change/workout tree.
job = jobs[0]
statement = ("set role service_role; select public.complete_replan_job("
             f"'{job['id']}', '{job['lease_token']}', '{{}}'::uuid[], "
             "jsonb_build_array(jsonb_build_object('scheduled_date',current_date,"
             "'name','concurrent','exercises','[]'::jsonb)));")
with ThreadPoolExecutor(max_workers=2) as pool:
    receipts = list(pool.map(sql, [statement, statement]))
assert sql(f"select count(*) from public.workouts where created_by_change_id = '{job['id']}';").strip() == '1'
assert sql(f"select count(*) from public.planning_changes where id = '{job['id']}';").strip() == '1'
print('concurrent claims and duplicate publication passed')

# Identical concurrent onboarding saves must not invalidate the same input twice.
user = users[0]
revision = int(sql(f"select revision from public.planning_schedules where user_id = '{user}';").strip())
statement = ("set role service_role; insert into public.onboarding_responses(user_id, answers) "
             f"values ('{user}', '{{}}') on conflict(user_id) do update set answers = excluded.answers;")
with ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(sql, [statement, statement]))
assert int(sql(f"select revision from public.planning_schedules where user_id = '{user}';").strip()) == revision + 1
print('concurrent identical onboarding saves invalidate once')

for user in users:
    sql(f"delete from auth.users where id = '{user}';")
