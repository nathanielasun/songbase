"""
Export and Sharing Endpoints

Provides data export in various formats and shareable content generation.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from backend.db.connection import get_connection
from backend.services.stats_aggregator import get_stats_aggregator, parse_period

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/history")
async def export_play_history(
    format: str = Query("json", description="Export format: json or csv"),
    period: str = Query("all", description="Time period: week, month, year, all, YYYY, YYYY-MM"),
    limit: int = Query(10000, description="Maximum number of records", ge=1, le=100000),
) -> StreamingResponse:
    """
    Export play history in JSON or CSV format.

    Args:
        format: Export format (json or csv)
        period: Time period to export
        limit: Maximum records to export

    Returns:
        Streaming response with exported data
    """
    start, end = parse_period(period)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    ps.session_id,
                    ps.sha_id,
                    s.title,
                    COALESCE(a.name, 'Unknown Artist') as artist,
                    s.album,
                    ps.started_at,
                    ps.ended_at,
                    ps.duration_played_ms,
                    ps.song_duration_ms,
                    ps.completion_percent,
                    ps.completed,
                    ps.skipped,
                    ps.context_type,
                    ps.context_id
                FROM play_sessions ps
                JOIN metadata.songs s ON ps.sha_id = s.sha_id
                LEFT JOIN metadata.song_artists sa ON s.sha_id = sa.sha_id AND sa.role = 'primary'
                LEFT JOIN metadata.artists a ON sa.artist_id = a.artist_id
                WHERE ps.started_at >= %s AND ps.started_at < %s
                ORDER BY ps.started_at DESC
                LIMIT %s
                """,
                (start, end, limit),
            )
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(columns)
        for row in rows:
            # Convert datetime objects to ISO strings
            row_data = []
            for val in row:
                if isinstance(val, datetime):
                    row_data.append(val.isoformat())
                else:
                    row_data.append(val)
            writer.writerow(row_data)
        output.seek(0)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=play_history_{period}.csv"
            },
        )

    elif format.lower() == "json":
        data = []
        for row in rows:
            item = {}
            for i, col in enumerate(columns):
                val = row[i]
                if isinstance(val, datetime):
                    item[col] = val.isoformat()
                else:
                    item[col] = val
            data.append(item)

        export_data = {
            "export_date": datetime.now(timezone.utc).isoformat(),
            "period": period,
            "total_records": len(data),
            "data": data,
        }

        return StreamingResponse(
            iter([json.dumps(export_data, indent=2)]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=play_history_{period}.json"
            },
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'json' or 'csv'")


@router.get("/stats")
async def export_statistics(
    format: str = Query("json", description="Export format: json"),
    period: str = Query("year", description="Time period: week, month, year, all, YYYY"),
) -> StreamingResponse:
    """
    Export comprehensive statistics in JSON format.

    Args:
        format: Export format (json only for now)
        period: Time period to export

    Returns:
        Streaming response with statistics
    """
    if format.lower() != "json":
        raise HTTPException(status_code=400, detail="Only JSON format is supported for stats export")

    aggregator = get_stats_aggregator()

    # Collect all statistics
    stats_data = {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "period": period,
        "overview": aggregator.get_overview(period),
        "top_songs": aggregator.get_top_songs(period, limit=50),
        "top_artists": aggregator.get_top_artists(period, limit=50),
        "top_albums": aggregator.get_top_albums(period, limit=50),
        "genre_breakdown": aggregator.get_genre_breakdown(period),
        "trends": aggregator.get_trends(period if period in ["week", "month"] else "month"),
    }

    # Add heatmap for year-based periods
    if period in ["year", "all"] or period.isdigit():
        year = int(period) if period.isdigit() else datetime.now(timezone.utc).year
        stats_data["heatmap"] = aggregator.get_heatmap(year)

    return StreamingResponse(
        iter([json.dumps(stats_data, indent=2)]),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=listening_stats_{period}.json"
        },
    )


