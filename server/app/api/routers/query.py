import logging

from fastapi import APIRouter, Depends, Request

from app.api.schemas import QueryRequest, QueryResponse, Source
from app.auth.supabase import AuthUser, require_user
from app.generation.rag_pipeline import answer_question


router = APIRouter(prefix='/query')
logger = logging.getLogger(__name__)

@router.post('/', response_model=QueryResponse)
def query_llm(
    query: QueryRequest,
    request: Request,
    user: AuthUser = Depends(require_user),
):
    logger.info("authenticated query requested user_id=%s email=%s", user.id, user.email)

    db = request.app.state.db
    response, context = answer_question(query.text, db)
    sources = []

    for id, document, metadata in zip(context["ids"], context["documents"], context["metadatas"]):
        sources.append(
            Source(
                id=id,
                text=document,
                source=metadata.get("source"),
                page=metadata.get("page"),
            )
        )

    logger.info(
        "authenticated query completed user_id=%s source_count=%s",
        user.id,
        len(sources),
    )

    return QueryResponse(text=response, sources=sources)
