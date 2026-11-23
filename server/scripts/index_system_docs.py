from app.observability import init_sentry

init_sentry("indexer")

from app.db.vector.vector_store import VectorDB


def main() -> None:
    """ **inputs**: none. **returns**: none. indexes the configured corpus and prints its chunk count """
    db = VectorDB()
    db.index_system_docs()
    print(f"indexed {len(db)} system document chunks")


if __name__ == "__main__":
    main()
