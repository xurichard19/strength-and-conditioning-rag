from functools import lru_cache
from supabase import create_client, Client
from app.core.config import get_settings


@lru_cache
def get_supabase_admin() -> Client:
    settings = get_settings()

    return create_client(
        settings.supabase_url,
        settings.supabase_publishable_key
    )