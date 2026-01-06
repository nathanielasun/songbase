from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


def _run_pg_config(pg_config: str, flag: str) -> Path:
    result = subprocess.run(
        [pg_config, flag],
        check=True,
        text=True,
        capture_output=True,
    )
    value = result.stdout.strip()
    if not value:
        raise RuntimeError(f"{pg_config} returned empty value for {flag}")
    return Path(value)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy_tree(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, dirs_exist_ok=True, symlinks=True)


def _compress_paths(prefix: Path, paths: list[Path], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output_path, "w:gz") as archive:
        for path in paths:
            for item in path.rglob("*"):
                if not item.is_file():
                    continue
                arcname = item.relative_to(prefix)
                archive.add(item, arcname=str(arcname))


def _resolve_pg_config(pg_config: str | None) -> str:
    if pg_config:
        return pg_config
    resolved = shutil.which("pg_config")
    if not resolved:
        raise RuntimeError("pg_config not found. Provide --pg-config or install Postgres.")
    return resolved


def _platform_tag() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    return f"{system}-{machine}"


def _manifest_key() -> str:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "darwin":
        system_key = "darwin"
    elif system.startswith("linux"):
        system_key = "linux"
    elif system.startswith("windows") or system == "windows":
        system_key = "windows"
    else:
        system_key = system

    if machine in {"x86_64", "amd64"}:
        arch = "x86_64"
    elif machine in {"aarch64", "arm64"}:
        arch = "arm64"
    else:
        arch = machine
    return f"{system_key}_{arch}"


def _ensure_pgvector(sharedir: Path, pkglibdir: Path) -> None:
    extension_dir = sharedir / "extension"
    control_file = extension_dir / "vector.control"
    sql_files = list(extension_dir.glob("vector--*.sql"))
    if not control_file.exists() or not sql_files:
        raise RuntimeError("pgvector extension not found in share/extension.")

    candidates = list(pkglibdir.glob("vector.*"))
    if not candidates:
        raise RuntimeError("pgvector shared library not found in pkglibdir.")


def _filter_paths(paths: list[Path]) -> list[Path]:
    ordered = sorted(paths, key=lambda p: len(p.parts))
    result: list[Path] = []
    for path in ordered:
        if any(_is_relative_to(path, existing) for existing in result):
            continue
        result.append(path)
    return result


def _is_relative_to(path: Path, base: Path) -> bool:
    try:
        path.relative_to(base)
        return True
    except ValueError:
        return False


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Postgres + pgvector bundle archive.",
    )
    parser.add_argument(
        "--pg-config",
        default=None,
        help="Path to pg_config (defaults to PATH).",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output archive path (.tar.gz).",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Override pg_config prefix (advanced).",
    )
    parser.add_argument(
        "--write-manifest",
        nargs="?",
        const="auto",
        default=None,
        help="Write URL/SHA entry to postgres_bundle.json (defaults to backend/processing).",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        pg_config = _resolve_pg_config(args.pg_config)
        prefix = Path(args.prefix) if args.prefix else _run_pg_config(pg_config, "--prefix")
        bindir = _run_pg_config(pg_config, "--bindir")
        libdir = _run_pg_config(pg_config, "--libdir")
        sharedir = _run_pg_config(pg_config, "--sharedir")
        pkglibdir = _run_pg_config(pg_config, "--pkglibdir")
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    for path in [bindir, libdir, sharedir, pkglibdir]:
        if not path.exists():
            print(f"Missing path from pg_config: {path}", file=sys.stderr)
            return 2

    try:
        _ensure_pgvector(sharedir, pkglibdir)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    output_path = (
        Path(args.output).expanduser()
        if args.output
        else Path(".metadata") / f"postgres_bundle-{_platform_tag()}.tar.gz"
    )

    with tempfile.TemporaryDirectory() as temp_dir:
        staging_root = Path(temp_dir) / "postgres_bundle"
        staging_root.mkdir(parents=True, exist_ok=True)

        paths = _filter_paths([bindir, libdir, sharedir, pkglibdir])
        for path in paths:
            try:
                relative = path.relative_to(prefix)
            except ValueError:
                print(
                    f"Path {path} is not under prefix {prefix}. "
                    "Use --prefix to override.",
                    file=sys.stderr,
                )
                return 2
            _copy_tree(path, staging_root / relative)

        _compress_paths(staging_root, [staging_root], output_path)

    sha256 = _sha256_file(output_path)
    url = output_path.resolve().as_uri()

    print(f"POSTGRES_BUNDLE_URL={url}")
    print(f"POSTGRES_BUNDLE_SHA256={sha256}")

    if args.write_manifest:
        repo_root = Path(__file__).resolve().parents[2]
        manifest_path = (
            repo_root / "backend" / "processing" / "postgres_bundle.json"
            if args.write_manifest == "auto"
            else Path(args.write_manifest).expanduser()
        )
        data: dict = {}
        if manifest_path.exists():
            try:
                data = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                print(f"Invalid manifest JSON: {exc}", file=sys.stderr)
                return 2
            if not isinstance(data, dict):
                print("Manifest must be a JSON object.", file=sys.stderr)
                return 2

        key = _manifest_key()
        entry = data.get(key)
        if not isinstance(entry, dict):
            entry = {}
        entry["url"] = url
        entry["sha256"] = sha256
        data[key] = entry

        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(data, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote manifest entry {key} to {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
