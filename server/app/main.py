from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# works on start from repo root
from dotenv import load_dotenv
load_dotenv()

# agent imports
from app.core.config import get_settings
from app.retrieval.vectordb import VectorDB

from app.api.routers import query

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):

    print("app startup...")

    app.state.db = VectorDB()
    print("vector store successfully connected")

    # startup logic...
    yield

    print("app shutdown...")

app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.include_router(query.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": settings.app_name}
