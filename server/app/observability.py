import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.integrations.stdlib import StdlibIntegration

from app.config import RuntimeSettings


def init_sentry(service: str, settings: RuntimeSettings | None = None) -> None:
    """share error reporting across entrypoints without collecting bodies, locals or application logs"""
    settings = settings if settings is not None else RuntimeSettings()
    if not settings.sentry_dsn:
        return

    # background handlers report actual failures explicitly; their 503s also represent normal delivery retries
    http_errors = set(range(500, 600))
    if service != "api":
        http_errors.remove(503)
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=False,
        max_request_body_size="never",
        include_local_variables=False,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        auto_enabling_integrations=False,
        integrations=[
            StarletteIntegration(transaction_style="endpoint", failed_request_status_codes=http_errors),
            FastApiIntegration(transaction_style="endpoint", failed_request_status_codes=http_errors),
        ],
        disabled_integrations=[StdlibIntegration(), HttpxIntegration(), LoggingIntegration()],
    )
    sentry_sdk.set_tag("service", service)


def capture_failure(error: Exception, operation: str) -> None:
    """report a caught failure once and bound delivery before cloud run throttles an idle process"""
    if sentry_sdk.capture_exception(error, tags={"operation": operation}):
        sentry_sdk.flush(timeout=2)
