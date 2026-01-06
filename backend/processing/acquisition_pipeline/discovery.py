from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from backend.processing import dependencies
    from backend.processing.acquisition_pipeline import config, db, sources
    from backend.processing.acquisition_pipeline.discovery_providers import (
        discover_by_album,
        discover_by_artist,
        discover_by_genre,
        discover_hotlists,
    )
else:
    from .. import dependencies
    from . import config, db, sources
    from .discovery_providers import (
        discover_by_album,
        discover_by_artist,
        discover_by_genre,
        discover_hotlists,
    )


@dataclass(frozen=True)
class DiscoveryReport:
    total_candidates: int
    unique_candidates: int
    skipped_duplicates: int
    skipped_existing: int
    added: int
    dry_run: bool
    providers: dict[str, int]


def _normalize(value: str | None) -> str:
    return value.strip().lower() if value else ""


def _dedupe_candidates(items: list[sources.SourceItem]) -> list[sources.SourceItem]:
    with_artist: list[sources.SourceItem] = []
    without_artist: list[sources.SourceItem] = []

    for item in items:
        if item.artist:
            with_artist.append(item)
        else:
            without_artist.append(item)

    unique: list[sources.SourceItem] = []
    seen_keys: set[tuple[str, str]] = set()
    titles_with_artist: set[str] = set()

    for item in with_artist:
        title = _normalize(item.title)
        artist = _normalize(item.artist) if item.artist else ""
        if not title or not artist:
            continue
        key = (title, artist)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        titles_with_artist.add(title)
        unique.append(item)

    for item in without_artist:
        title = _normalize(item.title)
        if not title or title in titles_with_artist:
            continue
        key = (title, "")
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique.append(item)

    return unique


def _collect_existing_keys(
    candidates: list[sources.SourceItem],
    sources_path: Path,
) -> tuple[set[tuple[str, str]], set[str]]:
    existing_keys: set[tuple[str, str]] = set()
    existing_titles: set[str] = set()

    for item in sources.load_sources_file(sources_path):
        title = _normalize(item.title)
        artist = _normalize(item.artist) if item.artist else ""
        if not title:
            continue
        existing_keys.add((title, artist))
        existing_titles.add(title)

    titles = sorted({_normalize(item.title) for item in candidates if item.title})
    for title, artist in db.fetch_existing_song_keys(titles):
        title_key = _normalize(title)
        artist_key = _normalize(artist) if artist else ""
        if not title_key:
            continue
        existing_keys.add((title_key, artist_key))
        existing_titles.add(title_key)

    for title, artist in db.fetch_existing_queue_keys(titles):
        title_key = _normalize(title)
        artist_key = _normalize(artist) if artist else ""
        if not title_key:
            continue
        existing_keys.add((title_key, artist_key))
        existing_titles.add(title_key)

    return existing_keys, existing_titles


def _is_known(
    item: sources.SourceItem,
    existing_keys: set[tuple[str, str]],
    existing_titles: set[str],
) -> bool:
    title = _normalize(item.title)
    if not title:
        return True
    artist = _normalize(item.artist) if item.artist else ""
    if artist and (title, artist) in existing_keys:
        return True
    if title in existing_titles:
        return True
    return False


