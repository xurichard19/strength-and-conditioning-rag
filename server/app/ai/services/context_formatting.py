"""Shared training-data formatting for chat and planning model inputs."""


def compact_training(value):
    """remove storage ids and timestamps from nested training data"""
    if isinstance(value, list):
        return [compact_training(item) for item in value]
    if isinstance(value, dict):
        return {key: compact_training(item) for key, item in value.items()
            if key not in {"id", "created_at", "updated_at"} and not key.endswith("_id")}
    return value


def compact_record(record, *, keep_id: bool = False) -> dict:
    """omit storage metadata and nested ids while retaining prescriptions and results"""
    data = compact_training(record.model_dump(mode="json", exclude_none=True))
    if keep_id:
        data["id"] = str(record.id)
    return data
