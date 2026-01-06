from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg


def _image_database_url() -> str:
    url = os.environ.get("SONGBASE_IMAGE_DATABASE_URL")
    if not url:
        raise RuntimeError("SONGBASE_IMAGE_DATABASE_URL is not set.")
    return url


@contextmanager
def get_image_connection():
    conn = psycopg.connect(_image_database_url())
    try:
        yield conn
    finally:
        conn.close()
