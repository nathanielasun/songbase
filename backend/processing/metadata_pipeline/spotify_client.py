"""Spotify API client for metadata and image fetching."""

from __future__ import annotations

import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from . import config


class SpotifyClient:
    """Client for interacting with Spotify Web API."""

    def __init__(self):
        self.access_token: str | None = None
        self.token_expires_at: float = 0
        self.client_id = config.SPOTIFY_CLIENT_ID
        self.client_secret = config.SPOTIFY_CLIENT_SECRET

    def _get_access_token(self) -> str:
        """Get or refresh Spotify access token using Client Credentials flow."""
        if self.access_token and time.time() < self.token_expires_at:
            return self.access_token

        if not self.client_id or not self.client_secret:
            raise ValueError("Spotify API credentials not configured")

        # Encode credentials
        credentials = f"{self.client_id}:{self.client_secret}"
        credentials_b64 = base64.b64encode(credentials.encode()).decode()

        # Request token
        url = "https://accounts.spotify.com/api/token"
        headers = {
            "Authorization": f"Basic {credentials_b64}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = b"grant_type=client_credentials"

        request = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                result = json.loads(response.read().decode())
                self.access_token = result["access_token"]
                # Set expiry with 60 second buffer
                self.token_expires_at = time.time() + result["expires_in"] - 60
                return self.access_token
        except Exception as e:
            raise RuntimeError(f"Failed to get Spotify access token: {e}") from e

    def _request(self, endpoint: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        """Make authenticated request to Spotify API."""
        token = self._get_access_token()

        url = f"https://api.spotify.com/v1/{endpoint}"
        if params:
            query_string = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
            url = f"{url}?{query_string}"

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        request = urllib.request.Request(url, headers=headers)

        for attempt in range(config.SPOTIFY_REQUEST_RETRIES):
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    return json.loads(response.read().decode())
            except urllib.error.HTTPError as e:
                if e.code == 429:  # Rate limited
                    retry_after = int(e.headers.get("Retry-After", 1))
                    time.sleep(retry_after)
                    continue
                elif e.code == 401:  # Unauthorized, token might be expired
                    self.access_token = None
                    self.token_expires_at = 0
                    if attempt < config.SPOTIFY_REQUEST_RETRIES - 1:
                        continue
                raise
            except Exception as e:
                if attempt < config.SPOTIFY_REQUEST_RETRIES - 1:
                    time.sleep(config.SPOTIFY_RATE_LIMIT_SECONDS * (2 ** attempt))
                    continue
                raise

        raise RuntimeError("Max retries exceeded for Spotify API request")

    def search_track(self, title: str, artist: str | None = None, album: str | None = None) -> dict[str, Any] | None:
        """Search for a track on Spotify."""
        query_parts = [f'track:"{title}"']
        if artist:
            query_parts.append(f'artist:"{artist}"')
        if album:
            query_parts.append(f'album:"{album}"')

        query = " ".join(query_parts)

        try:
            result = self._request("search", {"q": query, "type": "track", "limit": "5"})
            tracks = result.get("tracks", {}).get("items", [])
            return tracks[0] if tracks else None
        except Exception:
            return None

    def search_artist(self, artist_name: str) -> dict[str, Any] | None:
        """Search for an artist on Spotify."""
        try:
            result = self._request("search", {"q": f'artist:"{artist_name}"', "type": "artist", "limit": "5"})
            artists = result.get("artists", {}).get("items", [])
            return artists[0] if artists else None
        except Exception:
            return None

    def get_artist(self, artist_id: str) -> dict[str, Any] | None:
        """Get artist details by Spotify ID."""
        try:
            return self._request(f"artists/{artist_id}")
        except Exception:
            return None

    def get_album(self, album_id: str) -> dict[str, Any] | None:
        """Get album details by Spotify ID."""
        try:
            return self._request(f"albums/{album_id}")
        except Exception:
            return None


# Global client instance
_spotify_client: SpotifyClient | None = None


def get_spotify_client() -> SpotifyClient:
    """Get or create global Spotify client instance."""
    global _spotify_client
    if _spotify_client is None:
        _spotify_client = SpotifyClient()
    return _spotify_client


def is_spotify_configured() -> bool:
    """Check if Spotify API credentials are configured."""
    return bool(config.SPOTIFY_CLIENT_ID and config.SPOTIFY_CLIENT_SECRET)
