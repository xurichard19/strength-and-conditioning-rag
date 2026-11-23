""" shared training-data formatting for chat and planning model inputs """

from typing import cast
from pydantic import JsonValue

from app.contracts import SportsWorkoutRecord, WorkoutRecord


def compact_training(value: JsonValue) -> JsonValue:
    """ - **value**: nested training data serialized as json
    - **returns**: training data with nested storage ids and timestamps removed """
    if isinstance(value, list):
        return [compact_training(item) for item in value]
    if isinstance(value, dict):
        return {key: compact_training(item) for key, item in value.items()
            if key not in {"id", "created_at", "updated_at"} and not key.endswith("_id")}
    return value


def compact_record(record: WorkoutRecord | SportsWorkoutRecord, *, keep_id: bool = False) -> dict[str, JsonValue]:
    """ - **record**: workout or sports session to format
    - **keep_id**: whether to retain the top-level workout id
    - **returns**: a json-ready workout or sports record for planning """
    data = cast(dict[str, JsonValue], compact_training(record.model_dump(mode="json", exclude_none=True)))
    if keep_id:
        data["id"] = str(record.id)
    return data
