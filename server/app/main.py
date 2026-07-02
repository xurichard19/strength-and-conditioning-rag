from contextlib import asynccontextmanager
from fastapi import FastAPI
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

from app.core.config import get_settings
from app.rag.vector_store import VectorDB

# import routers
from app.api.routers import chat, plan


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

    app.state.db = VectorDB()
    logger.info("vector store successfully connected")
    yield

    logger.info("app shutdown...")


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.include_router(chat.router)
app.include_router(plan.router)


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


if settings.environment == "development":
    @app.get("/sentry-debug")
    async def trigger_error():
        division_by_zero = 1 / 0
