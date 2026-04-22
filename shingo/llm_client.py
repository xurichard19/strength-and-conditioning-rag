from dotenv import load_dotenv
from openai import OpenAI
import os

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def generate_response(prompt: str, temperature=0.5) -> str:
    try:
        response = client.responses.create(
            model="gpt-4o-mini",
            input=prompt,
            temperature=temperature
        )
        return response.output_text
    except:
        return "Sorry, something went wrong while generating a response."


# implement after creating chat history ui
def generate_from_messages(messages: list[dict]) -> str:
    pass

"""
>> pip install python-dotenv

then add this to entry point..
from dotenv import load_dotenv
load_dotenv()

"""