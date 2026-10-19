from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.jobs.cloud_tasks import validate_destination


class TaskSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="planning_", extra="ignore")

    enabled: bool = False
    queue: str = ""
    worker_url: str = ""
    invoker_email: str = ""

    @model_validator(mode="after")
    def check_destination(self):
        if self.enabled:
            validate_destination(self.queue, self.worker_url, self.invoker_email)
        return self


@lru_cache(maxsize=1)
def get_task_settings() -> TaskSettings:
    """cache the deployed planning switch and task destination per process"""
    return TaskSettings()
