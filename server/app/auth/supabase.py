import json
import logging
import sentry_sdk
from dataclasses import dataclass
from http.client import HTTPException as HTTPProtocolError
from urllib.error import HTTPError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)
AUTH_CHALLENGE = {"WWW-Authenticate": "Bearer"}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    access_token: str


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if not credentials:
        logger.warning("authentication rejected reason=missing_bearer_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
            headers=AUTH_CHALLENGE,
        )

    return verify_supabase_token(credentials.credentials)


def verify_supabase_token(access_token: str) -> AuthUser:
    settings = get_settings()
    supabase_url = settings.supabase_url.rstrip("/")
    url = f"{supabase_url}/auth/v1/user"

    request = UrlRequest(
        url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": settings.supabase_publishable_key,
        },
    )

    try:
        with sentry_sdk.start_span(op="auth", name="auth.verify_session"), urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
            logger.warning("authentication rejected reason=invalid_or_expired_session status=%s", exc.code)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid or expired session",
                headers=AUTH_CHALLENGE,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="supabase auth validation failed",
        ) from exc
    except (OSError, HTTPProtocolError) as exc:
        logger.warning("authentication unavailable reason=supabase_auth_unreachable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="supabase auth is unavailable",
        ) from exc
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(502, "invalid auth service response") from exc

    user_id = payload.get("id") if isinstance(payload, dict) else None
    if not isinstance(user_id, str) or not user_id:
        logger.warning("authentication rejected reason=missing_user_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid session user",
            headers=AUTH_CHALLENGE,
        )

    email = payload.get("email")
    user = AuthUser(id=user_id, email=email if isinstance(email, str) else None, access_token=access_token)
    logger.info("authentication accepted user_id=%s", user.id)
    return user
