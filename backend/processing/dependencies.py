from __future__ import annotations

import hashlib
import os
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if __package__ is None:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from audio_pipeline import config as vggish_config


@dataclass(frozen=True)
class DependencyFile:
    name: str
    path: Path
    url: str | None = None
    url_env: str | None = None
    sha256: str | None = None
    executable: bool = False


@dataclass(frozen=True)
class Dependency:
    name: str
    description: str
    files: tuple[DependencyFile, ...]


PROCESSING_DIR = Path(__file__).resolve().parent

VGGISH_SOURCE_BASE_URL = (
    "https://raw.githubusercontent.com/tensorflow/models/master/"
    "research/audioset/vggish"
)

def _normalize_sha256(value: str) -> str | None:
    if value.startswith("sha256:"):
        value = value[len("sha256:") :]
    if len(value) != 64:
        return None
    if all(ch in "0123456789abcdef" for ch in value.lower()):
        return value.lower()
    return None


DEPENDENCIES: dict[str, Dependency] = {
    "vggish_source": Dependency(
        name="vggish_source",
        description="VGGish Python source files.",
        files=(
            DependencyFile(
                name="vggish_input.py",
                path=vggish_config.VGGISH_DIR / "vggish_input.py",
                url=f"{VGGISH_SOURCE_BASE_URL}/vggish_input.py",
                sha256=(
                    "73c53674f1f423cc86ff725951edeec89f43c73c92a595b3746035cdf48e3c43"
                ),
            ),
            DependencyFile(
                name="vggish_params.py",
                path=vggish_config.VGGISH_DIR / "vggish_params.py",
                url=f"{VGGISH_SOURCE_BASE_URL}/vggish_params.py",
                sha256=(
                    "483e0d4108d46db341ea153d417ec7d4b9bb72c4af868fa8884b8291648d3976"
                ),
            ),
            DependencyFile(
                name="vggish_postprocess.py",
                path=vggish_config.VGGISH_DIR / "vggish_postprocess.py",
                url=f"{VGGISH_SOURCE_BASE_URL}/vggish_postprocess.py",
                sha256=(
                    "d1c5ff54a30685bdee54a1f375f9d8727d5c1bf8609325e68d2d8bed698e7e06"
                ),
            ),
            DependencyFile(
                name="vggish_slim.py",
                path=vggish_config.VGGISH_DIR / "vggish_slim.py",
                url=f"{VGGISH_SOURCE_BASE_URL}/vggish_slim.py",
                sha256=(
                    "0a060c3157f7f2c42d952b167ebb83467e7c64387422d2b654f3651c8afcf06d"
                ),
            ),
            DependencyFile(
                name="mel_features.py",
                path=vggish_config.VGGISH_DIR / "mel_features.py",
                url=f"{VGGISH_SOURCE_BASE_URL}/mel_features.py",
                sha256=(
                    "68803c00743cb43139db12836b5e745a977cdb81443257fa716cd520d7e5e948"
                ),
            ),
        ),
    ),
    "vggish_assets": Dependency(
        name="vggish_assets",
        description="VGGish model checkpoint + PCA params.",
        files=(
            DependencyFile(
                name="vggish_model.ckpt",
                path=vggish_config.VGGISH_CHECKPOINT_PATH,
                url="https://storage.googleapis.com/audioset/vggish_model.ckpt",
                sha256=_normalize_sha256(
                    vggish_config.VGGISH_CHECKPOINT_VERSION
                ),
            ),
            DependencyFile(
                name="vggish_pca_params.npz",
                path=vggish_config.VGGISH_PCA_PARAMS_PATH,
                url="https://storage.googleapis.com/audioset/vggish_pca_params.npz",
                sha256=_normalize_sha256(
                    vggish_config.VGGISH_PCA_PARAMS_VERSION
                ),
            ),
        ),
    ),
    "ffmpeg": Dependency(
        name="ffmpeg",
        description="Bundled ffmpeg binary used by mp3_to_pcm.py.",
        files=(
            DependencyFile(
                name="ffmpeg",
                path=PROCESSING_DIR / "bin" / "ffmpeg",
                url_env="FFMPEG_DOWNLOAD_URL",
                sha256=_normalize_sha256(os.environ.get("FFMPEG_SHA256", "")),
                executable=True,
            ),
        ),
    ),
}


def _parse_bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_file(url: str, dest_path: Path) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_suffix(dest_path.suffix + ".download")
    if temp_path.exists():
        temp_path.unlink()

    with urllib.request.urlopen(url) as response, temp_path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)

    temp_path.replace(dest_path)


def _resolve_url(dep_file: DependencyFile) -> str | None:
    if dep_file.url_env:
        override = os.environ.get(dep_file.url_env)
        if override:
            return override
    return dep_file.url


def ensure_dependencies(
    names: Iterable[str] | None = None,
    allow_download: bool | None = None,
    force_download: bool | None = None,
) -> None:
    if names is None:
        names = DEPENDENCIES.keys()

    if allow_download is None:
        allow_download = _parse_bool_env("SONGBASE_ALLOW_DOWNLOAD", True)

    if force_download is None:
        force_download = _parse_bool_env("SONGBASE_FORCE_DOWNLOAD", False)

    for name in names:
        if name not in DEPENDENCIES:
            raise ValueError(f"Unknown dependency: {name}")
        dep = DEPENDENCIES[name]
        for dep_file in dep.files:
            _ensure_file(dep, dep_file, allow_download, force_download)


def _ensure_file(
    dep: Dependency,
    dep_file: DependencyFile,
    allow_download: bool,
    force_download: bool,
) -> None:
    path = dep_file.path
    if path.exists() and not force_download:
        _verify_file(dep, dep_file)
        return

    url = _resolve_url(dep_file)
    if not url or not allow_download:
        missing_reason = "missing" if not path.exists() else "checksum mismatch"
        raise RuntimeError(
            "Dependency not available ({}): {}.\n".format(missing_reason, dep.name)
            + f"File: {path}\n"
            + "Set SONGBASE_ALLOW_DOWNLOAD=1 and/or provide a URL, "
            "or install it manually."
        )

    _download_file(url, path)
    _verify_file(dep, dep_file)

    if dep_file.executable:
        os.chmod(path, 0o755)


def _verify_file(dep: Dependency, dep_file: DependencyFile) -> None:
    if not dep_file.sha256:
        return
    actual = _sha256_file(dep_file.path)
    if actual != dep_file.sha256:
        raise RuntimeError(
            "Checksum mismatch for {} ({}).\n".format(dep.name, dep_file.name)
            + f"Expected: {dep_file.sha256}\n"
            + f"Actual:   {actual}\n"
            + "Delete the file or set SONGBASE_FORCE_DOWNLOAD=1 to re-download."
        )


def _parse_args() -> tuple[list[str], bool, bool]:
    import argparse

    parser = argparse.ArgumentParser(
        description="Ensure local package dependencies are present.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Ensure all known dependencies.",
    )
    parser.add_argument(
        "--name",
        action="append",
        default=[],
        help="Dependency name (can be passed multiple times).",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Disable automatic downloads.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-download even if files exist.",
    )

    args = parser.parse_args()
    if not args.all and not args.name:
        parser.error("Use --all or --name to select dependencies.")

    names = list(DEPENDENCIES.keys()) if args.all else args.name
    return names, not args.no_download, args.force


def main() -> int:
    names, allow_download, force_download = _parse_args()
    ensure_dependencies(
        names=names,
        allow_download=allow_download,
        force_download=force_download,
    )
    print("Dependencies ensured.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
