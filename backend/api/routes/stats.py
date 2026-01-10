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


@router.get("/library")
async def get_library_stats() -> dict[str, Any]:
    """
    Get comprehensive library statistics.

    Returns total songs, albums, artists, duration, storage size,
    songs by decade/year, and metadata about longest/shortest songs.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_library_stats()
    except Exception as e:
        logger.exception("Failed to get library stats")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/library/growth")
async def get_library_growth(
    period: str = Query("month", description="Grouping period: day, week, month"),
) -> dict[str, Any]:
    """
    Get library growth over time.

    Returns time series of songs added and cumulative totals.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_library_growth(period)
    except Exception as e:
        logger.exception("Failed to get library growth")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/library/composition")
async def get_library_composition() -> dict[str, Any]:
    """
    Get library composition breakdown.

    Returns breakdown by source (local, youtube, etc.),
    verification status, and audio feature availability.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_library_composition()
    except Exception as e:
        logger.exception("Failed to get library composition")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio-features")
async def get_audio_features() -> dict[str, Any]:
    """
    Get audio feature distribution statistics.

    Returns distributions for BPM, energy, danceability, acousticness,
    instrumentalness, and speechiness with min, max, avg, median, and
    histogram buckets.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_audio_feature_stats()
    except Exception as e:
        logger.exception("Failed to get audio feature stats")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio-features/correlation")
async def get_feature_correlations() -> dict[str, Any]:
    """
    Get correlation matrix between audio features.

    Returns Pearson correlation coefficients between features
    and sample scatter plot data for visualization.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_feature_correlations()
    except Exception as e:
        logger.exception("Failed to get feature correlations")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keys")
async def get_key_distribution() -> dict[str, Any]:
    """
    Get musical key distribution.

    Returns songs grouped by musical key with mode (major/minor)
    and Camelot wheel notation.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_key_distribution()
    except Exception as e:
        logger.exception("Failed to get key distribution")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/moods")
async def get_mood_distribution() -> dict[str, Any]:
    """
    Get mood distribution breakdown.

    Returns primary and secondary mood distribution with
    associated audio feature averages per mood.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_mood_distribution()
    except Exception as e:
        logger.exception("Failed to get mood distribution")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listening/timeline")
async def get_listening_timeline(
    period: str = Query("month", description="Time period"),
    granularity: str = Query("day", description="Grouping: hour, day, week, month"),
) -> dict[str, Any]:
    """
    Get listening activity timeline with comparison data.

    Returns time series of plays and duration, comparing to previous period.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_listening_timeline(period, granularity)
    except Exception as e:
        logger.exception("Failed to get listening timeline")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listening/completion-trend")
async def get_completion_rate_trend(
    period: str = Query("month", description="Time period"),
) -> dict[str, Any]:
    """
    Get completion rate trend over time.

    Returns daily completion and skip rates.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_completion_rate_trend(period)
    except Exception as e:
        logger.exception("Failed to get completion trend")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listening/skip-analysis")
async def get_skip_analysis(
    period: str = Query("month", description="Time period"),
    limit: int = Query(20, ge=1, le=100, description="Max songs to return"),
) -> dict[str, Any]:
    """
    Get detailed skip analysis.

    Returns most skipped songs, skip rate by genre, and skip rate by hour.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_skip_analysis(period, limit)
    except Exception as e:
        logger.exception("Failed to get skip analysis")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listening/context")
async def get_context_distribution(
    period: str = Query("month", description="Time period"),
) -> dict[str, Any]:
    """
    Get play context distribution.

    Returns breakdown of where plays originated (radio, playlist, album, etc.)
    with trends over time.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_context_distribution(period)
    except Exception as e:
        logger.exception("Failed to get context distribution")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/listening/sessions")
async def get_listening_sessions(
    period: str = Query("month", description="Time period"),
    limit: int = Query(10, ge=1, le=50, description="Max sessions for longest list"),
) -> dict[str, Any]:
    """
    Get listening session analysis.

    Returns session statistics, length distribution, and longest sessions.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_listening_sessions(period, limit)
    except Exception as e:
        logger.exception("Failed to get listening sessions")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap/enhanced")
