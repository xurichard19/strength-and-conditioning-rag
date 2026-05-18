# >> uvicorn app.main:app --reload

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# agent imports
from app.retrieval.vectordb import VectorDB

from app.api.routers import query

@asynccontextmanager
async def lifespan(app: FastAPI):

    # ideally, we move vectordb to cloud and destroy startup function in favor of keeping a permanent cloud db
    print("app startup...")

    app.state.db = VectorDB()
    app.state.db.index_system_docs()
    # startup logic...
    yield

    print("app shutdown...")

app = FastAPI(lifespan=lifespan)

app.include_router(query.router)

origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "shingo api"}