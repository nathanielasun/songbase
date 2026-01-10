"""
Smart Playlists API Routes

Endpoints for creating and managing rule-based dynamic playlists.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import queue
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.api.events.library_events import (
    emit_library_event,
    event_to_payload,
    get_library_event_hub,
)
from backend.db.connection import get_connection
from backend.services.rule_engine import get_rule_engine, RuleEngineError
from backend.services.playlist_refresher import (
    get_playlist_refresher,
    PlaylistRefresherError,
)

router = APIRouter()
logger = logging.getLogger(__name__)


RULE_PRESETS = [
    {
        "id": "is_recent",
        "label": "Recently Added",
        "description": "Songs added in the last 30 days",
        "rules": {
            "version": 1,
            "match": "all",
            "conditions": [
                {"field": "added_at", "operator": "within_days", "value": 30}
            ],
        },
    },
    {
        "id": "is_liked",
        "label": "Liked Songs",
        "description": "Songs you have liked",
        "rules": {
            "version": 1,
            "match": "all",
            "conditions": [
                {"field": "is_liked", "operator": "is_true", "value": True}
            ],
        },
    },
    {
        "id": "is_short",
        "label": "Short Songs",
        "description": "Tracks under 3 minutes",
        "rules": {
            "version": 1,
            "match": "all",
            "conditions": [
                {"field": "duration_sec", "operator": "less", "value": 180}
            ],
        },
    },
    {
        "id": "is_upbeat",
        "label": "Upbeat Energy",
        "description": "High energy tracks (requires audio features)",
        "rules": {
            "version": 1,
            "match": "all",
            "conditions": [
                {"field": "energy", "operator": "greater", "value": 70}
            ],
        },
    },
]


def _encode_share_payload(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(encoded).decode("ascii").rstrip("=")


def _decode_share_payload(token: str) -> dict[str, Any]:
    padded = token + "=" * (-len(token) % 4)
    data = base64.urlsafe_b64decode(padded.encode("ascii"))
    return json.loads(data.decode("utf-8"))


def _build_song_filter(sha_ids: list[str] | None, alias: str = "s") -> tuple[str, list[Any]]:
    base = "WHERE 1=1"
    if not sha_ids:
        return base, []
    placeholders = ", ".join("%s" for _ in sha_ids)
    return f"{base} AND {alias}.sha_id IN ({placeholders})", list(sha_ids)


def _suggest_rules(sha_ids: list[str] | None, limit: int) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []

    with get_connection() as conn:
        with conn.cursor() as cur:
            song_filter, params = _build_song_filter(sha_ids)

            cur.execute(
                f"SELECT COUNT(DISTINCT s.sha_id) FROM metadata.songs s {song_filter}",
                params,
            )
            total_songs = cur.fetchone()[0] or 0

            if total_songs == 0:
                return []

            cur.execute(
                f"""
                SELECT a.name, COUNT(DISTINCT s.sha_id) as song_count
                FROM metadata.song_artists sa
                JOIN metadata.artists a ON a.artist_id = sa.artist_id
                JOIN metadata.songs s ON s.sha_id = sa.sha_id
                {song_filter}
                GROUP BY a.name
                ORDER BY song_count DESC
                LIMIT 1
                """,
                params,
            )
            top_artist = cur.fetchone()

            cur.execute(
                f"""
                SELECT g.name, COUNT(DISTINCT s.sha_id) as song_count
                FROM metadata.song_genres sg
                JOIN metadata.genres g ON g.genre_id = sg.genre_id
                JOIN metadata.songs s ON s.sha_id = sg.sha_id
                {song_filter}
                GROUP BY g.name
                ORDER BY song_count DESC
                LIMIT 1
                """,
                params,
            )
            top_genre = cur.fetchone()

            cur.execute(
                f"""
                SELECT MIN(s.release_year), MAX(s.release_year)
                FROM metadata.songs s
                {song_filter}
                AND s.release_year IS NOT NULL
                """,
                params,
            )
            year_range = cur.fetchone()

            cur.execute(
                f"""
                SELECT COUNT(DISTINCT s.sha_id)
                FROM metadata.songs s
                {song_filter}
                AND s.created_at >= NOW() - INTERVAL '30 days'
                """,
                params,
            )
            recent_count = cur.fetchone()[0] or 0

    if top_artist:
        name, count = top_artist
        ratio = count / total_songs
        if ratio >= 0.6:
            suggestions.append(
                {
                    "id": f"artist:{name}",
                    "label": f"Artist is {name}",
                    "description": f"{count} of {total_songs} songs by {name}",
                    "score": ratio,
                    "rules": {
                        "version": 1,
                        "match": "all",
                        "conditions": [
                            {"field": "artist", "operator": "equals", "value": name}
                        ],
                    },
                }
            )

    if top_genre:
        name, count = top_genre
        ratio = count / total_songs
        if ratio >= 0.6:
            suggestions.append(
                {
                    "id": f"genre:{name}",
                    "label": f"Genre is {name}",
                    "description": f"{count} of {total_songs} songs tagged {name}",
                    "score": ratio,
                    "rules": {
                        "version": 1,
                        "match": "all",
                        "conditions": [
                            {"field": "genre", "operator": "equals", "value": name}
                        ],
                    },
                }
            )

    if year_range and year_range[0] and year_range[1]:
        min_year, max_year = year_range
        if max_year - min_year <= 10:
            suggestions.append(
                {
                    "id": f"years:{min_year}-{max_year}",
                    "label": f"Years {min_year}-{max_year}",
                    "description": "Narrow release year range",
                    "score": 0.4,
                    "rules": {
                        "version": 1,
                        "match": "all",
                        "conditions": [
                            {
                                "field": "release_year",
                                "operator": "between",
                                "value": [min_year, max_year],
                            }
                        ],
                    },
                }
            )

    if recent_count >= 5:
        ratio = recent_count / total_songs
        if ratio >= 0.2:
            suggestions.append(
                {
                    "id": "recent:30",
                    "label": "Recently Added",
                    "description": f"{recent_count} songs added in the last 30 days",
                    "score": ratio,
                    "rules": {
                        "version": 1,
                        "match": "all",
                        "conditions": [
                            {"field": "added_at", "operator": "within_days", "value": 30}
                        ],
                    },
                }
            )

    suggestions.sort(key=lambda item: item.get("score", 0), reverse=True)
    return suggestions[:limit]


# Request/Response Models


class RuleCondition(BaseModel):
    """A single rule condition."""

    field: str
    operator: str
    value: Any = None


class RuleGroup(BaseModel):
    """A group of conditions or nested groups."""

    version: int = 1
    match: str = "all"  # "all" (AND) or "any" (OR)
    conditions: list[dict] = Field(default_factory=list)


class CreateSmartPlaylistRequest(BaseModel):
    """Request to create a new smart playlist."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    rules: dict = Field(..., description="Rule definition JSON")
    sort_by: str = "added_at"
    sort_order: str = "desc"
    limit_count: int | None = None
    auto_refresh: bool = True


