"""Race activity reporting and refresh claims in the runner's disposable database."""

from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys
import time


container = sys.argv[1]
user_id = "88888888-8888-4888-8888-888888888888"


def sql(statement: str) -> str:
    return subprocess.run([
        "docker", "exec", container, "psql", "-U", "postgres", "-At",
        "-v", "ON_ERROR_STOP=1", "-c", statement,
    ], capture_output=True, text=True, check=True, timeout=15).stdout.strip()


def held_transaction(name: str) -> None:
    for _ in range(100):
        if sql("select exists(select 1 from pg_stat_activity where "
               f"application_name = '{name}' and wait_event = 'PgSleep');") == "t":
            return
        time.sleep(0.02)
    raise AssertionError(f"{name} did not reach its row-lock barrier")


report = f"select public.record_user_activity('{user_id}');"
try:
    sql(f"insert into auth.users(id, email) values ('{user_id}', 'activity-race@example.invalid'); "
        "set role service_role; "
        f"insert into public.onboarding_responses(user_id, answers, completed_at) values ('{user_id}', '{{}}', now()); "
        f"select public.configure_planning_schedule('{user_id}', now() - interval '60 days'); "
        f"update public.profiles set last_active_at = now() - interval '30 days' where id = '{user_id}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: sql("set role service_role; " + report), range(2)))
    records = [json.loads(next(line for line in result.splitlines() if line.startswith('{'))) for result in results]
    assert records[0] == records[1], 'duplicate returns changed job or activity time'
    assert sql(f"select count(*) from public.replan_jobs where user_id = '{user_id}';") == '1'
    job = records[0]['refresh_job']

    # Discovery owns the schedule; activity owns the profile. Neither path may
    # acquire the other's profile row lock after locking the schedule.
    sql(f"delete from public.replan_jobs where user_id = '{user_id}'; "
        f"update public.profiles set last_active_at = now() - interval '30 days' where id = '{user_id}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        scheduler = pool.submit(sql, "begin; set local role service_role; "
            "set local application_name = 'activity-schedule-first'; "
            f"select 1 from public.planning_schedules where user_id = '{user_id}' for update; "
            "select pg_sleep(1); select public.enqueue_due_replans(1, true); commit;")
        held_transaction('activity-schedule-first')
        returning = pool.submit(sql, "set role service_role; " + report)
        scheduler.result()
        returning.result()
    assert sql(f"select count(*) from public.replan_jobs where user_id = '{user_id}';") == '1'
    job = json.loads(sql(f"select to_jsonb(j) from public.replan_jobs j where user_id = '{user_id}';"))

    claim = f"select public.claim_replan_delivery('{job['id']}', '{job['delivery_token']}')->>'status';"
    # A delayed inactive claim wins first: it retires its task token, not the job.
    sql(f"update public.profiles set last_active_at = now() - interval '30 days' where id = '{user_id}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        worker = pool.submit(sql, "begin; set local role service_role; "
            "set local application_name = 'activity-claim-first'; " + claim + "select pg_sleep(1); commit;")
        held_transaction('activity-claim-first')
        returning = pool.submit(sql, "set role service_role; " + report)
        assert 'obsolete' in worker.result().splitlines()
        returning.result()
    assert sql(f"select count(*) = 1 and min(attempts) = 0 from public.replan_jobs where user_id = '{user_id}';") == 't'
    token = sql(f"select delivery_token from public.replan_jobs where id = '{job['id']}';")
    assert token != job['delivery_token']

    # Return wins first: the waiting worker observes current activity and claims once.
    claim = f"select public.claim_replan_delivery('{job['id']}', '{token}')->>'status';"
    sql(f"update public.profiles set last_active_at = now() - interval '30 days' where id = '{user_id}';")
    with ThreadPoolExecutor(max_workers=2) as pool:
        returning = pool.submit(sql, "begin; set local role service_role; "
            "set local application_name = 'activity-return-first'; " + report + "select pg_sleep(1); commit;")
        held_transaction('activity-return-first')
        worker = pool.submit(sql, "set role service_role; " + claim)
        returning.result()
        assert worker.result().splitlines()[-1] == 'claimed'
    assert sql(f"select attempts = 1 and status = 'running' from public.replan_jobs where id = '{job['id']}';") == 't'
    print('duplicate returns, scheduler/return locking, and claim/return races passed')
finally:
    sql(f"delete from auth.users where id = '{user_id}';")
