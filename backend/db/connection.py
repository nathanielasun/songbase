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
    conn = psycopg.connect(_database_url())
    register_vector(conn)
    try:
        yield conn
    finally:
        conn.close()
