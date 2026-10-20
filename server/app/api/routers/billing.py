import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.api.errors import PRIVATE_HEADERS, private_response
from app.api.schemas import BillingStatusResponse, RequestModel, RevenueCatWebhookRequest
from app.auth.supabase import AuthUser, require_user
from app.config import get_settings
from app.integrations.revenuecat import MAX_RESPONSE_BYTES, authorized_webhook
from app.services import billing


router = APIRouter(prefix="/billing", tags=["billing"], dependencies=[Depends(private_response)])


def _status(user: AuthUser, force: bool) -> BillingStatusResponse:
    """translate verification failures without exposing provider/database details"""

    try:
        return BillingStatusResponse.model_validate(billing.get_billing_status(user.id, force=force))
    except billing.BillingUnavailable as exc:
        raise HTTPException(503, "billing_unavailable", headers=PRIVATE_HEADERS) from exc


@router.get("/status", response_model=BillingStatusResponse)
def get_status(user: AuthUser = Depends(require_user)) -> BillingStatusResponse:
    """return the authenticated account's billing status, refreshing stale verification"""

    return _status(user, False)


@router.post("/sync", response_model=BillingStatusResponse)
def sync_status(payload: RequestModel | None = None, user: AuthUser = Depends(require_user)) -> BillingStatusResponse:
    """verify this account after purchase/restore; accepts no client entitlement claims"""

    return _status(user, True)


@router.post("/webhooks/revenuecat")
async def receive_webhook(request: Request) -> dict[str, bool]:
    """
    authenticate provider delivery and durably invalidate affected entitlement projections

    - **request**: raw signed payload; no client jwt or entitlement claim is accepted
    - **returns**: acknowledgement only after invalidation commits; failures remain retryable
    """

    if not billing.billing_enabled():
        raise HTTPException(503, "billing_unavailable", headers=PRIVATE_HEADERS)
    settings = get_settings()
    expected = settings.revenuecat_webhook_authorization.get_secret_value()
    authorization = request.headers.get("authorization")
    # Reject unauthenticated traffic before reading/parsing the body.
    if not authorized_webhook(authorization, expected, b"", None, None):
        raise HTTPException(401, "invalid webhook authorization", headers=PRIVATE_HEADERS)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_RESPONSE_BYTES:
            raise HTTPException(413, "webhook body too large", headers=PRIVATE_HEADERS)
    secret = settings.revenuecat_webhook_signing_secret
    if not authorized_webhook(authorization, expected, bytes(body),
            request.headers.get("x-revenuecat-webhook-signature"), secret.get_secret_value() if secret else None):
        raise HTTPException(401, "invalid webhook authorization", headers=PRIVATE_HEADERS)
    try:
        payload = RevenueCatWebhookRequest.model_validate_json(body)
    except ValidationError as exc:
        raise HTTPException(422, "invalid webhook payload", headers=PRIVATE_HEADERS) from exc
    event = payload.event
    if event.app_id not in settings.revenuecat_app_ids and not (event.type == "TRANSFER" and event.app_id is None):
        raise HTTPException(403, "unexpected webhook app", headers=PRIVATE_HEADERS)
    if event.type != "TEST":
        identities = [value for value in (event.app_user_id, event.original_app_user_id) if value]
        identities.extend([*event.aliases, *event.transferred_from, *event.transferred_to])
        try:
            await asyncio.to_thread(billing.invalidate_webhook_users, identities, event.environment)
        except billing.BillingUnavailable as exc:
            raise HTTPException(503, "billing_unavailable", headers=PRIVATE_HEADERS) from exc
    return {"received": True}
