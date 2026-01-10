"""
Statistics API Routes

Endpoints for retrieving listening statistics and analytics.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from backend.services.stats_aggregator import get_stats_aggregator

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/overview")
async def get_overview(
    period: str = Query("month", description="Time period: week, month, year, all, YYYY, or YYYY-MM"),
) -> dict[str, Any]:
    """
    Get high-level listening statistics.

    Returns total plays, duration, unique songs/artists, streak info, etc.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_overview(period)
    except Exception as e:
        logger.exception("Failed to get overview stats")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-songs")
async def get_top_songs(
    period: str = Query("month", description="Time period"),
    limit: int = Query(10, ge=1, le=100, description="Max songs to return"),
) -> dict[str, Any]:
    """
    Get most played songs for a period.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_top_songs(period, limit)
    except Exception as e:
        logger.exception("Failed to get top songs")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-artists")
async def get_top_artists(
    period: str = Query("month", description="Time period"),
    limit: int = Query(10, ge=1, le=100, description="Max artists to return"),
) -> dict[str, Any]:
    """
    Get most played artists for a period.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_top_artists(period, limit)
    except Exception as e:
        logger.exception("Failed to get top artists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-albums")
async def get_top_albums(
    period: str = Query("month", description="Time period"),
    limit: int = Query(10, ge=1, le=100, description="Max albums to return"),
) -> dict[str, Any]:
    """
    Get most played albums for a period.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_top_albums(period, limit)
    except Exception as e:
        logger.exception("Failed to get top albums")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_history(
    limit: int = Query(50, ge=1, le=200, description="Items per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> dict[str, Any]:
    """
    Get paginated play history.

    Returns recent plays with song details.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_history(limit, offset)
    except Exception as e:
        logger.exception("Failed to get history")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap")
async def get_heatmap(
    year: int | None = Query(None, description="Year to analyze (defaults to current)"),
) -> dict[str, Any]:
    """
    Get listening activity heatmap by day of week and hour.

    Returns play counts for each day/hour combination.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_heatmap(year)
    except Exception as e:
        logger.exception("Failed to get heatmap")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/genres")
async def get_genres(
    period: str = Query("month", description="Time period"),
) -> dict[str, Any]:
    """
    Get genre breakdown for a period.

    Returns genre distribution with play counts and percentages.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_genre_breakdown(period)
    except Exception as e:
        logger.exception("Failed to get genres")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trends")
async def get_trends(
    period: str = Query("week", description="Comparison period: week or month"),
) -> dict[str, Any]:
    """
    Compare current period to previous period.

    Returns percentage changes and trend data.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_trends(period)
    except Exception as e:
        logger.exception("Failed to get trends")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wrapped/{year}")
async def get_wrapped(year: int) -> dict[str, Any]:
    """
    Get year-in-review summary.

    Comprehensive annual listening summary similar to Spotify Wrapped.
    """
    current_year = datetime.now().year
    if year < 2020 or year > current_year:
        raise HTTPException(
            status_code=400,
            detail=f"Year must be between 2020 and {current_year}",
        )

    aggregator = get_stats_aggregator()

    try:
        return aggregator.generate_wrapped(year)
    except Exception as e:
        logger.exception("Failed to generate wrapped")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh-daily")
async def refresh_daily_stats() -> dict[str, Any]:
    """
    Refresh the daily listening stats materialized view.

    Should be called periodically (e.g., hourly) for up-to-date stats.
    """
    from backend.db.connection import get_connection

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT refresh_daily_listening_stats()")
            conn.commit()
        return {"success": True, "message": "Daily stats refreshed"}
    except Exception as e:
        logger.exception("Failed to refresh daily stats")
        raise HTTPException(status_code=500, detail=str(e))
