from fastapi import APIRouter

from app.api.schemas import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """
    report api liveness after startup completes without exposing configuration

    - **returns**: status ok; this does not verify supabase, model providers, or worker availability
    """

    return HealthResponse()
