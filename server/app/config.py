from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "arcel api"
    environment: str = "development"

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:8081",
            "https://arcelassist.vercel.app",
        ]
    )

    doc_source: str = "local"
    gcs_bucket: str | None = None
    gcs_prefix_raw: str = "raw/system"
    google_application_credentials: str | None = None

    chroma_tenant: str
    chroma_database: str
    chroma_api_key: str

    openai_api_key: str
    cohere_api_key: str

    tavily_api_key: str

    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 1.0 # change to 0.1 during prod

    supabase_url: str
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
    )
    supabase_secret_key: SecretStr | None = None

    @field_validator("supabase_url")
    @classmethod
    def validate_supabase_url(cls, value: str) -> str:
        """
        require https before auth or database requests can send credentials

        - **value**: configured supabase project URL
        - **returns**: validated URL without a trailing slash
        """
        url = urlsplit(value)
        if (url.scheme != "https" or not url.hostname or url.username is not None
                or url.password is not None or url.query or url.fragment):
            raise ValueError("supabase url must be an https url without credentials, query, or fragment")
        return value.rstrip("/")

    system_collection_name: str = "system-docs"
    retrieval_top_k: int = 15
    index_batch_size: int = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()
