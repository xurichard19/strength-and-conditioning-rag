"""
app interface...
1) turn rag agent into api (maybe use fastapi)
2) convert figma design to frontend with react
3) connect backend to front

stack...
react -> fastapi server -> chromadb on server

key features...
shared stored pdf database
add own training logs to db (into logsdb and add auth)

"""

# run with this from main dir >> fastapi dev app/main.py
# use uvicorn during production >> uvicorn app.main:app --reload

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# agent imports
from shingo.vectordb import VectorDB
from shingo.rag_pipline import answer_question

@asynccontextmanager
async def lifespan(app: FastAPI):

    print("Application is starting up...")

    app.state.db = VectorDB()
    app.state.db.index_system_docs()
    # startup logic...
    yield

    print("Application is shutting down...")

app = FastAPI(lifespan=lifespan)

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
    return {"message": "hello"}

class Question(BaseModel):
    question: str

@app.post("/query/")
async def query(question: Question):
    response = answer_question(question.question, app.state.db)
    return {"response": response}
