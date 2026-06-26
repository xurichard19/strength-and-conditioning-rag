import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv
load_dotenv()

from app.core.config import get_settings
from app.rag.vector_store import VectorDB

from app.api.routers import chat, plan

settings = get_settings()
logger = logging.getLogger("uvicorn.error")

@asynccontextmanager
async def lifespan(app: FastAPI):

    logger.info("app startup...")

    app.state.db = VectorDB()
    logger.info("vector store successfully connected")

    # startup logic...
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
