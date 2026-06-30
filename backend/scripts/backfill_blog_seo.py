"""SEO-only metadata backfill for existing blog posts.

Run from backend/:
  .venv/bin/python scripts/backfill_blog_seo.py --inspect --post-id <uuid>
"""
import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import text
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")

from seo_backfill import (
    EXIT_ARGUMENT,
    EXIT_CONCURRENT_UPDATE,
    EXIT_FAILURE,
    EXIT_GENERATION,
    EXIT_SKIPPED,
    EXIT_SUCCESS,
    EXIT_TRANSACTION,
    SEOBackfillError,
    apply_seo_backfill,
    generate_seo_metadata_for_existing_post,
    inspect_backfill_candidate,
)

SessionLocal = None
BlogPost = None
EXPECTED_ALEMBIC_REVISION = "032"


def _load_db_dependencies():
    global SessionLocal, BlogPost
    if SessionLocal is None or BlogPost is None:
        from db.connection import SessionLocal as _SessionLocal
        from db.models import BlogPost as _BlogPost

        SessionLocal = _SessionLocal
        BlogPost = _BlogPost


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backfill SEO metadata for one existing blog post.")
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--inspect", action="store_true", help="Inspect eligibility without LLM or DB writes.")
    modes.add_argument(
        "--generate-without-save",
        action="store_true",
        help="Generate SEO metadata with LLM but do not write to DB.",
    )
    modes.add_argument("--apply", action="store_true", help="Generate and save SEO metadata for one eligible post.")
    parser.add_argument("--post-id", required=True, help="blog_posts.id to inspect or backfill.")
    parser.add_argument("--confirm-post-id", help="Required for --apply. Must match --post-id.")
    parser.add_argument("--confirm-slug", help="Required for --apply. Must exactly match the DB slug.")
    parser.add_argument("--confirm-database", help="Required for --apply. Must exactly match current_database().")
    parser.add_argument("--yes", action="store_true", help="Required for --apply. Non-interactive confirmation.")
    return parser


def _post_payload(post, inspection, *, mode: str, saved: bool = False, metadata: dict | None = None) -> dict:
    payload = {
        "mode": mode,
        "saved": saved,
        "post_id": inspection.post_id,
        "slug": inspection.slug,
        "agent_id": inspection.agent_id,
        "content_type": inspection.content_type,
        "original_length": inspection.original_length,
        "prepared_length": inspection.prepared_length,
        "eligible": inspection.eligible,
        "skip_reason": inspection.skip_reason,
    }
    if metadata:
        payload["seo"] = {
            "seo_title": metadata["seo_title"],
            "summary": metadata["summary"],
            "seo_description": metadata["seo_description"],
            "lengths": {
                "seo_title": len(metadata["seo_title"]),
                "summary": len(metadata["summary"]),
                "seo_description": len(metadata["seo_description"]),
            },
            "warnings": metadata.get("warnings", []),
            "usage": {
                "model": metadata.get("model"),
                "input_tokens": metadata.get("input_tokens", 0),
                "output_tokens": metadata.get("output_tokens", 0),
                "cache_read_tokens": metadata.get("cache_read_tokens", 0),
                "cache_creation_tokens": metadata.get("cache_creation_tokens", 0),
                "cost_usd": metadata.get("cost_usd", 0.0),
            },
        }
    return payload


def _json_error(error: str, **extra) -> str:
    return json.dumps({"error": error, **extra}, ensure_ascii=False)


def _uuid_matches(left: str, right: str) -> bool:
    return uuid.UUID(left) == uuid.UUID(right)


def _validate_apply_confirmation_args(args: argparse.Namespace) -> str | None:
    if not args.apply:
        return None

    missing = [
        name
        for name, value in (
            ("confirm-post-id", args.confirm_post_id),
            ("confirm-slug", args.confirm_slug),
            ("confirm-database", args.confirm_database),
        )
        if not value
    ]
    if not args.yes:
        missing.append("yes")
    if missing:
        return f"missing_apply_confirmation:{','.join(missing)}"

    try:
        if not _uuid_matches(args.post_id, args.confirm_post_id):
            return "post_id_confirmation_mismatch"
    except ValueError:
        return "invalid_post_id"
    return None


