"""verify billing synchronization against a disposable docker postgres fixture"""

import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor


container = sys.argv[1]
users = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']


def sql(statement):
    """execute fixture sql and return output; stop on any database error"""
    return subprocess.run(
        ['docker', 'exec', container, 'psql', '-U', 'postgres', '-At',
         '-v', 'ON_ERROR_STOP=1', '-c', statement],
        capture_output=True, text=True, check=True,
    ).stdout


def invalidate(ids):
    """invalidate fixture users in the supplied order"""
    literals = ','.join(f"'{user}'::uuid" for user in ids)
    return ("select sync_revision from public.invalidate_billing_entitlements("
            f"array[{literals}], 'sandbox', 'arcel_pro');")


def commit(revision, active):
    """attempt one guarded verification commit and return affected row count"""
    snapshot = json.dumps({'active': active, 'product_id': 'monthly', 'store': 'test_store',
                          'period_type': 'normal', 'expires_at': '2099-01-01T00:00:00Z',
                          'grace_expires_at': None, 'will_renew': active})
    return sql("set role service_role; select count(*) from public.commit_billing_entitlement("
               f"'{users[0]}', 'sandbox', 'arcel_pro', {revision}, '{snapshot}'::jsonb);").splitlines()[-1]


try:
    for user in users:
        sql(f"insert into auth.users(id, email) values ('{user}', 'billing-concurrency@example.invalid');")

    # Reversed transfer user lists must serialize in the same database lock order.
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(sql, "begin; set local role service_role; "
                            "set local application_name = 'billing-transfer-test'; "
                            + invalidate(users) + " select pg_sleep(1); commit;")
        for _ in range(100):
            if sql("select exists(select 1 from pg_stat_activity where "
                   "application_name = 'billing-transfer-test' and wait_event = 'PgSleep');").strip() == 't':
                break
            time.sleep(0.02)
        else:
            raise AssertionError('transfer fixture did not reach its held transaction')
        second = pool.submit(sql, "set role service_role; " + invalidate(list(reversed(users))))
        first.result()
        second.result()

    assert sql('select min(sync_revision) = 2 and max(sync_revision) = 2 '
               'from public.billing_entitlements;').strip() == 't'
    assert commit(1, True) == '0', 'a transfer allowed an earlier fetch to restore access'

    # Two responses for one claim can commit only once, even when simultaneous.
    with ThreadPoolExecutor(max_workers=2) as pool:
        counts = list(pool.map(lambda active: commit(2, active), [False, True]))
    assert sorted(counts) == ['0', '1'], 'one synchronization claim committed twice'

    sql('set role service_role; ' + invalidate([users[0]]))
    assert commit(3, False) == '1'
    assert commit(2, True) == '0', 'a delayed active response overwrote a newer inactive snapshot'
    assert sql(f"select not active and verified_at is not null from public.billing_entitlements "
               f"where user_id = '{users[0]}';").strip() == 't'
    print('concurrent billing invalidation, one-use claims, and stale-response fencing passed')
finally:
    for user in users:
        sql(f"delete from auth.users where id = '{user}';")
