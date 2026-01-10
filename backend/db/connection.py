from __future__ import annotations

import atexit
import logging
import os
import threading
from contextlib import contextmanager

import psycopg
from pgvector.psycopg import register_vector
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

# Pool configuration
_POOL_MIN_SIZE = int(os.environ.get("SONGBASE_DB_POOL_MIN", "2"))
_POOL_MAX_SIZE = int(os.environ.get("SONGBASE_DB_POOL_MAX", "10"))
_POOL_TIMEOUT = float(os.environ.get("SONGBASE_DB_POOL_TIMEOUT", "30"))
_POOL_MAX_IDLE = float(os.environ.get("SONGBASE_DB_POOL_MAX_IDLE", "300"))

# Global pool instance (lazy initialized)
_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()
_vector_registered: set[int] = set()
_vector_lock = threading.Lock()


def _database_url() -> str:
    url = os.environ.get("SONGBASE_DATABASE_URL")
    if not url:
        raise RuntimeError("SONGBASE_DATABASE_URL is not set.")
    return url


def _ensure_cluster_running(url: str) -> None:
    """Ensure local Postgres cluster is running if using local URL."""
    try:
        from backend.db import local_postgres
    except ImportError:
        return
    if local_postgres and local_postgres.is_local_url(url):
        local_postgres.ensure_cluster()


def _configure_connection(conn: psycopg.Connection) -> None:
    """Configure a connection after checkout (register pgvector)."""
    conn_id = id(conn)
    with _vector_lock:
        if conn_id in _vector_registered:
            return
    try:
        register_vector(conn)
        with _vector_lock:
            _vector_registered.add(conn_id)
    except psycopg.ProgrammingError as exc:
        if "vector type not found" not in str(exc):
            raise
        try:
            conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            conn.commit()
            register_vector(conn)
            with _vector_lock:
                _vector_registered.add(conn_id)
        except Exception:
            conn.rollback()
            raise


def _create_pool() -> ConnectionPool:
    """Create and return a new connection pool."""
    url = _database_url()

    # Ensure cluster is running before creating pool
    try:
        psycopg.connect(url).close()
    except psycopg.OperationalError:
        _ensure_cluster_running(url)

    pool = ConnectionPool(
        conninfo=url,
        min_size=_POOL_MIN_SIZE,
        max_size=_POOL_MAX_SIZE,
        timeout=_POOL_TIMEOUT,
        max_idle=_POOL_MAX_IDLE,
        configure=_configure_connection,
        open=True,
        check=ConnectionPool.check_connection,
    )

    logger.info(
        "Database connection pool initialized (min=%d, max=%d)",
        _POOL_MIN_SIZE,
        _POOL_MAX_SIZE,
    )
    return pool


def _get_pool() -> ConnectionPool:
    """Get or create the global connection pool."""
    global _pool
    if _pool is not None:
        return _pool

    with _pool_lock:
        if _pool is not None:
            return _pool
        _pool = _create_pool()
        return _pool


def close_pool() -> None:
    """Close the connection pool. Called at shutdown."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            try:
                _pool.close()
                logger.info("Database connection pool closed")
            except Exception as e:
                logger.warning("Error closing connection pool: %s", e)
            _pool = None
            with _vector_lock:
                _vector_registered.clear()


# Register cleanup on exit
atexit.register(close_pool)


@contextmanager
def get_connection():
    """Get a connection from the pool.

    Connections are automatically returned to the pool when the context exits.
    The pool handles connection health checks and reconnection.
    """
    pool = _get_pool()
    with pool.connection() as conn:
        yield conn


def get_pool_stats() -> dict:
    """Get connection pool statistics for monitoring."""
    pool = _get_pool()
    return {
        "pool_size": pool.get_stats().get("pool_size", 0),
        "pool_available": pool.get_stats().get("pool_available", 0),
        "requests_waiting": pool.get_stats().get("requests_waiting", 0),
        "pool_min": pool.min_size,
        "pool_max": pool.max_size,
    }
