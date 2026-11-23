""" coordinate verified subscriptions with durable planning; never generate in a request """

import logging
from dataclasses import dataclass
from uuid import UUID

from app.contracts import BillingEnvironment, PlanningPauseReason
from app.db.supabase import planning_schedules
from app.services import billing


logger = logging.getLogger(__name__)
UNAVAILABLE_RECHECK_SECONDS = 60


@dataclass(frozen=True)
class PlanningPermission:
    """ a server-selected entitlement revision, revalidated by the database at claim time """

    environment: BillingEnvironment | None = None
    revision: int | None = None


class PlanningDeferred(Exception):
    def __init__(self, reason: PlanningPauseReason, permission: PlanningPermission | None = None):
        """ - **reason**: verified denial or temporary verification failure
        - **permission**: observed billing environment and revision, if available
        - **returns**: none. stores the deferral reason and optional permission """
        self.reason = reason
        self.permission = permission
        super().__init__(reason)


def permission_for(user_id: str | UUID) -> PlanningPermission:
    """ reuse fresh provider verification, without changing planning or consuming attempts

    - **user_id**: owner of the account being checked
    - **returns**: planning permission for the observed revision, or a deferral exception """
    try:
        record = billing.get_verified_entitlement(user_id)
    except billing.BillingUnavailable as exc:
        raise PlanningDeferred("billing_unavailable") from exc
    if record is None:
        return PlanningPermission()  # billing is deliberately disabled
    permission = PlanningPermission(record.environment, record.sync_revision)
    if not billing.billing_access(record).has_access:
        raise PlanningDeferred("subscription_required", permission)
    return permission


def defer(user_id: str | UUID, reason: PlanningPauseReason, *,
          permission: PlanningPermission | None = None, wake_token: UUID | None = None) -> bool:
    """ retire blocked deliveries only if their denial still matches current billing

    - **user_id**: owner of the account being checked
    - **reason**: verified denial or temporary verification failure
    - **permission**: observed billing environment and revision, if available
    - **wake_token**: observed wake to acknowledge, if any
    - **returns**: whether the database accepted the payment wait """
    proof = permission or PlanningPermission()
    delay = None if reason == "subscription_required" else UNAVAILABLE_RECHECK_SECONDS
    deferred = planning_schedules.defer_planning(user_id, reason, delay,
        billing_environment=proof.environment, billing_revision=proof.revision, wake_token=wake_token)
    if deferred:
        logger.info("planning deferred user_id=%s reason=%s", user_id, reason)
    return deferred


def reconcile_user(user_id: str | UUID, *, wake_token: UUID | None = None,
                   permission: PlanningPermission | None = None) -> bool:
    """ idempotently resume current work, or persist a payment wait for a later pass

    - **user_id**: owner of the account being checked
    - **wake_token**: observed wake to acknowledge, if any
    - **permission**: observed billing environment and revision, if available
    - **returns**: whether planning resumed """
    try:
        permission = permission or permission_for(user_id)
    except PlanningDeferred as exc:
        defer(user_id, exc.reason, permission=exc.permission, wake_token=wake_token)
        return False
    resumed = planning_schedules.resume_planning(user_id,
        billing_environment=permission.environment, billing_revision=permission.revision, wake_token=wake_token)
    if not resumed:
        # verification may have been invalidated between the provider read and sql.
        # keep this account in the bounded reconciliation rotation.
        defer(user_id, "billing_unavailable", wake_token=wake_token)
    return resumed


def after_verification(user_id: str | UUID, permission: PlanningPermission | None = None) -> None:
    """ a scheduling failure must not turn a verified purchase into a payment error

    - **user_id**: owner of the account being checked
    - **permission**: observed billing environment and revision, if available
    - **returns**: none. attempts to reconcile the account after verification """
    if not billing.billing_enabled():
        return
    try:
        schedule = planning_schedules.get_planning_schedule(user_id, None)
        if schedule is None or schedule.billing_wake_token is None:
            return
        if reconcile_user(user_id, wake_token=schedule.billing_wake_token, permission=permission):
            # the scheduler imports this module, so load its best-effort dispatch only here.
            from app.db.supabase import replan_jobs
            from app.jobs.scheduler import dispatch_after_commit

            for job in replan_jobs.get_pending_replans(user_id, 20):
                dispatch_after_commit(job)
    except Exception as exc:
        logger.warning("planning activation deferred user_id=%s error_type=%s", user_id, type(exc).__name__)
