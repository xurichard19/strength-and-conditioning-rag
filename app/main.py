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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from shingo.retrieval.llm_client import answer_question # REMOVE AND REPLACE

app = FastAPI()

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
    response = answer_question(question.question)
    return {"response": response}
