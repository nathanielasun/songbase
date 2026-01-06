from __future__ import annotations

import sys
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.db.connection import get_connection

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _ensure_migrations_table(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )
    conn.commit()


def _applied_migrations(conn) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT version FROM schema_migrations")
        return {row[0] for row in cur.fetchall()}


def _apply_migration(conn, version: str, sql: str) -> None:
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s)",
            (version,),
        )
    conn.commit()


def main() -> int:
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not migrations:
        print("No migration files found.", file=sys.stderr)
        return 1

    with get_connection() as conn:
        _ensure_migrations_table(conn)
        applied = _applied_migrations(conn)

        for migration in migrations:
            version = migration.name
            if version in applied:
                continue
            sql = migration.read_text(encoding="utf-8")
            print(f"Applying {version}...")
            _apply_migration(conn, version, sql)

    print("Migrations complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
