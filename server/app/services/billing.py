from collections import OrderedDict
from concurrent.futures import Future
from datetime import UTC, datetime, timedelta
import logging
from threading import Lock
import time
from uuid import UUID

from pydantic import ValidationError

from app.config import get_billing_settings
from app.contracts import BillingAccessDecision, BillingEntitlementRecord, BillingEnvironment
from app.db.supabase import billing
from app.db.supabase.transport import SupabaseDataError
from app.integrations.revenuecat import RevenueCatError, RevenueCatUnavailable, fetch_entitlement


logger = logging.getLogger(__name__)
FRESHNESS = timedelta(minutes=5)
VERIFICATION_BUDGET_SECONDS = 10
VERIFICATION_POLL_SECONDS = 0.25
SUPERSEDED_WAIT_SECONDS = 2
_lock = Lock()
_inflight: dict[tuple[UUID, str], Future] = {}
_attempts: OrderedDict[tuple[UUID, str], list[float]] = OrderedDict()


class BillingUnavailable(Exception):
    """access cannot currently be verified; this is not a purchase-required decision"""


def billing_enabled() -> bool:
    """keep legacy settings/test doubles and existing deployments disabled by default"""

    return getattr(get_billing_settings(), "billing_enabled", False) is True


def billing_environment(user_id: UUID) -> BillingEnvironment:
    """select the store partition from server deployment and review-account configuration"""

    settings = get_billing_settings()
    reviewers = {UUID(str(value)) for value in getattr(settings, "billing_sandbox_user_ids", [])}
    return "production" if settings.environment == "production" and user_id not in reviewers else "sandbox"


def _fresh(record: BillingEntitlementRecord | None, now: datetime) -> bool:
    """require an uninvalidated verification no older than five minutes"""

    return record is not None and record.verified_at is not None and -timedelta(seconds=30) <= now - record.verified_at <= FRESHNESS


def has_fresh_verification(record: BillingEntitlementRecord | None, now: datetime | None = None) -> bool:
    """Fresh verification cannot cover a paid expiry crossed since that check."""
    now = now or datetime.now(UTC)
    return _fresh(record, now) and not (record.active and record.expires_at is not None
        and record.verified_at < record.expires_at <= now)


def _outage_allowed(record: BillingEntitlementRecord | None, now: datetime) -> bool:
    # SQL fixes this deadline at paid verification + 24h, capped by paid expiry.
    # The retry marker proves a temporary failure; webhook invalidation clears both.
    return (record is not None and record.verification_retry_at is not None
        and record.outage_access_until is not None and now < record.outage_access_until
        and billing_access(record, now).has_access)


def _retry_pending(record: BillingEntitlementRecord | None, now: datetime) -> bool:
    return record is not None and record.verification_retry_at is not None and now < record.verification_retry_at


def billing_access(record: BillingEntitlementRecord, now: datetime | None = None) -> BillingAccessDecision:
    """Grant only a verified paid period; retain trial/grace phases for account messaging."""

    now = now or datetime.now(UTC)
    phase = "inactive"
    fully_expired = (record.expires_at is not None and record.expires_at <= now
        and (record.grace_expires_at is None or record.grace_expires_at <= now))
    if record.active and not fully_expired:
        if record.period_type not in {"normal", "intro", "trial"}:
            raise BillingUnavailable("unknown subscription period")
        if record.expires_at is not None and record.expires_at > now:
            phase = "trial" if record.period_type == "trial" else "paid"
        elif record.grace_expires_at is not None and record.grace_expires_at > now:
            phase = "grace"
    return BillingAccessDecision(enabled=True, has_access=phase == "paid", phase=phase,
        product_id=record.product_id, expires_at=record.expires_at,
        will_renew=record.will_renew, verified_at=record.verified_at)


def _verify(user_id: UUID, environment: BillingEnvironment) -> BillingEntitlementRecord:
    """Verify, wait briefly for a newer claim, then re-claim once if it produced no result."""

    key = get_billing_settings().revenuecat_api_key
    if key is None:
        raise BillingUnavailable()
    deadline = time.monotonic() + VERIFICATION_BUDGET_SECONDS
    for attempt in range(2):
        if time.monotonic() >= deadline:
            raise BillingUnavailable()
        claim = billing.claim_verification(user_id, environment)
        remaining = deadline - time.monotonic()
        if claim is None or remaining <= 0:
            raise BillingUnavailable()
        try:
            snapshot = fetch_entitlement(user_id, environment, key.get_secret_value(), timeout=min(8, remaining))
        except RevenueCatUnavailable:
            billing.defer_verification(user_id, environment, claim.sync_revision)
        else:
            billing.commit_entitlement(user_id, environment, claim.sync_revision, snapshot)
        # Reclaiming at once would invalidate another server's in-flight verification, so give
        # a newer claim time to finish. A webhook or abandoned claim never produces a result:
        # after that short wait, verify once more instead of holding the request to the deadline.
        # The last attempt cannot reclaim again, so use its entire remaining wait budget.
        patience = min(deadline, time.monotonic() + SUPERSEDED_WAIT_SECONDS) if attempt == 0 else deadline
        while True:
            now = time.monotonic()
            if now >= deadline:
                raise BillingUnavailable()
            current = billing.get_entitlement(user_id, environment)
            now = time.monotonic()
            if current is None or now >= deadline:
                raise BillingUnavailable()
            if has_fresh_verification(current) or _retry_pending(current, datetime.now(UTC)):
                return current
            if current.sync_revision <= claim.sync_revision:
                raise BillingUnavailable()
            if now >= patience:
                break
            time.sleep(min(VERIFICATION_POLL_SECONDS, patience - now, deadline - now))
    raise BillingUnavailable()


