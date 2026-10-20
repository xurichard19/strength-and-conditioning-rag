import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from http.client import HTTPException as HTTPProtocolError
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

from app.contracts import BillingEnvironment, BillingSnapshot


MAX_RESPONSE_BYTES = 1024 * 1024


class RevenueCatError(Exception):
    """provider state could not be verified; callers must not infer inactive access"""


def _date(value: object) -> datetime | None:
    """parse an optional provider timestamp and reject missing timezone information"""

    if value is None:
        return None
    if not isinstance(value, str):
        raise RevenueCatError("invalid provider date")
    try:
        result = datetime.fromisoformat(value)
    except ValueError as exc:
        raise RevenueCatError("invalid provider date") from exc
    if result.utcoffset() is None:
        raise RevenueCatError("invalid provider date")
    return result


def normalize_subscriber(payload: object, environment: BillingEnvironment, now: datetime) -> BillingSnapshot:
    """
    select the configured entitlement and verify its actual store environment

    - **payload**: customer info fetched directly from revenuecat
    - **environment**: sandbox for test accounts, production for ordinary live accounts
    - **now**: timezone-aware server time used to evaluate expiration and store grace
    - **returns**: normalized subscription state; ambiguous/malformed state raises an error
    """

    if not isinstance(payload, dict) or not isinstance(payload.get("subscriber"), dict):
        raise RevenueCatError("invalid provider response")
    subscriber = payload["subscriber"]
    entitlements = subscriber.get("entitlements")
    subscriptions = subscriber.get("subscriptions")
    if not isinstance(entitlements, dict) or not isinstance(subscriptions, dict):
        raise RevenueCatError("invalid provider response")
    entitlement = entitlements.get("arcel_pro")
    if entitlement is None:
        return BillingSnapshot()
    if not isinstance(entitlement, dict):
        raise RevenueCatError("invalid provider entitlement")
    product_id = entitlement.get("product_identifier")
    if not isinstance(product_id, str) or not product_id:
        raise RevenueCatError("invalid provider product")
    subscription = subscriptions.get(product_id)
    if not isinstance(subscription, dict) or type(subscription.get("is_sandbox")) is not bool:
        raise RevenueCatError("invalid provider subscription")
    if subscription["is_sandbox"] != (environment == "sandbox"):
        # CustomerInfo can combine environments. Never turn an ambiguous live subscription
        # into a definitive unpaid response just because the selected entitlement is sandbox.
        for candidate in subscriptions.values():
            if not isinstance(candidate, dict) or candidate.get("is_sandbox") is not (environment == "sandbox"):
                continue
            ends = [_date(candidate.get(field)) for field in ("expires_date", "grace_period_expires_date")]
            if candidate.get("refunded_at") is None and any(end is not None and end > now for end in ends):
                raise RevenueCatError("ambiguous provider environment")
        return BillingSnapshot()
    store = subscription.get("store")
    if not isinstance(store, str) or not store:
        raise RevenueCatError("invalid provider store")
    if environment == "production" and store != "app_store":
        return BillingSnapshot()
    expires_at = _date(entitlement.get("expires_date"))
    subscription_expiry = _date(subscription.get("expires_date"))
    # Only recurring subscriptions are sold. Do not infer an unlimited grant from null dates.
    if expires_at is None or subscription_expiry is None:
        raise RevenueCatError("subscription expiry is required")
    expires_at = min(expires_at, subscription_expiry)
    entitlement_grace = _date(entitlement.get("grace_period_expires_date"))
    subscription_grace = _date(subscription.get("grace_period_expires_date"))
    grace_values = [value for value in (entitlement_grace, subscription_grace) if value is not None]
    grace = max(grace_values) if grace_values else None
    period_type = subscription.get("period_type")
    if period_type is not None and not isinstance(period_type, str):
        raise RevenueCatError("invalid provider period")
    refunded = _date(subscription.get("refunded_at")) is not None
    active = not refunded and max(expires_at, grace or expires_at) > now
    will_renew = subscription.get("unsubscribe_detected_at") is None if "unsubscribe_detected_at" in subscription else None
    return BillingSnapshot(product_id=product_id, store=store, period_type=period_type,
        active=active, expires_at=expires_at, grace_expires_at=grace, will_renew=will_renew)


def fetch_entitlement(user_id: UUID, environment: BillingEnvironment, api_key: str) -> BillingSnapshot:
    """
    verify subscription status with a bounded server-to-server request

    - **user_id**: verified supabase uuid also used as the revenuecat app user id
    - **environment**: desired store partition; never selected by the mobile request
    - **api_key**: dedicated server credential, kept out of logs and responses
    - **returns**: normalized entitlement; upstream/decoding failures raise a safe provider error
    """

    request = Request(f"https://api.revenuecat.com/v1/subscribers/{quote(str(user_id), safe='')}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=8) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise RevenueCatError("provider response too large")
        payload = json.loads(body)
    except (HTTPError, OSError, HTTPProtocolError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RevenueCatError("provider unavailable") from exc
    return normalize_subscriber(payload, environment, datetime.now(UTC))


def authorized_webhook(authorization: str | None, expected: str, body: bytes,
                       signature: str | None, signing_secret: str | None) -> bool:
    """
    verify the configured authorization and optional signed raw request body

    - **authorization**: received authorization header
    - **expected**: complete configured header value
    - **body**: raw bytes before json parsing
    - **signature**: optional revenuecat timestamp/signature header
    - **signing_secret**: required verification secret when signing is configured
    - **returns**: whether credentials and optional five-minute replay tolerance pass
    """

    if not authorization or not hmac.compare_digest(authorization.encode(), expected.encode()):
        return False
    if signing_secret is None:
        return True
    if not signature or len(signature) > 512:
        return False
    try:
        entries = [entry.split("=", 1) for entry in signature.split(",")]
        parts = dict(entries)
        if len(entries) != 2 or set(parts) != {"t", "v1"}:
            return False
        timestamp = int(parts["t"])
        if abs(time.time() - timestamp) > 300:
            return False
        digest = hmac.new(signing_secret.encode(), parts["t"].encode() + b"." + body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(digest, parts["v1"])
    except (ValueError, TypeError, UnicodeError):
        return False
