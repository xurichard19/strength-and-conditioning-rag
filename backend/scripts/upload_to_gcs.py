from __future__ import annotations

import argparse
import hashlib
import mimetypes
import sys
from pathlib import Path
from typing import Iterable

from google.cloud import storage

ALLOWED_EXTENSIONS = {".pdf", ".txt"}

def iter_source_files(root: Path) -> Iterable[Path]:
    """ Yield supported files from root directory recursively"""
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name.startswith("."):
            continue
        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        yield path

def file_md5_hex(path: Path) -> str:
    """ Comppute MD5 for metadata/audit (not security)"""
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def normalize_prefix(prefix: str) -> str:
    return prefix.strip("/")

def build_object_name(source_dir: Path, file_path: Path, dest_prefix: str,) -> str:
    relative = file_path.relative_to(source_dir).as_posix()
    return f"{dest_prefix}/{relative}" if dest_prefix else relative

def upload_file(bucket: storage.Bucket, source_dir: Path, file_path: Path, dest_prefix: str, overwrite: bool, dry_run: bool,) -> tuple[str, str]:
    object_name = build_object_name(source_dir, file_path, dest_prefix)
    uri = f"gs://{bucket.name}/{object_name}"

    content_type, _ = mimetypes.guess_type(file_path.name)
    blob = bucket.blob(object_name)
    source_relpath = file_path.relative_to(source_dir).as_posix()

    if dry_run:
        return ("DRY_RUN", uri)

    blob.metadata = {
        "source_filename": file_path.name,
        "source_relpath": source_relpath,
        "source_md5": file_md5_hex(file_path),
    }
    
    kwargs = {
        "content_type": content_type or "application/octet-stream",
    }

    # if_generation_match = 0 menas "create only if object does not exist"
    if not overwrite:
        kwargs["if_generation_match"] = 0

    blob.upload_from_filename(str(file_path), **kwargs)
    return ("UPLOADED", uri)

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload supported docs from local directory to Google Cloud Storage."
    )
    parser.add_argument(
        "--bucket",
        required=True,
        help="Destination GCS bucket name.",
    )
    parser.add_argument(
        "--source-dir",
        default="./data/raw",
        help="Local source directory (default: ./data/raw).",
    )
    parser.add_argument(
        "--dest-prefix",
        default="raw/system",
        help="Destination prefix in bucket (default: raw/system).",
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help="Optional GCP project ID for storage client.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting existing objects. Default is create-only.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned uploads without writing to GCS.",
    )
    args = parser.parse_args()

    source_dir = Path(args.source_dir).expanduser().resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        print(f"ERROR: source directory not found: {source_dir}", file=sys.stderr)
        return 1
    dest_prefix = normalize_prefix(args.dest_prefix)
    client = storage.Client(project=args.project_id) if args.project_id else storage.Client()
    bucket = client.bucket(args.bucket)
    files = sorted(iter_source_files(source_dir))
    if not files:
        print(f"No supported files found in {source_dir} (.pdf, .txt).")
        return 0
    print(f"Source:      {source_dir}")
    print(f"Bucket:      {args.bucket}")
    print(f"Dest prefix: {dest_prefix or '(root)'}")
    print(f"Files found: {len(files)}")
    print(f"Mode:        {'DRY-RUN' if args.dry_run else 'UPLOAD'}")
    print(f"Overwrite:   {args.overwrite}")
    print("-" * 60)
    uploaded = 0
    skipped_or_failed = 0
    for file_path in files:
        try:
            status, uri = upload_file(
                bucket=bucket,
                source_dir=source_dir,
                file_path=file_path,
                dest_prefix=dest_prefix,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
            )
            print(f"[{status}] {file_path} -> {uri}")
            if status in {"UPLOADED", "DRY_RUN"}:
                uploaded += 1
        except Exception as exc:
            skipped_or_failed += 1
            print(f"[FAILED] {file_path} -> {exc}", file=sys.stderr)
    print("-" * 60)
    print(f"Completed. processed={len(files)} success={uploaded} failed={skipped_or_failed}")
    # Non-zero exit if any failures occurred during real upload.
    if skipped_or_failed and not args.dry_run:
        return 2
    return 0
    
if __name__ == "__main__":
    raise SystemExit(main())