"""Exercise payment/worker races against the runner's disposable database."""

from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys
import time


container = sys.argv[1]
user_id = "64646464-6464-4464-8464-646464646464"


def sql(statement: str) -> str:
    """Execute fixture SQL and fail on any database error."""
    return subprocess.run([
        "docker", "exec", container, "psql", "-U", "postgres", "-At",
        "-v", "ON_ERROR_STOP=1", "-c", statement,
    ], capture_output=True, text=True, check=True, timeout=15).stdout.strip()


def held_transaction(name: str) -> None:
    """Wait until the other connection holds its row locks before racing it."""
    for _ in range(100):
        if sql("select exists(select 1 from pg_stat_activity where "
               f"application_name = '{name}' and wait_event = 'PgSleep');") == "t":
            return
        time.sleep(0.02)
    raise AssertionError(f"{name} did not reach its held transaction")


invalidate = ("select sync_revision from public.invalidate_billing_entitlements("
              f"array['{user_id}'::uuid], 'sandbox', 'arcel_pro');")
snapshot = json.dumps({"active": True, "product_id": "monthly", "store": "test_store",
                       "period_type": "normal", "expires_at": "2099-01-01T00:00:00Z",
                       "will_renew": False})


def verify(revision: int) -> None:
    """Commit a provider result using the current invalidation revision."""
    sql("set role service_role; select count(*) from public.commit_billing_entitlement("
        f"'{user_id}', 'sandbox', 'arcel_pro', {revision}, '{snapshot}'::jsonb);")


try:
    sql(f"insert into auth.users(id, email) values ('{user_id}', 'planning-race@example.invalid'); "
        "set role service_role; "
        f"insert into public.onboarding_responses(user_id, answers, completed_at) values ('{user_id}', '{{}}', now()); "
        f"select public.configure_planning_schedule('{user_id}', now()); " + invalidate)
    verify(1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: sql("set role service_role; "
            f"select public.resume_planning('{user_id}', 'sandbox', 1);"), range(2)))
    assert all(result.splitlines()[-1] == "t" for result in results)
    assert sql(f"select count(*) from public.replan_jobs where user_id = '{user_id}';") == "1"
    job_id, token = sql(f"select id, delivery_token from public.replan_jobs where user_id = '{user_id}';").split("|")

    def claim(revision: int) -> str:
        return (f"select public.claim_replan_delivery('{job_id}', '{token}', 300, "
                f"'sandbox', {revision})->>'status';")

    # Invalidation wins: a worker with an earlier proof waits for that transaction,
    # observes the changed revision, and cannot spend a generation attempt.
    with ThreadPoolExecutor(max_workers=2) as pool:
        invalidation = pool.submit(sql, "begin; set local role service_role; "
            "set local application_name = 'planning-invalidation-first'; " + invalidate +
            "select pg_sleep(1); commit;")
        held_transaction("planning-invalidation-first")
        worker = pool.submit(sql, "set role service_role; " + claim(1))
        invalidation.result()
        assert worker.result().splitlines()[-1] == "billing_unavailable"
    assert sql(f"select attempts = 0 and status = 'pending' from public.replan_jobs where id = '{job_id}';") == "t"

    # Claim wins: the entitlement row remains locked through authorization and the
    # lease transition; later invalidation preserves that authorized in-flight work.
    verify(2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        worker = pool.submit(sql, "begin; set local role service_role; "
            "set local application_name = 'planning-claim-first'; " + claim(2) +
            "select pg_sleep(1); commit;")
        held_transaction("planning-claim-first")
        invalidation = pool.submit(sql, "set role service_role; " + invalidate)
        assert "claimed" in worker.result().splitlines()
        invalidation.result()
    assert sql(f"select attempts = 1 and status = 'running' from public.replan_jobs where id = '{job_id}';") == "t"
    assert sql(f"select sync_revision = 3 and verified_at is null from public.billing_entitlements where user_id = '{user_id}';") == "t"
    print("concurrent planning resume and payment/claim authorization fencing passed")
finally:
    sql(f"delete from auth.users where id = '{user_id}';")
