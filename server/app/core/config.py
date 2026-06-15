from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "shingo api"
    environment: str = "development"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    doc_source: str = "local"
    gcs_bucket: str | None = None
    gcs_prefix_raw: str = "raw/system"
    google_application_credentials: str | None = None

    chroma_tenant: str
    chroma_database: str
    chroma_api_key: str

    openai_api_key: str
    cohere_api_key: str

    supabase_url: str
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
    )

    system_collection_name: str = "system-docs"
    retrieval_top_k: int = 15
    index_batch_size: int = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()
