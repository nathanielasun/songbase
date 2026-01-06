from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import threading
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.processing.acquisition_pipeline import config as acquisition_config


class StateWriter:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def append(self, payload: dict) -> None:
        line = json.dumps(payload, sort_keys=True)
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")


def utc_now() -> str:
    return dt.datetime.utcnow().isoformat() + "Z"


def _default_state_path() -> Path:
    return acquisition_config.PREPROCESSED_CACHE_DIR / "pipeline_state.jsonl"


def compact_state(input_path: Path, output_path: Path | None = None) -> Path:
    input_path = Path(input_path).expanduser()
    if not input_path.exists():
        raise FileNotFoundError(f"State file not found: {input_path}")

    output_path = output_path or input_path.with_suffix(".latest.jsonl")

    latest: dict[tuple[object, object], dict] = {}
    ordering: dict[tuple[object, object], int] = {}
    index = 0

    with input_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            stage = payload.get("stage")
            if not stage:
                continue
            download_id = payload.get("download_id")
            key = (download_id, stage)
            latest[key] = payload
            ordering[key] = index
            index += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for key, payload in sorted(latest.items(), key=lambda item: ordering[item[0]]):
            handle.write(json.dumps(payload, sort_keys=True) + "\n")

    return output_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Utilities for pipeline_state.jsonl files.",
    )
    parser.add_argument(
        "--input",
        default=None,
        help="Path to pipeline_state.jsonl (defaults to preprocessed_cache).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output path for compacted state.",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write a compacted snapshot of the state file.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.compact:
        print("No action specified. Use --compact to write a snapshot.")
        return 1

    input_path = Path(args.input).expanduser() if args.input else _default_state_path()
    output_path = Path(args.output).expanduser() if args.output else None

    try:
        snapshot = compact_state(input_path, output_path=output_path)
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 2

    print(f"Wrote compacted state to {snapshot}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
