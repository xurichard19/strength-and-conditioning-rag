from fastapi import Depends, HTTPException

from app.api.errors import PRIVATE_HEADERS
from app.auth.supabase import AuthUser, require_user
from app.services.billing import BillingUnavailable, get_billing_status


def require_paid_user(user: AuthUser = Depends(require_user)) -> AuthUser:
    """ return the authenticated user when billing is disabled or access is verified. denied
    access returns 403 and unverifiable access returns 503

    - **user**: verified supabase account; clients cannot nominate another billing identity
    - **returns**: authenticated user, or stable 403/503 without provider diagnostics """

    try:
        decision = get_billing_status(user.id)
    except BillingUnavailable as exc:
        raise HTTPException(503, "billing_unavailable", headers=PRIVATE_HEADERS) from exc
    if not decision.has_access:
        raise HTTPException(403, "subscription_required", headers=PRIVATE_HEADERS)
    return user