class UpdateSmartPlaylistRequest(BaseModel):
    """Request to update a smart playlist."""

    name: str | None = None
    description: str | None = None
    rules: dict | None = None
    sort_by: str | None = None
    sort_order: str | None = None
    limit_count: int | None = None
    auto_refresh: bool | None = None


class PreviewRulesRequest(BaseModel):
    """Request to preview rule results."""

    rules: dict
    sort_by: str = "added_at"
    sort_order: str = "desc"
    limit: int = Field(default=20, ge=1, le=100)
    liked_song_ids: list[str] = Field(default_factory=list)
    disliked_song_ids: list[str] = Field(default_factory=list)


class RefreshRequest(BaseModel):
    """Request with user preferences for refresh."""

    liked_song_ids: list[str] = Field(default_factory=list)
    disliked_song_ids: list[str] = Field(default_factory=list)


class CreateFromTemplateRequest(BaseModel):
    """Request to create playlist from template."""

    name: str | None = None
    liked_song_ids: list[str] = Field(default_factory=list)
    disliked_song_ids: list[str] = Field(default_factory=list)


class ImportSmartPlaylistRequest(BaseModel):
    """Request to import a smart playlist definition."""

    name: str | None = None
    description: str | None = None
    rules: dict
    sort_by: str = "added_at"
    sort_order: str = "desc"
    limit_count: int | None = None
    auto_refresh: bool = True


