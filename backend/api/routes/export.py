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
    type: str = Query("overview", description="Card type: overview, top-song, top-artist, wrapped"),
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

    else:
        raise HTTPException(status_code=400, detail="Invalid card type")
