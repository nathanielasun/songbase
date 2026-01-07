from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector


def _database_url() -> str:
    url = os.environ.get("SONGBASE_DATABASE_URL")
    if not url:
        raise RuntimeError("SONGBASE_DATABASE_URL is not set.")
    return url


@contextmanager
def get_connection():
    url = _database_url()
    try:
        conn = psycopg.connect(url)
    except psycopg.OperationalError:
        try:
            from backend.db import local_postgres
        except ImportError:
            local_postgres = None
        if local_postgres and local_postgres.is_local_url(url):
            local_postgres.ensure_cluster()
            conn = psycopg.connect(url)
        else:
            raise
    try:
        register_vector(conn)
    except psycopg.ProgrammingError as exc:
        if "vector type not found" not in str(exc):
            raise
        try:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            conn.commit()
            register_vector(conn)
        except Exception:
            conn.rollback()
            raise
    try:
        yield conn
    finally:
        conn.close()
