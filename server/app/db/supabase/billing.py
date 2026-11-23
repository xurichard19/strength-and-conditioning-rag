from uuid import UUID

from app.contracts import BillingEntitlementRecord, BillingEnvironment, BillingSnapshot
from app.db.supabase._queries import identifier
from app.db.supabase.transport import SupabaseDataError, call_rpc, select_rows


def _records(payload: object) -> list[BillingEntitlementRecord]:
    """ validate the table-valued billing rpc response before mapping records """

    if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
        raise SupabaseDataError("invalid billing response")
    return [BillingEntitlementRecord.model_validate(row) for row in payload]


def get_entitlement(user_id: str | UUID, environment: BillingEnvironment) -> BillingEntitlementRecord | None:
    """ read the stored entitlement for the server-selected environment.
    callers check freshness before granting access

    - **user_id**: verified owner; never an arbitrary mobile request value
    - **environment**: server-selected store environment
    - **returns**: saved projection or none; the billing service evaluates freshness/outage eligibility """

    rows = select_rows("billing_entitlements", [("select", "*"), ("user_id", f"eq.{identifier(user_id)}"),
        ("environment", f"eq.{environment}"), ("entitlement_key", "eq.arcel_pro"), ("limit", "1")], None)
    return BillingEntitlementRecord.model_validate(rows[0]) if rows else None


def invalidate_entitlements(user_ids: list[UUID], environment: BillingEnvironment) -> list[BillingEntitlementRecord]:
    """ invalidate transfer participants atomically and return new revisions.
    unknown profiles are skipped

    - **user_ids**: authenticated caller or identities from an authenticated webhook
    - **environment**: partition to invalidate; transfer participants change atomically
    - **returns**: invalidated records for existing profiles; missing profiles are ignored """

    if not user_ids:
        return []
    return _records(call_rpc("invalidate_billing_entitlements", {
        "p_user_ids": sorted({identifier(value) for value in user_ids}),
        "p_environment": environment, "p_entitlement_key": "arcel_pro",
    }, None))


def claim_verification(user_id: UUID, environment: BillingEnvironment) -> BillingEntitlementRecord | None:
    """ start a refresh without discarding the previous paid outage allowance

    - **user_id**: owner of the account being checked
    - **environment**: server-selected store environment
    - **returns**: the claimed verification record, or none when no claim was acquired """
    rows = _records(call_rpc("claim_billing_verification", {
        "p_user_id": identifier(user_id), "p_environment": environment, "p_entitlement_key": "arcel_pro",
    }, None))
    if len(rows) > 1:
        raise SupabaseDataError("invalid billing response")
    return rows[0] if rows else None


def defer_verification(user_id: UUID, environment: BillingEnvironment,
                       expected_revision: int) -> BillingEntitlementRecord | None:
    """ record a temporary failure only while its verification claim is current

    - **user_id**: owner of the account being checked
    - **environment**: server-selected store environment
    - **expected_revision**: verification revision captured before contacting the provider
    - **returns**: updated record, or none if the claim is no longer current """
    rows = _records(call_rpc("defer_billing_verification", {
        "p_user_id": identifier(user_id), "p_environment": environment,
        "p_entitlement_key": "arcel_pro", "p_expected_revision": expected_revision,
    }, None))
    if len(rows) > 1:
        raise SupabaseDataError("invalid billing response")
    return rows[0] if rows else None


def commit_entitlement(user_id: UUID, environment: BillingEnvironment, expected_revision: int,
                       snapshot: BillingSnapshot) -> BillingEntitlementRecord | None:
    """ store the verified snapshot, or return none if a webhook or newer fetch invalidated the
    claim

    - **user_id**: verified account being synchronized
    - **environment**: server-selected partition
    - **expected_revision**: revision returned by the claim before the provider call
    - **snapshot**: normalized provider response; never supplied by the mobile client
    - **returns**: saved record or none if another fetch/webhook invalidated this claim """

    rows = _records(call_rpc("commit_billing_entitlement", {
        "p_user_id": identifier(user_id), "p_environment": environment,
        "p_entitlement_key": "arcel_pro", "p_expected_revision": expected_revision,
        "p_snapshot": snapshot.model_dump(mode="json"),
    }, None))
    if len(rows) > 1:
        raise SupabaseDataError("invalid billing response")
    return rows[0] if rows else None
