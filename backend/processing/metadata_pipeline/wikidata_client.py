"""Wikidata API client for fetching artist images and metadata."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from . import config


def _request_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> dict[str, Any]:
    """Make a JSON request to Wikidata."""
    if headers is None:
        headers = {}

    headers.setdefault("User-Agent", f"{config.MUSICBRAINZ_APP_NAME}/{config.MUSICBRAINZ_APP_VERSION}")

    request = urllib.request.Request(url, headers=headers)

    for attempt in range(config.WIKIDATA_REQUEST_RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:  # Rate limited
                time.sleep(2 ** attempt)
                continue
            raise
        except Exception as e:
            if attempt < config.WIKIDATA_REQUEST_RETRIES - 1:
                time.sleep(config.WIKIDATA_RATE_LIMIT_SECONDS * (2 ** attempt))
                continue
            raise

    raise RuntimeError("Max retries exceeded for Wikidata API request")


def get_wikidata_id_from_url(wikidata_url: str) -> str | None:
    """Extract Wikidata Q-ID from a Wikidata URL."""
    if not wikidata_url:
        return None

    # Extract Q-ID from URL like https://www.wikidata.org/wiki/Q123456
    parts = wikidata_url.rstrip("/").split("/")
    if parts and parts[-1].startswith("Q"):
        return parts[-1]

    return None


def fetch_entity(entity_id: str) -> dict[str, Any] | None:
    """Fetch a Wikidata entity by ID (e.g., 'Q123456')."""
    if not entity_id or not entity_id.startswith("Q"):
        return None

    params = {
        "action": "wbgetentities",
        "ids": entity_id,
        "format": "json",
        "props": "claims|labels|descriptions",
    }

    url = f"{config.WIKIDATA_API_URL}?{urllib.parse.urlencode(params)}"

    try:
        result = _request_json(url, timeout=config.WIKIDATA_REQUEST_TIMEOUT_SEC)
        entities = result.get("entities", {})
        return entities.get(entity_id)
    except Exception:
        return None


def get_image_from_entity(entity: dict[str, Any]) -> str | None:
    """Extract image URL from a Wikidata entity."""
    if not entity:
        return None

    # Property P18 is the "image" property in Wikidata
    claims = entity.get("claims", {})
    image_claims = claims.get("P18", [])

    if not image_claims:
        return None

    # Get the first image
    image_claim = image_claims[0]
    mainsnak = image_claim.get("mainsnak", {})
    datavalue = mainsnak.get("datavalue", {})
    value = datavalue.get("value")

    if not value:
        return None

    # Value is the filename on Wikimedia Commons
    filename = value.replace(" ", "_")

    # Construct Wikimedia Commons URL
    # Using Special:FilePath for direct image access
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{urllib.parse.quote(filename)}"


def search_entity(search_query: str, entity_type: str = "item", limit: int = 5) -> list[dict[str, Any]]:
    """Search for Wikidata entities by name."""
    params = {
        "action": "wbsearchentities",
        "search": search_query,
        "language": "en",
        "type": entity_type,
        "limit": str(limit),
        "format": "json",
    }

    url = f"{config.WIKIDATA_API_URL}?{urllib.parse.urlencode(params)}"

    try:
        result = _request_json(url, timeout=config.WIKIDATA_REQUEST_TIMEOUT_SEC)
        return result.get("search", [])
    except Exception:
        return []


def fetch_artist_image_by_name(artist_name: str) -> str | None:
    """Search for an artist and fetch their image."""
    # Search for the artist
    results = search_entity(artist_name, entity_type="item", limit=3)

    if not results:
        return None

    # Try each result to find one with an image
    for result in results:
        entity_id = result.get("id")
        if not entity_id:
            continue

        # Fetch full entity data
        time.sleep(config.WIKIDATA_RATE_LIMIT_SECONDS)
        entity = fetch_entity(entity_id)

        if entity:
            image_url = get_image_from_entity(entity)
            if image_url:
                return image_url

    return None


def fetch_artist_image_by_wikidata_id(wikidata_id: str) -> str | None:
    """Fetch artist image directly by Wikidata ID."""
    entity = fetch_entity(wikidata_id)
    if entity:
        return get_image_from_entity(entity)
    return None
