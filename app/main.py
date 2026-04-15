# load app interface window


# replace answer question

# run with this from main dir >> fastapi dev app/main.py
# use uvicorn during production >> uvicorn app.main:app --reload

from fastapi import FastAPI
from pydantic import BaseModel

from src.retrieval.llm_client import answer_question

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "hello"}

class Question(BaseModel):
    query: str

@app.post("/query/")
async def query(question: Question):
    response = answer_question(question.query)
    return {"response": response}