def _coalesced_verify(user_id: UUID, environment: BillingEnvironment) -> BillingEntitlementRecord:
    """share concurrent verification and bound repeated provider calls per account/process"""

    identity = (user_id, environment)
    with _lock:
        pending = _inflight.get(identity)
        if pending is None:
            now = time.monotonic()
            recent = [stamp for stamp in _attempts.pop(identity, []) if now - stamp < 60]
            if len(recent) >= 5:
                _attempts[identity] = recent
                raise BillingUnavailable()
            _attempts[identity] = [*recent, now]
            while len(_attempts) > 2048:
                _attempts.popitem(last=False)
            pending = Future()
            _inflight[identity] = pending
            owner = True
        else:
            owner = False
    if not owner:
        return pending.result(timeout=12)
    try:
        result = _verify(user_id, environment)
        pending.set_result(result)
        return result
    except Exception as exc:
        pending.set_exception(exc)
        raise
    finally:
        with _lock:
            _inflight.pop(identity, None)


def get_verified_entitlement(user_id: str | UUID, *, force: bool = False,
                             allow_outage: bool = False) -> BillingEntitlementRecord | None:
    """
    read a canonical authorization record, or none when billing is disabled

    - **user_id**: identity already verified by supabase auth
    - **force**: request a bounded refresh after purchase/restore; no client claims are trusted
    - **allow_outage**: ordinary requests may reuse bounded paid access; planning requires fresh verification
    - **returns**: authorized verification source, including fresh inactive state
    """

    if not billing_enabled():
        return None
    owner = UUID(str(user_id))
    environment = billing_environment(owner)
    try:
        record = billing.get_entitlement(owner, environment)
        now = datetime.now(UTC)
        if not force and has_fresh_verification(record, now):
            billing_access(record, now)
            return record
        # Explicit purchase/restore sync can retry now; ordinary requests share a persisted cooldown.
        if force or not _retry_pending(record, now):
            verified = _coalesced_verify(owner, environment)
            # Re-read after coalescing so a later webhook cannot be hidden from a waiter.
            record = billing.get_entitlement(owner, environment)
            if record is None or record.sync_revision < verified.sync_revision:
                raise BillingUnavailable()
        now = datetime.now(UTC)
        if has_fresh_verification(record, now) or allow_outage and _outage_allowed(record, now):
            billing_access(record, now)
            return record
        raise BillingUnavailable()
    except (SupabaseDataError, RevenueCatError, ValidationError, OSError, ValueError) as exc:
        logger.warning("billing verification unavailable error_type=%s", type(exc).__name__)
        raise BillingUnavailable() from exc


def get_billing_status(user_id: str | UUID, *, force: bool = False) -> BillingAccessDecision:
    """Return the shared paid-only decision for an authenticated account."""

    record = get_verified_entitlement(user_id, force=force, allow_outage=True)
    return billing_access(record) if record is not None else BillingAccessDecision(enabled=False, has_access=True)


def invalidate_webhook_users(identities: list[str], environment: str | None) -> list[UUID]:
    """
    invalidate recognized account uuids without trusting event state or user attributes

    - **identities**: canonical/alias ids from an authenticated provider event, including both transfer sides
    - **environment**: event partition; unknown/missing partitions invalidate both
    - **returns**: recognized account IDs after durable invalidation; missing/deleted profiles are ignored
    """

    users = set()
    for value in identities:
        try:
            users.add(UUID(value))
        except (ValueError, TypeError, AttributeError):
            continue
    partitions = [environment.lower()] if environment and environment.lower() in {"sandbox", "production"} else ["sandbox", "production"]
    if len(users) > 100:
        raise BillingUnavailable()
    recognized = sorted(users)
    try:
        for partition in partitions:
            billing.invalidate_entitlements(recognized, partition)
    except (SupabaseDataError, ValidationError) as exc:
        raise BillingUnavailable() from exc
    return recognized
