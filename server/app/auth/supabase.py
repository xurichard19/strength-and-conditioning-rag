import json
import logging
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)
AUTH_CHALLENGE = {"WWW-Authenticate": "Bearer"}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    if not credentials:
        logger.warning("authentication rejected reason=missing_bearer_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
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
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code in {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN}:
            logger.warning("authentication rejected reason=invalid_or_expired_session status=%s", exc.code)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session",
                headers=AUTH_CHALLENGE,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase auth validation failed",
        ) from exc
    except URLError as exc:
        logger.warning("authentication unavailable reason=supabase_auth_unreachable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Supabase auth is unavailable",
        ) from exc

    user_id = payload.get("id")
    if not isinstance(user_id, str) or not user_id:
        logger.warning("authentication rejected reason=missing_user_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session user",
            headers=AUTH_CHALLENGE,
        )

    email = payload.get("email")
    user = AuthUser(id=user_id, email=email if isinstance(email, str) else None)
    logger.info("authentication accepted user_id=%s", user.id)
    return user