async def get_enhanced_heatmap(
    year: int | None = Query(None, description="Year to analyze (defaults to current)"),
) -> dict[str, Any]:
    """
    Get enhanced listening heatmap with top songs per time slot.

    Returns heatmap data with the most played song for each day/hour combination.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_enhanced_heatmap(year)
    except Exception as e:
        logger.exception("Failed to get enhanced heatmap")
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


@router.get("/daily-activity")
async def get_daily_activity(
    days: int = Query(7, ge=1, le=90, description="Number of days to fetch"),
) -> dict[str, Any]:
    """
    Get daily activity data for sparkline charts.

    Returns plays and songs added per day for the specified number of days.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_daily_activity(days)
    except Exception as e:
        logger.exception("Failed to get daily activity")
        raise HTTPException(status_code=500, detail=str(e))


# Discovery endpoints


@router.get("/discoveries/summary")
async def get_discovery_summary(
    period: str = Query("month", description="Time period"),
) -> dict[str, Any]:
    """
    Get discovery summary metrics.

    Returns counts of songs added, new artists discovered,
    new genres explored, and first-time listens.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_discovery_summary(period)
    except Exception as e:
        logger.exception("Failed to get discovery summary")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/recently-added")
async def get_recently_added(
    days: int = Query(30, ge=1, le=365, description="Days to look back"),
    limit: int = Query(50, ge=1, le=200, description="Max songs"),
) -> dict[str, Any]:
    """
    Get recently added songs grouped by date.

    Returns songs added in the specified time period with metadata.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_recently_added(days, limit)
    except Exception as e:
        logger.exception("Failed to get recently added")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/new-artists")
async def get_new_artists(
    period: str = Query("month", description="Time period"),
    limit: int = Query(20, ge=1, le=100, description="Max artists"),
) -> dict[str, Any]:
    """
    Get artists discovered (first played) in this period.

    Returns new artists with the first song heard from each.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_new_artists(period, limit)
    except Exception as e:
        logger.exception("Failed to get new artists")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/genre-exploration")
async def get_genre_exploration(
    period: str = Query("year", description="Time period"),
) -> dict[str, Any]:
    """
    Get genre listening evolution over time.

    Returns monthly genre trends and newly discovered genres.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_genre_exploration(period)
    except Exception as e:
        logger.exception("Failed to get genre exploration")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/unplayed")
async def get_unplayed_songs(
    limit: int = Query(50, ge=1, le=200, description="Max songs"),
) -> dict[str, Any]:
    """
    Get songs in library that have never been played.

    Returns unplayed songs with metadata and library percentage.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_unplayed_songs(limit)
    except Exception as e:
        logger.exception("Failed to get unplayed songs")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/one-hit-wonders")
async def get_one_hit_wonders(
    period: str = Query("all", description="Time period"),
    limit: int = Query(30, ge=1, le=100, description="Max songs"),
) -> dict[str, Any]:
    """
    Get songs played exactly once.

    Returns songs with single plays to encourage re-listening.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_one_hit_wonders(period, limit)
    except Exception as e:
        logger.exception("Failed to get one-hit wonders")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discoveries/hidden-gems")
async def get_hidden_gems(
    limit: int = Query(20, ge=1, le=50, description="Max songs"),
) -> dict[str, Any]:
    """
    Get songs with low play count but high completion rate.

    Returns hidden gem songs that deserve more attention.
    """
    aggregator = get_stats_aggregator()

    try:
        return aggregator.get_hidden_gems(limit)
    except Exception as e:
        logger.exception("Failed to get hidden gems")
        raise HTTPException(status_code=500, detail=str(e))