def discover_and_queue(
    sources_path: Path | None = None,
    seed_genres: int | None = None,
    seed_artists: int | None = None,
    seed_albums: int | None = None,
    limit_per_genre: int | None = None,
    limit_per_artist: int | None = None,
    limit_per_album: int | None = None,
    hotlist_limit: int | None = None,
    hotlist_urls: list[str] | None = None,
    rate_limit_seconds: float | None = None,
    dry_run: bool = False,
) -> DiscoveryReport:
    sources_path = sources_path or config.SOURCES_PATH

    genre_limit = seed_genres if seed_genres is not None else config.DISCOVERY_SEED_GENRES
    artist_limit = seed_artists if seed_artists is not None else config.DISCOVERY_SEED_ARTISTS
    album_limit = seed_albums if seed_albums is not None else config.DISCOVERY_SEED_ALBUMS

    genre_seeds = db.fetch_seed_genres(genre_limit)
    artist_seeds = db.fetch_seed_artists(artist_limit)
    album_seeds = db.fetch_seed_albums(album_limit)

    provider_counts: dict[str, int] = {}
    candidates: list[sources.SourceItem] = []

    genre_per = (
        limit_per_genre
        if limit_per_genre is not None
        else config.DISCOVERY_LIMIT_PER_GENRE
    )
    if genre_seeds and genre_per > 0:
        items = discover_by_genre(
            genre_seeds,
            genre_per,
            rate_limit_seconds=rate_limit_seconds,
        )
        provider_counts["genre_similarity"] = len(items)
        candidates.extend(items)

    artist_per = (
        limit_per_artist
        if limit_per_artist is not None
        else config.DISCOVERY_LIMIT_PER_ARTIST
    )
    if artist_seeds and artist_per > 0:
        items = discover_by_artist(
            artist_seeds,
            artist_per,
            rate_limit_seconds=rate_limit_seconds,
        )
        provider_counts["artist_catalog"] = len(items)
        candidates.extend(items)

    album_per = (
        limit_per_album
        if limit_per_album is not None
        else config.DISCOVERY_LIMIT_PER_ALBUM
    )
    if album_seeds and album_per > 0:
        items = discover_by_album(
            [(seed.album, seed.artist) for seed in album_seeds],
            album_per,
            rate_limit_seconds=rate_limit_seconds,
        )
        provider_counts["album_tracks"] = len(items)
        candidates.extend(items)

    urls = hotlist_urls if hotlist_urls is not None else config.HOTLIST_URLS
    if urls:
        items = discover_hotlists(
            urls,
            limit=hotlist_limit,
            timeout_seconds=config.HOTLIST_TIMEOUT_SECONDS,
        )
        provider_counts["hotlists"] = len(items)
        candidates.extend(items)

    total_candidates = len(candidates)
    unique_candidates = _dedupe_candidates(candidates)
    skipped_duplicates = total_candidates - len(unique_candidates)

    existing_keys, existing_titles = _collect_existing_keys(
        unique_candidates,
        sources_path,
    )

    new_items: list[sources.SourceItem] = []
    skipped_existing = 0
    for item in unique_candidates:
        if _is_known(item, existing_keys, existing_titles):
            skipped_existing += 1
            continue
        new_items.append(item)

    added = 0
    if not dry_run and new_items:
        added = sources.append_sources_file(new_items, sources_path)

    return DiscoveryReport(
        total_candidates=total_candidates,
        unique_candidates=len(unique_candidates),
        skipped_duplicates=skipped_duplicates,
        skipped_existing=skipped_existing,
        added=added,
        dry_run=dry_run,
        providers=provider_counts,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover new songs and append them to sources.jsonl.",
    )
    parser.add_argument(
        "--sources-file",
        default=str(config.SOURCES_PATH),
        help="JSONL file to append discovered songs to.",
    )
    parser.add_argument(
        "--seed-genres",
        type=int,
        default=config.DISCOVERY_SEED_GENRES,
        help="Number of top genres to use as seeds.",
    )
    parser.add_argument(
        "--seed-artists",
        type=int,
        default=config.DISCOVERY_SEED_ARTISTS,
        help="Number of top artists to use as seeds.",
    )
    parser.add_argument(
        "--seed-albums",
        type=int,
        default=config.DISCOVERY_SEED_ALBUMS,
        help="Number of top albums to use as seeds.",
    )
    parser.add_argument(
        "--limit-per-genre",
        type=int,
        default=config.DISCOVERY_LIMIT_PER_GENRE,
        help="Max recordings to pull per genre seed.",
    )
    parser.add_argument(
        "--limit-per-artist",
        type=int,
        default=config.DISCOVERY_LIMIT_PER_ARTIST,
        help="Max recordings to pull per artist seed.",
    )
    parser.add_argument(
        "--limit-per-album",
        type=int,
        default=config.DISCOVERY_LIMIT_PER_ALBUM,
        help="Max recordings to pull per album seed.",
    )
    parser.add_argument(
        "--hotlist-limit",
        type=int,
        default=None,
        help="Optional cap on songs pulled from hotlists.",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=config.DISCOVERY_RATE_LIMIT_SECONDS,
        help="Seconds to wait between MusicBrainz requests.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Collect candidates but do not write to sources.jsonl.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dependencies.ensure_first_run_dependencies()

    for name, value in (
        ("--seed-genres", args.seed_genres),
        ("--seed-artists", args.seed_artists),
        ("--seed-albums", args.seed_albums),
        ("--limit-per-genre", args.limit_per_genre),
        ("--limit-per-artist", args.limit_per_artist),
        ("--limit-per-album", args.limit_per_album),
    ):
        if value is not None and value < 0:
            print(f"{name} must be >= 0", file=sys.stderr)
            return 2
    if args.rate_limit < 0:
        print("--rate-limit must be >= 0", file=sys.stderr)
        return 2

    report = discover_and_queue(
        sources_path=Path(args.sources_file).expanduser().resolve(),
        seed_genres=args.seed_genres,
        seed_artists=args.seed_artists,
        seed_albums=args.seed_albums,
        limit_per_genre=args.limit_per_genre,
        limit_per_artist=args.limit_per_artist,
        limit_per_album=args.limit_per_album,
        hotlist_limit=args.hotlist_limit,
        rate_limit_seconds=args.rate_limit,
        dry_run=args.dry_run,
    )

    action = "Would add" if report.dry_run else "Added"
    print(
        "Discovery complete. "
        f"Candidates: {report.total_candidates}, "
        f"Unique: {report.unique_candidates}, "
        f"Skipped duplicates: {report.skipped_duplicates}, "
        f"Skipped existing: {report.skipped_existing}, "
        f"{action}: {report.added}"
    )
    if report.providers:
        detail = ", ".join(
            f"{name}={count}" for name, count in sorted(report.providers.items())
        )
        print(f"Providers: {detail}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
