from __future__ import annotations

import argparse
import hashlib
import importlib
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REQUIREMENTS = REPO_ROOT / "backend" / "api" / "requirements.txt"
METADATA_ROOT = Path(os.environ.get("SONGBASE_METADATA_DIR", REPO_ROOT / ".metadata"))
PIP_CACHE_DIR = METADATA_ROOT / "pip-cache"
MARKER_PATH = METADATA_ROOT / ".python_deps_ready"

REQUIRED_MODULES = (
    "fastapi",
    "uvicorn",
    "psycopg",
    "pgvector",
    "musicbrainzngs",
    "yt_dlp",
    "numpy",
    "mutagen",
    "resampy",
    "tensorflow",
    "tf_slim",
)


def _requirements_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _python_tag() -> str:
    return f"{sys.version_info[0]}.{sys.version_info[1]}"


def _marker_matches(requirements_hash: str, python_tag: str) -> bool:
    if not MARKER_PATH.exists():
        return False
    content = MARKER_PATH.read_text(encoding="utf-8").splitlines()
    values = dict(line.split("=", 1) for line in content if "=" in line)
    return (
        values.get("requirements") == requirements_hash
        and values.get("python") == python_tag
    )


def _modules_ready() -> bool:
    for module_name in REQUIRED_MODULES:
        try:
            importlib.import_module(module_name)
        except ImportError:
            return False
    return True


def _resolve_wheelhouse() -> Path | None:
    override = os.environ.get("SONGBASE_WHEELHOUSE_DIR")
    if override:
        candidate = Path(override).expanduser()
        if candidate.is_dir():
            return candidate
    return None


def ensure_python_deps(
    requirements_path: Path | None = None,
    *,
    force: bool = False,
    wheelhouse: Path | None = None,
) -> None:
    requirements_path = requirements_path or DEFAULT_REQUIREMENTS
    requirements_hash = _requirements_hash(requirements_path)
    if not requirements_hash:
        return

    python_tag = _python_tag()
    if (
        not force
        and _marker_matches(requirements_hash, python_tag)
        and _modules_ready()
    ):
        return

    METADATA_ROOT.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
    env.setdefault("PIP_CACHE_DIR", str(PIP_CACHE_DIR))
    env.setdefault("PUCCINIALIN_HOME", str(METADATA_ROOT / "puccinialin"))

    wheelhouse = wheelhouse or _resolve_wheelhouse()
    if wheelhouse:
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--no-index",
            "--find-links",
            str(wheelhouse),
            "-r",
            str(requirements_path),
        ]
    else:
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            str(requirements_path),
        ]
    subprocess.run(cmd, check=True, env=env)

    MARKER_PATH.write_text(
        f"requirements={requirements_hash}\npython={python_tag}\n",
        encoding="utf-8",
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap Python dependencies for Songbase.",
    )
    parser.add_argument(
        "--requirements",
        default=None,
        help="Override requirements file (defaults to backend/api/requirements.txt).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reinstall requirements even if the marker is up to date.",
    )
    parser.add_argument(
        "--wheelhouse",
        default=None,
        help="Use a local wheelhouse directory for offline installs.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    requirements_path = Path(args.requirements).expanduser() if args.requirements else None
    wheelhouse = Path(args.wheelhouse).expanduser() if args.wheelhouse else None
    try:
        ensure_python_deps(
            requirements_path=requirements_path,
            force=args.force,
            wheelhouse=wheelhouse,
        )
    except subprocess.CalledProcessError as exc:
        print(str(exc), file=sys.stderr)
        return exc.returncode or 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
