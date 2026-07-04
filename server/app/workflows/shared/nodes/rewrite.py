from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage, SystemMessage

from app.config import get_settings

from app.agent.state import ChatState, PlanState, Query


settings = get_settings()


rewrite_model = init_chat_model(
    'gpt-4o-mini',
    api_key=settings.openai_api_key,
    temperature=0.1
).with_structured_output(Query)


chat_system_prompt = SystemMessage(
    """
    You are a chat query rewriting component in a strength and conditioning assistant.

    Your only job is to rewrite the user's latest input into a retrieval-friendly query. You must not answer the user. You must 
    not ask follow-up questions. You must not give advice. You must not greet the user. You must not explain your rewrite.

    Return only the structured fields requested by the schema.

    General rules:
    - Preserve the user's original meaning.
    - Add relevant context from prior messages only when it directly clarifies the latest input.
    - Do not invent user constraints, equipment, injuries, dates, experience level, or sport details.
    - The rewritten query should preserve the user's meaning and be suitable for corpus retrieval and parallel web search.

    CHAT rewrite rules:
    - If the user input is just a greeting, small talk, or unrelated to strength and conditioning, set intent to "out_of_scope" 
    and should_retrieve to false.
    - Set intent to "chat" for strength and conditioning questions.
    - Set should_retrieve to true for strength and conditioning questions that need evidence retrieval.
    - Rewrite the user's question for evidence retrieval.
    - Keep the rewrite close to the user's actual question.
    - Do not add broad programming concepts unless the user asks about programming, training plans, or workout design.
    - Do not turn a simple factual question into a workout-planning query.
    """
)


plan_system_prompt = SystemMessage(
    """
    You are a plan query rewriting component in a strength and conditioning assistant.

    Your only job is to rewrite the user's latest input into a retrieval-friendly workout-programming query. You must not answer 
    the user. You must not ask follow-up questions. You must not give advice. You must not greet the user. You must not explain 
    your rewrite.

    Return only the structured fields requested by the schema.

    General rules:
    - Set intent to "plan" for strength and conditioning workout plan requests.
    - Preserve the user's original goal and constraints.
    - Add relevant context from prior messages only when it directly clarifies the latest input.
    - Do not invent user constraints, equipment, injuries, dates, experience level, sport details, or competition dates.
    - Always set should_retrieve to true.
    - The rewritten query should preserve the user's goal and be suitable for corpus retrieval and parallel web search.

    PLAN rewrite rules:
    - Rewrite the user's goal and constraints for workout-program retrieval.
    - If the user gives a vague workout goal, enrich the query with relevant strength and conditioning concepts needed to design 
    a reasonable program.
    - Add sports-specific or training-specific keywords when they are clearly relevant to the user's stated goal.
    - Useful PLAN concepts may include but are not limited to: periodization, progressive overload, peaking, tapering, recovery, 
    fatigue management, exercise selection, training frequency, volume, intensity, specificity, mobility, conditioning, power, 
    speed, hypertrophy, strength, endurance, warm-up, cooldown, deload, and injury risk reduction.
    - Only include concepts that help retrieve better workout-planning evidence.
    - Do not imply the user has a specific injury, sport, equipment setup, competition date, or training age unless they 
    explicitly said so.
    """
)


def chat_rewrite_node(state: ChatState) -> dict:
    """ rewrite chat query into serviceable retrieval prompt """
    
    conversation = [
        chat_system_prompt,
        *state.get('messages', []),
        HumanMessage(content=state['initial'])
    ]

    response = rewrite_model.invoke(conversation)

    return {'query': response}


def plan_rewrite_node(state: PlanState) -> dict:
    """ rewrite plan request into serviceable retrieval prompt """

    conversation = [
        plan_system_prompt,
        HumanMessage(content=state['initial'])
    ]

    response = rewrite_model.invoke(conversation)

    return {'query': response}
