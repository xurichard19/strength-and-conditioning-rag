from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
import logging
import sentry_sdk
from sentry_sdk import metrics
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

# remove later, temporary disable for sentry tracing
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.integrations.stdlib import StdlibIntegration

# import env variables
from dotenv import load_dotenv
load_dotenv()

from app.config import get_settings
from app.ai.workflows.chat.graph import build_chat_workflow
from app.ai.workflows.plan.graph import build_plan_workflow

# import routers
from app.api.routers import chat, plan, profile, workouts


settings = get_settings()
logger = logging.getLogger("uvicorn.error")

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        send_default_pii=True,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        disabled_integrations=[
            HttpxIntegration(),
            StdlibIntegration(),
        ],
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app startup...")

    app.state.chat_graph = build_chat_workflow()
    logger.info("chat workflow successfully initialized")
    app.state.plan_graph = build_plan_workflow()
    logger.info("plan workflow successfully initialized")
    yield

    logger.info("app shutdown...")


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(chat.router)
app.include_router(plan.router)
app.include_router(profile.router)
app.include_router(workouts.router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"app": settings.app_name}


@app.get("/health")
async def health():
    return {"status": "ok"}


if settings.environment == "development":
    @app.get("/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0