def _read_database_identity(db) -> dict:
    row = db.execute(
        text(
            """
            SELECT
                current_database() AS database_name,
                (SELECT version_num FROM alembic_version LIMIT 1) AS revision
            """
        )
    ).mappings().first()
    return {"database": row["database_name"], "revision": row["revision"]}


async def _run(args: argparse.Namespace) -> int:
    _load_db_dependencies()
    db = SessionLocal()
    try:
        identity = None
        if args.apply:
            identity = _read_database_identity(db)
            if identity["database"] != args.confirm_database:
                print(_json_error(
                    "database_confirmation_mismatch",
                    database=identity["database"],
                    revision=identity["revision"],
                ))
                return EXIT_ARGUMENT
            if identity["revision"] != EXPECTED_ALEMBIC_REVISION:
                print(_json_error(
                    "revision_mismatch",
                    database=identity["database"],
                    revision=identity["revision"],
                    expected_revision=EXPECTED_ALEMBIC_REVISION,
                ))
                return EXIT_ARGUMENT

        post = db.query(BlogPost).filter(BlogPost.id == args.post_id).first()
        if not post:
            print(_json_error("post_not_found", post_id=args.post_id))
            return EXIT_SKIPPED
        if args.apply and post.slug != args.confirm_slug:
            print(_json_error(
                "slug_confirmation_mismatch",
                post_id=post.id,
                slug=post.slug,
            ))
            return EXIT_ARGUMENT

        inspection = inspect_backfill_candidate(post)
        if args.inspect:
            print(json.dumps(_post_payload(post, inspection, mode="inspect"), ensure_ascii=False, indent=2))
            return EXIT_SUCCESS if inspection.eligible else EXIT_SKIPPED

        if not inspection.eligible:
            print(json.dumps(_post_payload(post, inspection, mode="skip"), ensure_ascii=False, indent=2))
            return EXIT_SKIPPED

        if args.apply:
            print(json.dumps({
                "mode": "apply",
                "database": identity["database"],
                "revision": identity["revision"],
                "post_id": post.id,
                "slug": post.slug,
                "agent_id": post.agent_id,
                "content_type": inspection.content_type,
                "published": post.published,
                "seo_state": "all_null",
                "confirmation": "passed",
            }, ensure_ascii=False, indent=2))

        try:
            metadata = await generate_seo_metadata_for_existing_post(
                title=post.title,
                content=post.content,
                agent_id=post.agent_id,
                content_type=inspection.content_type,
            )
        except SEOBackfillError as exc:
            print(_json_error(exc.reason, post_id=post.id, slug=post.slug))
            return exc.exit_code
        except Exception as exc:
            print(_json_error(f"generation_failed: {exc}", post_id=post.id))
            return EXIT_GENERATION

        if args.generate_without_save:
            print(json.dumps(_post_payload(post, inspection, mode="generate-without-save", metadata=metadata), ensure_ascii=False, indent=2))
            return EXIT_SUCCESS

        try:
            apply_seo_backfill(db, post=post, metadata=metadata)
        except SEOBackfillError as exc:
            print(_json_error(exc.reason, post_id=post.id, slug=post.slug))
            return exc.exit_code

        print(json.dumps(_post_payload(post, inspection, mode="apply", saved=True, metadata=metadata), ensure_ascii=False, indent=2))
        return EXIT_SUCCESS
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return EXIT_ARGUMENT if exc.code else EXIT_SUCCESS
    confirmation_error = _validate_apply_confirmation_args(args)
    if confirmation_error:
        print(_json_error(confirmation_error))
        return EXIT_ARGUMENT
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
