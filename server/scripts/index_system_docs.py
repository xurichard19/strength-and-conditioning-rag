from app.rag.vector_store import VectorDB


def main() -> None:
    db = VectorDB()
    db.index_system_docs()
    print(f"indexed {len(db)} system document chunks")


if __name__ == "__main__":
    main()
