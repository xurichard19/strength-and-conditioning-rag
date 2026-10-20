from functools import lru_cache
from ipaddress import ip_address, ip_network
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import AliasChoices, Field, SecretStr, ValidationInfo, field_validator, model_validator
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
    sentry_traces_sample_rate: float = Field(default=0.1, ge=0, le=1)

    supabase_url: str
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
    )
    supabase_secret_key: SecretStr | None = None

    billing_enabled: bool = False
    revenuecat_api_key: SecretStr | None = None
    revenuecat_webhook_authorization: SecretStr | None = None
    revenuecat_webhook_signing_secret: SecretStr | None = None
    revenuecat_app_ids: list[str] = Field(default_factory=list)
    billing_sandbox_user_ids: list[UUID] = Field(default_factory=list)

    @field_validator("revenuecat_webhook_signing_secret", mode="before")
    @classmethod
    def optional_webhook_signing_secret(cls, value):
        """treat an unset/blank optional signing secret as disabled signing"""

        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="after")
    def validate_billing_configuration(self):
        """require backend credentials and app scoping only when billing is enabled"""

        if self.billing_enabled:
            for name in ("revenuecat_api_key", "revenuecat_webhook_authorization", "supabase_secret_key"):
                value = getattr(self, name)
                if value is None or not value.get_secret_value().strip():
                    raise ValueError(f"{name} is required when billing is enabled")
            if not self.revenuecat_app_ids or any(not value.strip() for value in self.revenuecat_app_ids):
                raise ValueError("revenuecat app ids are required when billing is enabled")
            if self.revenuecat_webhook_signing_secret is not None and not self.revenuecat_webhook_signing_secret.get_secret_value().strip():
                raise ValueError("webhook signing secret must not be blank")
        return self

    @field_validator("supabase_url")
    @classmethod
    def validate_supabase_url(cls, value: str, info: ValidationInfo) -> str:
        """
        require https except for local development and test supabase instances

        - **value**: configured supabase project URL
        - **info**: previously validated settings, including the environment
        - **returns**: validated URL without a trailing slash
        """
        url = urlsplit(value)
        local_host = url.hostname == "localhost"
        try:
            address = ip_address(url.hostname or "")
            local_host = address.is_loopback or any(
                address in ip_network(network)
                for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
            )
        except ValueError:
            pass
        local_http = (
            url.scheme == "http" and local_host
            and info.data.get("environment", "").lower() in {"development", "local", "test"}
        )
        if ((url.scheme != "https" and not local_http) or not url.hostname or url.username is not None
                or url.password is not None or url.query or url.fragment):
            raise ValueError(
                "supabase url must use https (local http is allowed in development/test only) "
                "without credentials, query, or fragment"
            )
        return value.rstrip("/")

    system_collection_name: str = "system-docs"
    retrieval_top_k: int = 15
    index_batch_size: int = 300


@lru_cache
def get_settings() -> Settings:
    return Settings()