class ShareRulesRequest(BaseModel):
    """Request to encode a ruleset for sharing."""

    rules: dict
    sort_by: str = "added_at"
    sort_order: str = "desc"
    limit_count: int | None = None
    auto_refresh: bool = True


class SuggestRulesRequest(BaseModel):
    """Request to generate rule suggestions."""

    sha_ids: list[str] | None = None
    limit: int = Field(default=5, ge=1, le=20)


class ConvertPlaylistRequest(BaseModel):
    """Request to convert a static playlist to a smart playlist."""

    name: str
    description: str | None = None
    sha_ids: list[str]
    suggestion_id: str | None = None


class ExplainRulesRequest(BaseModel):
    """Request to explain a rules query."""

    rules: dict
    sort_by: str = "added_at"
    sort_order: str = "desc"
    limit: int = Field(default=100, ge=1, le=500)
    liked_song_ids: list[str] = Field(default_factory=list)
    disliked_song_ids: list[str] = Field(default_factory=list)


class PreferencesChangedRequest(BaseModel):
    """Notify preference changes for auto-refresh."""

    liked_song_ids: list[str] = Field(default_factory=list)
    disliked_song_ids: list[str] = Field(default_factory=list)


# Endpoints


@router.post("")
async def create_smart_playlist(
    request: CreateSmartPlaylistRequest,
    liked_song_ids: list[str] = Query(default=[]),
    disliked_song_ids: list[str] = Query(default=[]),
) -> dict[str, Any]:
    """
    Create a new smart playlist.

    The playlist rules will be validated and an initial refresh performed.
    """
    # Validate rules
    engine = get_rule_engine()
    try:
        parsed_rules = engine.parse(request.rules)
        warnings = engine.validate(parsed_rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Create playlist
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO smart_playlists (
                    name, description, rules, sort_by, sort_order,
                    limit_count, auto_refresh
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING playlist_id
                """,
                (
                    request.name,
                    request.description,
                    request.rules,
                    request.sort_by,
                    request.sort_order,
                    request.limit_count,
                    request.auto_refresh,
                ),
            )
            playlist_id = cur.fetchone()[0]
        conn.commit()

    # Perform initial refresh
    refresher = get_playlist_refresher()
    try:
        result = refresher.refresh_single(
            str(playlist_id),
            liked_song_ids=set(liked_song_ids),
            disliked_song_ids=set(disliked_song_ids),
        )
    except PlaylistRefresherError as e:
        logger.warning(f"Initial refresh failed: {e}")
        result = {"song_count": 0}

    return {
        "playlist_id": str(playlist_id),
        "name": request.name,
        "song_count": result["song_count"],
        "warnings": warnings,
    }


@router.get("")
async def list_smart_playlists(
    include_templates: bool = Query(False, description="Include template playlists"),
) -> dict[str, Any]:
    """
    List all smart playlists.

    Returns playlist metadata without the full song list.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            if include_templates:
                cur.execute(
                    """
                    SELECT
                        playlist_id, name, description, song_count,
                        total_duration_sec, last_refreshed_at, created_at,
                        updated_at, is_template, template_category,
                        sort_by, sort_order, limit_count, auto_refresh
                    FROM smart_playlists
                    ORDER BY is_template ASC, updated_at DESC
                    """
                )
            else:
                cur.execute(
                    """
                    SELECT
                        playlist_id, name, description, song_count,
                        total_duration_sec, last_refreshed_at, created_at,
                        updated_at, is_template, template_category,
                        sort_by, sort_order, limit_count, auto_refresh
                    FROM smart_playlists
                    WHERE is_template = FALSE
                    ORDER BY updated_at DESC
                    """
                )
            rows = cur.fetchall()

    playlists = [
        {
            "playlist_id": str(row[0]),
            "name": row[1],
            "description": row[2],
            "song_count": row[3],
            "total_duration_sec": row[4],
            "last_refreshed_at": row[5].isoformat() if row[5] else None,
            "created_at": row[6].isoformat() if row[6] else None,
            "updated_at": row[7].isoformat() if row[7] else None,
            "is_template": row[8],
            "template_category": row[9],
            "sort_by": row[10],
            "sort_order": row[11],
            "limit_count": row[12],
            "auto_refresh": row[13],
        }
        for row in rows
    ]

    return {"playlists": playlists}


@router.get("/templates")
async def list_templates() -> dict[str, Any]:
    """
    Get available smart playlist templates.

    Templates are pre-defined rule sets that users can use as starting points.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    playlist_id, name, description, rules,
                    template_category, sort_by, sort_order
                FROM smart_playlists
                WHERE is_template = TRUE
                ORDER BY template_category, name
                """
            )
            rows = cur.fetchall()

            # Get distinct categories
            cur.execute(
                """
                SELECT DISTINCT template_category
                FROM smart_playlists
                WHERE is_template = TRUE AND template_category IS NOT NULL
                ORDER BY template_category
                """
            )
            categories = [row[0] for row in cur.fetchall()]

    templates = [
        {
            "playlist_id": str(row[0]),
            "name": row[1],
            "description": row[2],
            "rules": row[3],
            "category": row[4],
            "sort_by": row[5],
            "sort_order": row[6],
        }
        for row in rows
    ]

    return {
        "templates": templates,
        "categories": categories,
    }


@router.post("/from-template/{template_id}")
async def create_from_template(
    template_id: str,
    request: CreateFromTemplateRequest,
) -> dict[str, Any]:
    """
    Create a new smart playlist from a template.

    Copies the template's rules and optionally allows a custom name.
    """
    # Get template
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT name, description, rules, sort_by, sort_order
                FROM smart_playlists
                WHERE playlist_id = %s AND is_template = TRUE
                """,
                (template_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Template not found")

            template_name = row[0]
            template_description = row[1]
            template_rules = row[2]
            sort_by = row[3]
            sort_order = row[4]

            # Create new playlist with template's rules
            name = request.name or f"My {template_name}"

            cur.execute(
                """
                INSERT INTO smart_playlists (
                    name, description, rules, sort_by, sort_order, auto_refresh
                )
                VALUES (%s, %s, %s, %s, %s, TRUE)
                RETURNING playlist_id
                """,
                (name, template_description, template_rules, sort_by, sort_order),
            )
            playlist_id = cur.fetchone()[0]
        conn.commit()

    # Perform initial refresh
    refresher = get_playlist_refresher()
    try:
        result = refresher.refresh_single(
            str(playlist_id),
            liked_song_ids=set(request.liked_song_ids),
            disliked_song_ids=set(request.disliked_song_ids),
        )
    except PlaylistRefresherError as e:
        logger.warning(f"Initial refresh failed: {e}")
        result = {"song_count": 0}

    return {
        "playlist_id": str(playlist_id),
        "name": name,
        "song_count": result["song_count"],
    }


@router.get("/preview")
async def preview_rules(
    rules: str = Query(..., description="JSON-encoded rules"),
    sort_by: str = Query("added_at"),
    sort_order: str = Query("desc"),
    limit: int = Query(20, ge=1, le=100),
    liked_song_ids: list[str] = Query(default=[]),
    disliked_song_ids: list[str] = Query(default=[]),
) -> dict[str, Any]:
    """
    Preview rule results without saving.

    Useful for live preview while building rules.
    """
    import json

    try:
        rules_dict = json.loads(rules)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    # Validate rules first
    engine = get_rule_engine()
    try:
        engine.parse(rules_dict)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Execute preview
    refresher = get_playlist_refresher()
    try:
        result = refresher.preview_rules(
            rules=rules_dict,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            liked_song_ids=set(liked_song_ids),
            disliked_song_ids=set(disliked_song_ids),
        )
    except PlaylistRefresherError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in preview_rules")
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")

    return result


@router.post("/preview")
async def preview_rules_post(request: PreviewRulesRequest) -> dict[str, Any]:
    """
    Preview rule results without saving (POST version for complex rules).
    """
    # Validate rules first
    engine = get_rule_engine()
    try:
        engine.parse(request.rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Execute preview
    refresher = get_playlist_refresher()
    try:
        result = refresher.preview_rules(
            rules=request.rules,
            sort_by=request.sort_by,
            sort_order=request.sort_order,
            limit=request.limit,
            liked_song_ids=set(request.liked_song_ids),
            disliked_song_ids=set(request.disliked_song_ids),
        )
    except PlaylistRefresherError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error in preview_rules_post")
        raise HTTPException(status_code=500, detail=f"Preview failed: {str(e)}")

    return result


@router.get("/refresh/stream")
async def refresh_status_stream(
    types: str | None = Query(
        None,
        description="Comma-separated event types to include",
    )
) -> StreamingResponse:
    """
    Stream smart playlist refresh status updates via Server-Sent Events.
    """
    event_queue = get_library_event_hub().subscribe()
    type_filter = set(t.strip() for t in types.split(",") if t.strip()) if types else None

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.to_thread(event_queue.get, True, 0.5)
                    if type_filter and event.event_type not in type_filter:
                        continue
                    payload = event_to_payload(event)
                    yield f"data: {json.dumps(payload)}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
                    await asyncio.sleep(0.1)
        finally:
            get_library_event_hub().unsubscribe(event_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/presets")
async def list_rule_presets() -> dict[str, Any]:
    """List available rule presets."""
    return {"presets": RULE_PRESETS}


@router.post("/suggest")
async def suggest_rules(request: SuggestRulesRequest) -> dict[str, Any]:
    """Suggest rule definitions based on library composition."""
    suggestions = _suggest_rules(request.sha_ids, request.limit)
    return {"suggestions": suggestions}


@router.post("/convert")
async def convert_playlist(request: ConvertPlaylistRequest) -> dict[str, Any]:
    """Convert a static playlist to a smart playlist by suggesting rules."""
    if not request.sha_ids:
        raise HTTPException(status_code=400, detail="No songs provided.")

    suggestions = _suggest_rules(request.sha_ids, limit=10)
    if not suggestions:
        raise HTTPException(
            status_code=400,
            detail="Unable to suggest rules for the provided playlist.",
        )

    suggestion = None
    if request.suggestion_id:
        for candidate in suggestions:
            if candidate["id"] == request.suggestion_id:
                suggestion = candidate
                break
        if suggestion is None:
            raise HTTPException(status_code=404, detail="Suggestion not found.")
    else:
        suggestion = suggestions[0]

    rules = suggestion["rules"]
    engine = get_rule_engine()
    try:
        engine.parse(rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO smart_playlists (
                    name, description, rules, sort_by, sort_order,
                    limit_count, auto_refresh
                )
                VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                RETURNING playlist_id
                """,
                (
                    request.name,
                    request.description,
                    rules,
                    "added_at",
                    "desc",
                    None,
                ),
            )
            playlist_id = cur.fetchone()[0]
        conn.commit()

    refresher = get_playlist_refresher()
    try:
        refresh_result = refresher.refresh_single(str(playlist_id))
        song_count = refresh_result["song_count"]
    except PlaylistRefresherError:
        song_count = 0

    return {
        "playlist_id": str(playlist_id),
        "song_count": song_count,
        "suggestion": suggestion,
        "alternates": suggestions,
    }


