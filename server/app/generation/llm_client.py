from openai import OpenAI
from app.core.config import get_settings

settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key)


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
