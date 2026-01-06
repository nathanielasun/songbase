from __future__ import annotations

import argparse
import sys
from pathlib import Path

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import dependencies

from audio_pipeline.io import save_embedding
from audio_pipeline.pipeline import embed_wav_file, embedding_metadata, output_path_for_wav


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Tokenize PCM WAV files into VGGish embeddings.",
    )
    parser.add_argument("input", help="WAV file or directory of WAV files.")
    parser.add_argument("output", help="Output file or directory for embeddings.")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing embedding files.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of files to process.",
    )
    return parser.parse_args()


def find_wav_files(input_dir: Path) -> list[Path]:
    wav_files = [
        path
        for path in input_dir.rglob("*")
        if path.is_file() and path.suffix.lower() == ".wav"
    ]
    return sorted(wav_files)


def resolve_output_path(
    input_path: Path,
    output_path: Path,
    input_root: Path,
    output_root: Path,
    input_is_file: bool,
) -> Path:
    if input_is_file and not output_path.is_dir():
        return output_path
    return output_path_for_wav(input_root, output_root, input_path)


def main() -> int:
    args = parse_args()
    dependencies.ensure_first_run_dependencies()
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if args.limit is not None and args.limit < 1:
        print("--limit must be >= 1", file=sys.stderr)
        return 2

    input_is_file = input_path.is_file()
    if input_is_file:
        if input_path.suffix.lower() != ".wav":
            print("Input file must be a .wav", file=sys.stderr)
            return 2
        wav_files = [input_path]
        input_root = input_path.parent
        output_root = output_path if output_path.is_dir() else output_path.parent
    elif input_path.is_dir():
        wav_files = find_wav_files(input_path)
        input_root = input_path
        output_root = output_path
    else:
        print(f"Input path not found: {input_path}", file=sys.stderr)
        return 2

    if args.limit is not None:
        wav_files = wav_files[: args.limit]

    if not wav_files:
        print("No WAV files found.", file=sys.stderr)
        return 1

    metadata = embedding_metadata()
    total = len(wav_files)
    failures = 0
    skipped = 0

    for idx, wav_file in enumerate(wav_files, start=1):
        target_path = resolve_output_path(
            wav_file,
            output_path,
            input_root,
            output_root,
            input_is_file,
        )
        if target_path.exists() and not args.overwrite:
            skipped += 1
            print(f"[{idx}/{total}] skipped: {target_path}")
            continue

        try:
            embeddings = embed_wav_file(wav_file)
            save_embedding(target_path, embeddings, metadata=metadata)
            print(f"[{idx}/{total}] tokenized: {target_path}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(
                f"[{idx}/{total}] failed: {wav_file.name} ({exc})",
                file=sys.stderr,
            )

    if failures:
        print(f"{failures} file(s) failed.", file=sys.stderr)
        return 1

    if skipped:
        print(f"{skipped} file(s) skipped because output exists.")

    print("Tokenization complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