@router.post("/import")
async def import_smart_playlist(
    request: ImportSmartPlaylistRequest,
) -> dict[str, Any]:
    """Import a smart playlist definition and create a new playlist."""
    engine = get_rule_engine()
    try:
        engine.parse(request.rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    name = request.name or f"Imported Playlist {datetime.now(timezone.utc).date()}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO smart_playlists (
                    name, description, rules, sort_by, sort_order,
                    limit_count, auto_refresh
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING playlist_id
                """,
                (
                    name,
                    request.description,
                    request.rules,
                    request.sort_by,
                    request.sort_order,
                    request.limit_count,
                    request.auto_refresh,
                ),
            )
            playlist_id = cur.fetchone()[0]
        conn.commit()

    refresher = get_playlist_refresher()
    try:
        result = refresher.refresh_single(str(playlist_id))
        song_count = result["song_count"]
    except PlaylistRefresherError:
        song_count = 0

    return {
        "playlist_id": str(playlist_id),
        "name": name,
        "song_count": song_count,
    }


@router.post("/share")
async def share_rules(request: ShareRulesRequest) -> dict[str, Any]:
    """Encode a ruleset for sharing."""
    payload = {
        "rules": request.rules,
        "sort_by": request.sort_by,
        "sort_order": request.sort_order,
        "limit_count": request.limit_count,
        "auto_refresh": request.auto_refresh,
    }
    token = _encode_share_payload(payload)
    return {
        "share_token": token,
        "share_payload": payload,
    }


@router.get("/share/{token}")
async def decode_shared_rules(token: str) -> dict[str, Any]:
    """Decode a shared rules token."""
    try:
        payload = _decode_share_payload(token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid share token: {e}")
    return payload


@router.post("/preview/explain")
async def explain_rules_preview(request: ExplainRulesRequest) -> dict[str, Any]:
    """Explain a rules query without saving."""
    engine = get_rule_engine()
    try:
        engine.parse(request.rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    refresher = get_playlist_refresher()
    try:
        result = refresher.explain_rules(
            rules=request.rules,
            sort_by=request.sort_by,
            sort_order=request.sort_order,
            limit=request.limit,
            liked_song_ids=set(request.liked_song_ids),
            disliked_song_ids=set(request.disliked_song_ids),
        )
    except PlaylistRefresherError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.post("/preferences/changed")
async def preferences_changed(request: PreferencesChangedRequest) -> dict[str, Any]:
    """Notify the backend that preferences changed for auto-refresh."""
    emit_library_event(
        "preferences_updated",
        payload={
            "liked_song_ids": request.liked_song_ids,
            "disliked_song_ids": request.disliked_song_ids,
        },
    )
    return {"success": True}


@router.get("/{playlist_id}")
async def get_smart_playlist(playlist_id: str) -> dict[str, Any]:
    """
    Get a smart playlist with its songs.

    Returns full playlist details including the song list.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Get playlist details
            cur.execute(
                """
                SELECT
                    playlist_id, name, description, rules, sort_by, sort_order,
                    limit_count, song_count, total_duration_sec,
                    last_refreshed_at, created_at, updated_at, auto_refresh
                FROM smart_playlists
                WHERE playlist_id = %s AND is_template = FALSE
                """,
                (playlist_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Playlist not found")

            playlist = {
                "playlist_id": str(row[0]),
                "name": row[1],
                "description": row[2],
                "rules": row[3],
                "sort_by": row[4],
                "sort_order": row[5],
                "limit_count": row[6],
                "song_count": row[7],
                "total_duration_sec": row[8],
                "last_refreshed_at": row[9].isoformat() if row[9] else None,
                "created_at": row[10].isoformat() if row[10] else None,
                "updated_at": row[11].isoformat() if row[11] else None,
                "auto_refresh": row[12],
            }

            # Get songs with full metadata
            cur.execute(
                """
                SELECT
                    sps.sha_id,
                    sps.position,
                    s.title,
                    s.album,
                    s.album_id,
                    s.duration_sec,
                    s.release_year,
                    (
                        SELECT STRING_AGG(DISTINCT a.name, ', ')
                        FROM metadata.song_artists sa
                        JOIN metadata.artists a ON a.artist_id = sa.artist_id
                        WHERE sa.sha_id = s.sha_id
                    ) as artist,
                    (
                        SELECT ARRAY_AGG(a.name ORDER BY sa.artist_id)
                        FROM metadata.song_artists sa
                        JOIN metadata.artists a ON a.artist_id = sa.artist_id
                        WHERE sa.sha_id = s.sha_id
                    ) as artists,
                    (
                        SELECT ARRAY_AGG(sa.artist_id ORDER BY sa.artist_id)
                        FROM metadata.song_artists sa
                        WHERE sa.sha_id = s.sha_id
                    ) as artist_ids,
                    (
                        SELECT sa.artist_id
                        FROM metadata.song_artists sa
                        WHERE sa.sha_id = s.sha_id
                        ORDER BY sa.artist_id
                        LIMIT 1
                    ) as primary_artist_id
                FROM smart_playlist_songs sps
                JOIN metadata.songs s ON s.sha_id = sps.sha_id
                WHERE sps.playlist_id = %s
                ORDER BY sps.position
                """,
                (playlist_id,),
            )
            song_rows = cur.fetchall()

    songs = [
        {
            "sha_id": row[0],
            "position": row[1],
            "title": row[2],
            "album": row[3],
            "album_id": str(row[4]) if row[4] else None,
            "duration_sec": row[5],
            "release_year": row[6],
            "artist": row[7],
            "artists": row[8] or [],
            "artist_ids": [str(aid) for aid in row[9]] if row[9] else [],
            "primary_artist_id": str(row[10]) if row[10] else None,
        }
        for row in song_rows
    ]

    playlist["songs"] = songs

    # Generate human-readable rule explanation
    engine = get_rule_engine()
    try:
        parsed_rules = engine.parse(playlist["rules"])
        playlist["rules_explanation"] = engine.explain(parsed_rules)
    except Exception:
        playlist["rules_explanation"] = None

    return playlist


@router.get("/{playlist_id}/export")
async def export_smart_playlist(playlist_id: str) -> dict[str, Any]:
    """Export a smart playlist definition."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    playlist_id, name, description, rules, sort_by, sort_order,
                    limit_count, auto_refresh, created_at, updated_at
                FROM smart_playlists
                WHERE playlist_id = %s AND is_template = FALSE
                """,
                (playlist_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Playlist not found")

    return {
        "playlist_id": str(row[0]),
        "name": row[1],
        "description": row[2],
        "rules": row[3],
        "sort_by": row[4],
        "sort_order": row[5],
        "limit_count": row[6],
        "auto_refresh": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
        "updated_at": row[9].isoformat() if row[9] else None,
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


@router.put("/{playlist_id}")
async def update_smart_playlist(
    playlist_id: str,
    request: UpdateSmartPlaylistRequest,
    liked_song_ids: list[str] = Query(default=[]),
    disliked_song_ids: list[str] = Query(default=[]),
) -> dict[str, Any]:
    """
    Update a smart playlist.

    If rules are updated, the playlist will be automatically refreshed.
    """
    # Check playlist exists
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT is_template FROM smart_playlists WHERE playlist_id = %s",
                (playlist_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Playlist not found")

            if row[0]:
                raise HTTPException(
                    status_code=400, detail="Cannot update template playlists"
                )

    # Validate new rules if provided
    if request.rules:
        engine = get_rule_engine()
        try:
            engine.parse(request.rules)
        except RuleEngineError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Build update query dynamically
    updates = []
    params = []

    if request.name is not None:
        updates.append("name = %s")
        params.append(request.name)
    if request.description is not None:
        updates.append("description = %s")
        params.append(request.description)
    if request.rules is not None:
        updates.append("rules = %s")
        params.append(request.rules)
    if request.sort_by is not None:
        updates.append("sort_by = %s")
        params.append(request.sort_by)
    if request.sort_order is not None:
        updates.append("sort_order = %s")
        params.append(request.sort_order)
    if request.limit_count is not None:
        updates.append("limit_count = %s")
        params.append(request.limit_count)
    if request.auto_refresh is not None:
        updates.append("auto_refresh = %s")
        params.append(request.auto_refresh)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(playlist_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE smart_playlists
                SET {", ".join(updates)}
                WHERE playlist_id = %s
                """,
                params,
            )
        conn.commit()

    # Refresh if rules were updated
    if request.rules is not None:
        refresher = get_playlist_refresher()
        try:
            result = refresher.refresh_single(
                playlist_id,
                liked_song_ids=set(liked_song_ids),
                disliked_song_ids=set(disliked_song_ids),
            )
            song_count = result["song_count"]
        except PlaylistRefresherError as e:
            logger.warning(f"Refresh after update failed: {e}")
            song_count = 0
    else:
        # Get current song count
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT song_count FROM smart_playlists WHERE playlist_id = %s",
                    (playlist_id,),
                )
                song_count = cur.fetchone()[0]

    return {
        "playlist_id": playlist_id,
        "song_count": song_count,
        "updated": True,
    }


@router.delete("/{playlist_id}")
async def delete_smart_playlist(playlist_id: str) -> dict[str, Any]:
    """
    Delete a smart playlist.

    Template playlists cannot be deleted.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check if it's a template
            cur.execute(
                "SELECT is_template FROM smart_playlists WHERE playlist_id = %s",
                (playlist_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Playlist not found")

            if row[0]:
                raise HTTPException(
                    status_code=400, detail="Cannot delete template playlists"
                )

            # Delete (cascade will handle smart_playlist_songs)
            cur.execute(
                "DELETE FROM smart_playlists WHERE playlist_id = %s",
                (playlist_id,),
            )
        conn.commit()

    return {"success": True}


@router.post("/{playlist_id}/refresh")
async def refresh_smart_playlist(
    playlist_id: str,
    request: RefreshRequest | None = None,
) -> dict[str, Any]:
    """
    Manually refresh a smart playlist.

    Re-evaluates the rules and updates the song list.
    """
    liked_ids = set(request.liked_song_ids) if request else set()
    disliked_ids = set(request.disliked_song_ids) if request else set()

    refresher = get_playlist_refresher()
    try:
        result = refresher.refresh_single(
            playlist_id,
            liked_song_ids=liked_ids,
            disliked_song_ids=disliked_ids,
        )
    except PlaylistRefresherError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.post("/refresh-all")
async def refresh_all_playlists(
    request: RefreshRequest | None = None,
) -> dict[str, Any]:
    """
    Refresh all smart playlists with auto_refresh enabled.
    """
    liked_ids = set(request.liked_song_ids) if request else set()
    disliked_ids = set(request.disliked_song_ids) if request else set()

    refresher = get_playlist_refresher()
    result = refresher.refresh_all(
        liked_song_ids=liked_ids,
        disliked_song_ids=disliked_ids,
    )

    return result


@router.get("/{playlist_id}/explain")
async def explain_rules(playlist_id: str) -> dict[str, Any]:
    """
    Get a human-readable explanation of the playlist rules.
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT rules FROM smart_playlists WHERE playlist_id = %s",
                (playlist_id,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Playlist not found")

            rules = row[0]

    engine = get_rule_engine()
    try:
        parsed_rules = engine.parse(rules)
        explanation = engine.explain(parsed_rules)
        warnings = engine.validate(parsed_rules)
    except RuleEngineError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "playlist_id": playlist_id,
        "explanation": explanation,
        "warnings": warnings,
    }
