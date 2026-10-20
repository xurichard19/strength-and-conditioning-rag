from collections import OrderedDict
from concurrent.futures import Future
from datetime import UTC, datetime, timedelta
import logging
from threading import Lock
import time
from uuid import UUID

from pydantic import ValidationError

from app.config import get_settings
from app.contracts import BillingAccessDecision, BillingEntitlementRecord, BillingEnvironment
from app.db.supabase import billing
from app.db.supabase.transport import SupabaseDataError
from app.integrations.revenuecat import RevenueCatError, fetch_entitlement


logger = logging.getLogger(__name__)
FRESHNESS = timedelta(minutes=5)
_lock = Lock()
_inflight: dict[tuple[UUID, str], Future] = {}
_attempts: OrderedDict[tuple[UUID, str], list[float]] = OrderedDict()


class BillingUnavailable(Exception):
    """access cannot currently be verified; this is not a purchase-required decision"""


def billing_enabled() -> bool:
    """keep legacy settings/test doubles and existing deployments disabled by default"""

    return getattr(get_settings(), "billing_enabled", False) is True


def billing_environment(user_id: UUID) -> BillingEnvironment:
    """select the store partition from server deployment and review-account configuration"""

    settings = get_settings()
    reviewers = {UUID(str(value)) for value in getattr(settings, "billing_sandbox_user_ids", [])}
    return "production" if settings.environment == "production" and user_id not in reviewers else "sandbox"


def _fresh(record: BillingEntitlementRecord | None, now: datetime) -> bool:
    """require an uninvalidated verification no older than five minutes"""

    return record is not None and record.verified_at is not None and -timedelta(seconds=30) <= now - record.verified_at <= FRESHNESS


def _decision(record: BillingEntitlementRecord, now: datetime) -> BillingAccessDecision:
    """derive access from verified state and current time, including provider billing grace"""

    end = max(value for value in (record.expires_at, record.grace_expires_at) if value is not None) if record.expires_at else None
    active = record.active and end is not None and end > now
    phase = "inactive"
    if active:
        phase = "grace" if record.expires_at <= now else ("trial" if record.period_type == "trial" else "paid")
    return BillingAccessDecision(enabled=True, has_access=active, phase=phase, product_id=record.product_id,
        expires_at=end, will_renew=record.will_renew, verified_at=record.verified_at)


def _verify(user_id: UUID, environment: BillingEnvironment) -> BillingEntitlementRecord:
    """claim a revision, fetch provider state, and reject superseded verification results"""

    claims = billing.invalidate_entitlements([user_id], environment)
    if len(claims) != 1:
        raise BillingUnavailable()
    key = get_settings().revenuecat_api_key
    if key is None:
        raise BillingUnavailable()
    snapshot = fetch_entitlement(user_id, environment, key.get_secret_value())
    saved = billing.commit_entitlement(user_id, environment, claims[0].sync_revision, snapshot)
    if saved is None:
        saved = billing.get_entitlement(user_id, environment)
        if not _fresh(saved, datetime.now(UTC)):
            raise BillingUnavailable()
    return saved


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
        return pending.result(timeout=45)
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


def get_billing_status(user_id: str | UUID, *, force: bool = False) -> BillingAccessDecision:
    """
    read verified access, refreshing missing, expired or explicitly invalidated state

    - **user_id**: identity already verified by supabase auth
    - **force**: request a bounded refresh after purchase/restore; no client claims are trusted
    - **returns**: access decision; disabled billing avoids all provider/database calls
    """

    if not billing_enabled():
        return BillingAccessDecision(enabled=False, has_access=True)
    owner = UUID(str(user_id))
    environment = billing_environment(owner)
    try:
        record = billing.get_entitlement(owner, environment)
        now = datetime.now(UTC)
        expired = record is not None and record.active and not _decision(record, now).has_access
        if force or not _fresh(record, now) or expired:
            record = _coalesced_verify(owner, environment)
        # Re-read after coalescing so a webhook delivered during a provider call cannot be hidden.
        current = billing.get_entitlement(owner, environment)
        if current is None or current.sync_revision != record.sync_revision or not _fresh(current, datetime.now(UTC)):
            raise BillingUnavailable()
        return _decision(current, datetime.now(UTC))
    except (SupabaseDataError, RevenueCatError, ValidationError, OSError, ValueError) as exc:
        logger.warning("billing verification unavailable error_type=%s", type(exc).__name__)
        raise BillingUnavailable() from exc


def invalidate_webhook_users(identities: list[str], environment: str | None) -> None:
    """
    invalidate recognized account uuids without trusting event state or user attributes

    - **identities**: canonical/alias ids from an authenticated provider event, including both transfer sides
    - **environment**: event partition; unknown/missing partitions invalidate both
    - **returns**: none after durable invalidation; missing/deleted profiles are ignored
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
    try:
        for partition in partitions:
            billing.invalidate_entitlements(sorted(users), partition)
    except (SupabaseDataError, ValidationError) as exc:
        raise BillingUnavailable() from exc