@router.get("/wrapped/{year}")
async def export_wrapped(
    year: int,
    format: str = Query("json", description="Export format: json"),
) -> StreamingResponse:
    """
    Export year-in-review (Wrapped) data.

    Args:
        year: Year to export
        format: Export format (json only)

    Returns:
        Streaming response with wrapped data
    """
    if format.lower() != "json":
        raise HTTPException(status_code=400, detail="Only JSON format is supported")

    current_year = datetime.now(timezone.utc).year
    if year < 2020 or year > current_year:
        raise HTTPException(status_code=400, detail=f"Year must be between 2020 and {current_year}")

    aggregator = get_stats_aggregator()
    wrapped_data = aggregator.generate_wrapped(year)
    wrapped_data["export_date"] = datetime.now(timezone.utc).isoformat()

    return StreamingResponse(
        iter([json.dumps(wrapped_data, indent=2)]),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=wrapped_{year}.json"
        },
    )


@router.get("/share-card")
async def get_share_card_data(
    type: str = Query(
        "overview",
        description="Card type: overview, top-song, top-artist, wrapped, monthly-summary, top-5-songs, listening-personality",
    ),
    period: str = Query("month", description="Time period"),
    year: int | None = Query(None, description="Year for wrapped card"),
) -> dict[str, Any]:
    """
    Get data for generating shareable cards.

    Args:
        type: Type of share card
        period: Time period
        year: Year (for wrapped card)

    Returns:
        Data for rendering share card
    """
    aggregator = get_stats_aggregator()

    if type == "overview":
        overview = aggregator.get_overview(period)
        return {
            "card_type": "overview",
            "period": period,
            "title": "My Listening Stats",
            "stats": [
                {"label": "Songs Played", "value": overview["total_plays"]},
                {"label": "Time Listened", "value": overview["total_duration_formatted"]},
                {"label": "Unique Songs", "value": overview["unique_songs"]},
                {"label": "Unique Artists", "value": overview["unique_artists"]},
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "top-song":
        top_songs = aggregator.get_top_songs(period, limit=1)
        if not top_songs["songs"]:
            raise HTTPException(status_code=404, detail="No songs found for this period")

        song = top_songs["songs"][0]
        return {
            "card_type": "top-song",
            "period": period,
            "title": "My Top Song",
            "song": {
                "title": song["title"],
                "artist": song["artist"],
                "play_count": song["play_count"],
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "top-artist":
        top_artists = aggregator.get_top_artists(period, limit=1)
        if not top_artists["artists"]:
            raise HTTPException(status_code=404, detail="No artists found for this period")

        artist = top_artists["artists"][0]
        return {
            "card_type": "top-artist",
            "period": period,
            "title": "My Top Artist",
            "artist": {
                "name": artist["name"],
                "play_count": artist["play_count"],
                "unique_songs": artist["unique_songs"],
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "wrapped":
        if year is None:
            year = datetime.now(timezone.utc).year
        wrapped = aggregator.generate_wrapped(year)
        return {
            "card_type": "wrapped",
            "year": year,
            "title": f"My {year} Wrapped",
            "total_minutes": wrapped["total_minutes"],
            "unique_songs": wrapped["unique_songs"],
            "top_song": wrapped["top_song"],
            "top_artist": wrapped["top_artist"],
            "listening_personality": wrapped["listening_personality"],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "monthly-summary":
        overview = aggregator.get_overview(period)
        top_songs = aggregator.get_top_songs(period, limit=3)
        top_artists = aggregator.get_top_artists(period, limit=3)
        genre_breakdown = aggregator.get_genre_breakdown(period)

        # Calculate listening streak info
        current_streak = overview.get("current_streak_days", 0)
        longest_streak = overview.get("longest_streak_days", 0)

        return {
            "card_type": "monthly-summary",
            "period": period,
            "title": f"My {_format_period_name(period)} Summary",
            "overview": {
                "total_plays": overview["total_plays"],
                "total_duration_formatted": overview["total_duration_formatted"],
                "unique_songs": overview["unique_songs"],
                "unique_artists": overview["unique_artists"],
                "completion_rate": overview.get("avg_completion_rate", 0),
            },
            "top_songs": [
                {"title": s["title"], "artist": s["artist"], "play_count": s["play_count"]}
                for s in top_songs.get("songs", [])[:3]
            ],
            "top_artists": [
                {"name": a["name"], "play_count": a["play_count"]}
                for a in top_artists.get("artists", [])[:3]
            ],
            "top_genres": genre_breakdown.get("genres", [])[:3],
            "streaks": {
                "current": current_streak,
                "longest": longest_streak,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "top-5-songs":
        top_songs = aggregator.get_top_songs(period, limit=5)
        if not top_songs.get("songs"):
            raise HTTPException(status_code=404, detail="No songs found for this period")

        return {
            "card_type": "top-5-songs",
            "period": period,
            "title": f"My Top 5 Songs",
            "songs": [
                {
                    "rank": i + 1,
                    "title": s["title"],
                    "artist": s["artist"],
                    "play_count": s["play_count"],
                    "sha_id": s.get("sha_id"),
                }
                for i, s in enumerate(top_songs.get("songs", [])[:5])
            ],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    elif type == "listening-personality":
        overview = aggregator.get_overview(period)

        # Get audio feature averages if available
        try:
            audio_stats = aggregator.get_audio_feature_stats()
            avg_energy = audio_stats.get("energy", {}).get("average", 0.5)
            avg_danceability = audio_stats.get("danceability", {}).get("average", 0.5)
            avg_tempo = audio_stats.get("bpm", {}).get("average", 120)
        except Exception:
            avg_energy = 0.5
            avg_danceability = 0.5
            avg_tempo = 120

        # Determine listening personality based on patterns
        personality = _determine_listening_personality(overview, avg_energy, avg_danceability)

        return {
            "card_type": "listening-personality",
            "period": period,
            "title": "My Listening Personality",
            "personality": personality["name"],
            "description": personality["description"],
            "traits": personality["traits"],
            "audio_profile": {
                "avg_energy": round(avg_energy * 100),
                "avg_danceability": round(avg_danceability * 100),
                "avg_tempo": round(avg_tempo),
            },
            "stats": {
                "total_plays": overview["total_plays"],
                "unique_artists": overview["unique_artists"],
                "completion_rate": overview.get("avg_completion_rate", 0),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    else:
        raise HTTPException(status_code=400, detail="Invalid card type")


def _format_period_name(period: str) -> str:
    """Format a period string into a human-readable name."""
    if period == "week":
        return "Weekly"
    elif period == "month":
        return "Monthly"
    elif period == "year":
        return "Yearly"
    elif period == "all":
        return "All-Time"
    elif "-" in period:  # YYYY-MM format
        try:
            year, month = period.split("-")
            month_names = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
            ]
            return f"{month_names[int(month) - 1]} {year}"
        except (ValueError, IndexError):
            return period.capitalize()
    elif period.isdigit():  # Year
        return period
    return period.capitalize()


def _determine_listening_personality(
    overview: dict[str, Any],
    avg_energy: float,
    avg_danceability: float,
) -> dict[str, Any]:
    """Determine listening personality based on stats and audio features."""
    total_plays = overview.get("total_plays", 0)
    unique_artists = overview.get("unique_artists", 0)
    completion_rate = overview.get("avg_completion_rate", 50)

    # Calculate variety score (unique artists / plays ratio)
    variety_score = (unique_artists / max(total_plays, 1)) * 100 if total_plays > 0 else 50

    personalities = [
        {
            "name": "The Explorer",
            "description": "You love discovering new music! Your library spans diverse artists and genres.",
            "traits": ["Adventurous", "Open-minded", "Trend-setter"],
            "condition": variety_score > 60,
        },
        {
            "name": "The Devotee",
            "description": "You know what you love! Deep connections with your favorite artists.",
            "traits": ["Loyal", "Passionate", "Focused"],
            "condition": variety_score < 25 and completion_rate > 70,
        },
        {
            "name": "The Energizer",
            "description": "High-energy tracks fuel your day! You love music that gets you moving.",
            "traits": ["Energetic", "Active", "Upbeat"],
            "condition": avg_energy > 0.7 and avg_danceability > 0.6,
        },
        {
            "name": "The Chill Seeker",
            "description": "Relaxation is key. You gravitate towards mellow, calming sounds.",
            "traits": ["Relaxed", "Thoughtful", "Peaceful"],
            "condition": avg_energy < 0.4,
        },
        {
            "name": "The Completionist",
            "description": "You listen to songs all the way through. Quality over quantity.",
            "traits": ["Patient", "Thorough", "Appreciative"],
            "condition": completion_rate > 85,
        },
        {
            "name": "The Sampler",
            "description": "So much music, so little time! You're always on the hunt for the next track.",
            "traits": ["Curious", "Quick", "Diverse"],
            "condition": completion_rate < 50 and total_plays > 100,
        },
        {
            "name": "The Balanced Listener",
            "description": "A perfect mix of old favorites and new discoveries.",
            "traits": ["Balanced", "Versatile", "Adaptable"],
            "condition": True,  # Default fallback
        },
    ]

    for personality in personalities:
        if personality["condition"]:
            return {
                "name": personality["name"],
                "description": personality["description"],
                "traits": personality["traits"],
            }

    # Should never reach here due to default, but just in case
    return personalities[-1]


@router.get("/report/{report_type}")
async def export_report(
    report_type: str,
    format: str = Query("json", description="Export format: json, csv"),
    period: str = Query("month", description="Time period"),
) -> StreamingResponse:
    """
    Export comprehensive reports in various formats.

    Args:
        report_type: Type of report (overview, library, listening, audio, discoveries)
        format: Export format (json or csv)
        period: Time period

    Returns:
        Streaming response with report data
    """
    aggregator = get_stats_aggregator()
    timestamp = datetime.now(timezone.utc).isoformat()

    if report_type == "overview":
        data = {
            "report_type": "overview",
            "period": period,
            "generated_at": timestamp,
            "overview": aggregator.get_overview(period),
            "top_songs": aggregator.get_top_songs(period, limit=20),
            "top_artists": aggregator.get_top_artists(period, limit=20),
            "top_albums": aggregator.get_top_albums(period, limit=20),
            "genre_breakdown": aggregator.get_genre_breakdown(period),
        }

    elif report_type == "library":
        data = {
            "report_type": "library",
            "period": period,
            "generated_at": timestamp,
            "library_stats": aggregator.get_library_stats(),
            "library_growth": aggregator.get_library_growth(period),
            "library_composition": aggregator.get_library_composition(),
        }

    elif report_type == "listening":
        data = {
            "report_type": "listening",
            "period": period,
            "generated_at": timestamp,
            "timeline": aggregator.get_listening_timeline(period),
            "completion_trend": aggregator.get_completion_rate_trend(period),
            "skip_analysis": aggregator.get_skip_analysis(period),
            "context_distribution": aggregator.get_context_distribution(period),
            "sessions": aggregator.get_listening_sessions(period, limit=50),
        }

    elif report_type == "audio":
        data = {
            "report_type": "audio",
            "period": period,
            "generated_at": timestamp,
            "audio_features": aggregator.get_audio_feature_stats(),
            "key_distribution": aggregator.get_key_distribution(),
            "mood_breakdown": aggregator.get_mood_breakdown(),
        }

    elif report_type == "discoveries":
        data = {
            "report_type": "discoveries",
            "period": period,
            "generated_at": timestamp,
            "summary": aggregator.get_discovery_summary(period),
            "recently_added": aggregator.get_recently_added(period, limit=50),
            "new_artists": aggregator.get_new_artists(period, limit=30),
            "unplayed_songs": aggregator.get_unplayed_songs(limit=50),
            "hidden_gems": aggregator.get_hidden_gems(limit=20),
        }

    elif report_type == "full":
        # Comprehensive full report
        data = {
            "report_type": "full",
            "period": period,
            "generated_at": timestamp,
            "overview": aggregator.get_overview(period),
            "top_songs": aggregator.get_top_songs(period, limit=50),
            "top_artists": aggregator.get_top_artists(period, limit=50),
            "genre_breakdown": aggregator.get_genre_breakdown(period),
            "library_stats": aggregator.get_library_stats(),
            "audio_features": aggregator.get_audio_feature_stats(),
        }

    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid report type. Use: overview, library, listening, audio, discoveries, full",
        )

    if format.lower() == "json":
        return StreamingResponse(
            iter([json.dumps(data, indent=2)]),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={report_type}_report_{period}.json"
            },
        )

    elif format.lower() == "csv":
        # Flatten the data for CSV export
        output = io.StringIO()
        writer = csv.writer(output)

        # Write metadata header
        writer.writerow(["Report Type", report_type])
        writer.writerow(["Period", period])
        writer.writerow(["Generated At", timestamp])
        writer.writerow([])  # Empty row separator

        # Write section-specific data
        _write_report_csv_sections(writer, data, report_type)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={report_type}_report_{period}.csv"
            },
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid format. Use 'json' or 'csv'")


def _write_report_csv_sections(writer: csv.writer, data: dict[str, Any], report_type: str) -> None:
    """Write report sections to CSV format."""
    if report_type in ["overview", "full"]:
        if "overview" in data:
            writer.writerow(["=== Overview ==="])
            overview = data["overview"]
            writer.writerow(["Metric", "Value"])
            for key, value in overview.items():
                if not isinstance(value, (list, dict)):
                    writer.writerow([key, value])
            writer.writerow([])

        if "top_songs" in data and data["top_songs"].get("songs"):
            writer.writerow(["=== Top Songs ==="])
            writer.writerow(["Rank", "Title", "Artist", "Play Count"])
            for i, song in enumerate(data["top_songs"]["songs"], 1):
                writer.writerow([i, song["title"], song["artist"], song["play_count"]])
            writer.writerow([])

        if "top_artists" in data and data["top_artists"].get("artists"):
            writer.writerow(["=== Top Artists ==="])
            writer.writerow(["Rank", "Name", "Play Count", "Unique Songs"])
            for i, artist in enumerate(data["top_artists"]["artists"], 1):
                writer.writerow([i, artist["name"], artist["play_count"], artist.get("unique_songs", 0)])
            writer.writerow([])

    if report_type in ["library", "full"]:
        if "library_stats" in data:
            writer.writerow(["=== Library Statistics ==="])
            writer.writerow(["Metric", "Value"])
            for key, value in data["library_stats"].items():
                if not isinstance(value, (list, dict)):
                    writer.writerow([key, value])
            writer.writerow([])

    if report_type == "listening":
        if "sessions" in data and data["sessions"].get("sessions"):
            writer.writerow(["=== Listening Sessions ==="])
            writer.writerow(["Session Start", "Duration (min)", "Songs Played", "Completion Rate"])
            for session in data["sessions"]["sessions"]:
                writer.writerow([
                    session.get("start_time", ""),
                    session.get("duration_minutes", 0),
                    session.get("songs_played", 0),
                    session.get("completion_rate", 0),
                ])
            writer.writerow([])

    if report_type == "discoveries":
        if "recently_added" in data and data["recently_added"].get("songs"):
            writer.writerow(["=== Recently Added Songs ==="])
            writer.writerow(["Title", "Artist", "Album", "Added Date"])
            for song in data["recently_added"]["songs"]:
                writer.writerow([
                    song.get("title", ""),
                    song.get("artist", ""),
                    song.get("album", ""),
                    song.get("created_at", ""),
                ])
            writer.writerow([])
