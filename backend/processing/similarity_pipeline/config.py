"""Configuration for similarity search and song radio generation."""
from __future__ import annotations

import os

# Song radio settings
SONG_RADIO_SIZE = int(os.environ.get("SONGBASE_SONG_RADIO_SIZE", "50"))
ARTIST_RADIO_SIZE = int(os.environ.get("SONGBASE_ARTIST_RADIO_SIZE", "50"))

# Similarity search parameters
SIMILARITY_METRIC = os.environ.get("SONGBASE_SIMILARITY_METRIC", "cosine")  # cosine, euclidean, or dot
MIN_SIMILARITY_THRESHOLD = float(os.environ.get("SONGBASE_MIN_SIMILARITY_THRESHOLD", "0.5"))

# Query settings
MAX_SEARCH_RESULTS = int(os.environ.get("SONGBASE_MAX_SEARCH_RESULTS", "100"))
POPULAR_ALBUMS_LIMIT = int(os.environ.get("SONGBASE_POPULAR_ALBUMS_LIMIT", "50"))
POPULAR_ARTISTS_LIMIT = int(os.environ.get("SONGBASE_POPULAR_ARTISTS_LIMIT", "50"))

# Diversity settings (to avoid too many songs from same album/artist)
MAX_SONGS_PER_ALBUM = int(os.environ.get("SONGBASE_MAX_SONGS_PER_ALBUM", "3"))
MAX_SONGS_PER_ARTIST = int(os.environ.get("SONGBASE_MAX_SONGS_PER_ARTIST", "5"))
