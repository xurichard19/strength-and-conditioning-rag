"""Coordinate verified subscriptions with durable planning; never generate in a request."""

import logging
from dataclasses import dataclass
from uuid import UUID

from app.contracts import BillingEnvironment, PlanningPauseReason
from app.db.supabase import planning_schedules
from app.services import billing


logger = logging.getLogger(__name__)
UNPAID_RECHECK_SECONDS = 300
UNAVAILABLE_RECHECK_SECONDS = 60


@dataclass(frozen=True)
class PlanningPermission:
    """A server-selected entitlement revision, revalidated by the database at claim time."""

    environment: BillingEnvironment | None = None
    revision: int | None = None


class PlanningDeferred(Exception):
    def __init__(self, reason: PlanningPauseReason):
        self.reason = reason
        super().__init__(reason)


def permission_for(user_id: str | UUID) -> PlanningPermission:
    """Reuse fresh provider verification, without changing planning or consuming attempts."""
    try:
        record = billing.get_verified_entitlement(user_id)
    except billing.BillingUnavailable as exc:
        raise PlanningDeferred("billing_unavailable") from exc
    if record is None:
        return PlanningPermission()  # Billing is deliberately disabled.
    if not billing.billing_access(record).has_access:
        raise PlanningDeferred("subscription_required")
    return PlanningPermission(record.environment, record.sync_revision)


def defer(user_id: str | UUID, reason: PlanningPauseReason) -> None:
    """Retire blocked deliveries durably while leaving authorized running leases alone."""
    delay = UNPAID_RECHECK_SECONDS if reason == "subscription_required" else UNAVAILABLE_RECHECK_SECONDS
    planning_schedules.defer_planning(user_id, reason, delay)
    logger.info("planning deferred user_id=%s reason=%s", user_id, reason)


def reconcile_user(user_id: str | UUID) -> bool:
    """Idempotently resume current work, or persist a payment wait for a later pass."""
    try:
        permission = permission_for(user_id)
    except PlanningDeferred as exc:
        defer(user_id, exc.reason)
        return False
    resumed = planning_schedules.resume_planning(user_id,
        billing_environment=permission.environment, billing_revision=permission.revision)
    if not resumed:
        # Verification may have been invalidated between the provider read and SQL.
        # Keep this account in the bounded reconciliation rotation.
        defer(user_id, "billing_unavailable")
    return resumed


def after_verification(user_id: str | UUID) -> None:
    """A scheduling failure must not turn a verified purchase into a payment error."""
    if not billing.billing_enabled():
        return
    try:
        if reconcile_user(user_id):
            # The scheduler imports this module, so load its best-effort dispatch only here.
            from app.db.supabase import replan_jobs
            from app.jobs.scheduler import dispatch_after_commit

            for job in replan_jobs.get_pending_replans(user_id, 20):
                dispatch_after_commit(job)
    except Exception as exc:
        logger.warning("planning activation deferred user_id=%s error_type=%s", user_id, type(exc).__name__)
