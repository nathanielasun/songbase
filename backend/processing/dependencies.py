from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
import tarfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from audio_pipeline import config as vggish_config
else:
    from .audio_pipeline import config as vggish_config


@dataclass(frozen=True)
class DependencyFile:
    name: str
    path: Path
    url: str | None = None
    url_env: str | None = None
    sha256: str | None = None
    executable: bool = False
    archive_member: str | None = None
    archive_sha256: str | None = None
    extract_all: bool = False
    archive_root: str | None = None
    create_marker: bool = False


@dataclass(frozen=True)
class Dependency:
    name: str
    description: str
    files: tuple[DependencyFile, ...]


PROCESSING_DIR = Path(__file__).resolve().parent


def _postgres_bundle_dir() -> Path:
    override = os.environ.get("POSTGRES_BUNDLE_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return PROCESSING_DIR / "bin" / "postgres"


POSTGRES_BUNDLE_DIR = _postgres_bundle_dir()
POSTGRES_BUNDLE_MARKER = POSTGRES_BUNDLE_DIR / ".bundle_ready"
POSTGRES_BUNDLE_MANIFEST = Path(
    os.environ.get("POSTGRES_BUNDLE_MANIFEST", PROCESSING_DIR / "postgres_bundle.json")
)

VGGISH_SOURCE_BASE_URL = (
    "https://raw.githubusercontent.com/tensorflow/models/master/"
    "research/audioset/vggish"
)


def _default_ffmpeg_url() -> str | None:
    system = sys.platform
    machine = platform.machine().lower()
    if system == "darwin":
        return "https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip"
    if system.startswith("linux"):
        if machine in {"x86_64", "amd64"}:
            return (
                "https://johnvansickle.com/ffmpeg/releases/"
                "ffmpeg-release-amd64-static.tar.xz"
            )
        if machine in {"aarch64", "arm64"}:
            return (
                "https://johnvansickle.com/ffmpeg/releases/"
                "ffmpeg-release-arm64-static.tar.xz"
            )
    return None


def _postgres_bundle_platform_key() -> str | None:
    system = sys.platform
    machine = platform.machine().lower()
    if system == "darwin":
        system_key = "darwin"
    elif system.startswith("linux"):
        system_key = "linux"
    elif system in {"win32", "cygwin"} or system.startswith("win"):
        system_key = "windows"
    else:
        return None

    if machine in {"x86_64", "amd64"}:
        arch = "x86_64"
    elif machine in {"aarch64", "arm64"}:
        arch = "arm64"
    else:
        arch = machine
    return f"{system_key}_{arch}"


def _load_postgres_bundle_manifest() -> dict:
    if not POSTGRES_BUNDLE_MANIFEST.exists():
        return {}
    try:
        data = json.loads(POSTGRES_BUNDLE_MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if isinstance(data, dict):
        return data
    return {}


def _postgres_bundle_manifest_entry() -> dict:
    key = _postgres_bundle_platform_key()
    if not key:
        return {}
    data = _load_postgres_bundle_manifest()
    entry = data.get(key, {})
    if isinstance(entry, dict):
        return entry
    return {}


def _postgres_bundle_manifest_value(name: str) -> str | None:
    entry = _postgres_bundle_manifest_entry()
    value = entry.get(name)
    if isinstance(value, str):
        value = value.strip()
        if value:
            return value
    return None


def _default_postgres_bundle_url() -> str | None:
    override = os.environ.get("POSTGRES_BUNDLE_URL")
    if override:
        return override

    system = sys.platform
    machine = platform.machine().lower()
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            return os.environ.get("POSTGRES_BUNDLE_URL_DARWIN_ARM64")
        if machine in {"x86_64", "amd64"}:
            return os.environ.get("POSTGRES_BUNDLE_URL_DARWIN_X86_64")
    if system.startswith("linux"):
        if machine in {"x86_64", "amd64"}:
            return os.environ.get("POSTGRES_BUNDLE_URL_LINUX_AMD64")
        if machine in {"aarch64", "arm64"}:
            return os.environ.get("POSTGRES_BUNDLE_URL_LINUX_ARM64")
    return _postgres_bundle_manifest_value("url")


def _default_postgres_bundle_sha256() -> str | None:
    override = os.environ.get("POSTGRES_BUNDLE_SHA256")
    if override:
        return _normalize_sha256(override)

    system = sys.platform
    machine = platform.machine().lower()
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            return _normalize_sha256(os.environ.get("POSTGRES_BUNDLE_SHA256_DARWIN_ARM64", ""))
        if machine in {"x86_64", "amd64"}:
            return _normalize_sha256(os.environ.get("POSTGRES_BUNDLE_SHA256_DARWIN_X86_64", ""))
    if system.startswith("linux"):
        if machine in {"x86_64", "amd64"}:
            return _normalize_sha256(os.environ.get("POSTGRES_BUNDLE_SHA256_LINUX_AMD64", ""))
        if machine in {"aarch64", "arm64"}:
            return _normalize_sha256(os.environ.get("POSTGRES_BUNDLE_SHA256_LINUX_ARM64", ""))
    return _normalize_sha256(_postgres_bundle_manifest_value("sha256") or "")


def _postgres_bundle_archive_root() -> str | None:
    value = os.environ.get("POSTGRES_BUNDLE_ARCHIVE_ROOT")
    if not value:
        value = _postgres_bundle_manifest_value("archive_root")
    if not value:
        return None
    return value.strip().strip("/")

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
                url=_default_ffmpeg_url(),
                url_env="FFMPEG_DOWNLOAD_URL",
                sha256=_normalize_sha256(os.environ.get("FFMPEG_SHA256", "")),
                executable=True,
                archive_member="ffmpeg",
            ),
        ),
    ),
    "postgres_bundle": Dependency(
        name="postgres_bundle",
        description="Local Postgres + pgvector bundle for plug-and-play usage.",
        files=(
            DependencyFile(
                name="postgres_bundle",
                path=POSTGRES_BUNDLE_MARKER,
                url=_default_postgres_bundle_url(),
                url_env="POSTGRES_BUNDLE_URL",
                archive_sha256=_default_postgres_bundle_sha256(),
                extract_all=True,
                archive_root=_postgres_bundle_archive_root(),
                create_marker=True,
            ),
        ),
    ),
}

_FIRST_RUN_READY = False


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


def _download_file(
    url: str,
    dest_path: Path,
    archive_member: str | None = None,
    archive_sha256: str | None = None,
    extract_all: bool = False,
    archive_root: str | None = None,
    create_marker: bool = False,
) -> None:
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
    try:
        if archive_sha256:
            actual = _sha256_file(temp_path)
            if actual != archive_sha256:
                raise RuntimeError(
                    "Checksum mismatch for archive download.\n"
                    f"Expected: {archive_sha256}\n"
                    f"Actual:   {actual}"
                )

        if zipfile.is_zipfile(temp_path) or tarfile.is_tarfile(temp_path):
            if extract_all:
                target_dir = dest_path if dest_path.is_dir() else dest_path.parent
                _extract_archive_all(temp_path, target_dir, archive_root)
                _mark_executable_dir(target_dir / "bin")
                if create_marker:
                    dest_path.write_text("ok", encoding="utf-8")
            else:
                _extract_archive(temp_path, dest_path, archive_member)
        else:
            temp_path.replace(dest_path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def _extract_archive(
    archive_path: Path,
    dest_path: Path,
    member_name: str | None,
) -> None:
    target_name = member_name or dest_path.name
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            match = _select_archive_member(archive.namelist(), target_name)
            if not match:
                raise RuntimeError(
                    f"Expected {target_name} in archive {archive_path.name}"
                )
            with archive.open(match) as src, dest_path.open("wb") as dst:
                _copy_stream(src, dst)
        return

    if tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path) as archive:
            members = [m for m in archive.getmembers() if m.isfile()]
            names = [m.name for m in members]
            match = _select_archive_member(names, target_name)
            if not match:
                raise RuntimeError(
                    f"Expected {target_name} in archive {archive_path.name}"
                )
            member = next(m for m in members if m.name == match)
            extracted = archive.extractfile(member)
            if extracted is None:
                raise RuntimeError(
                    f"Unable to extract {match} from {archive_path.name}"
                )
            with extracted, dest_path.open("wb") as dst:
                _copy_stream(extracted, dst)
        return

    raise RuntimeError(f"Unsupported archive type: {archive_path.name}")


def _extract_archive_all(
    archive_path: Path,
    dest_dir: Path,
    archive_root: str | None,
) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    root_prefix = f"{archive_root}/" if archive_root else None

    def _relpath(name: str) -> str | None:
        if root_prefix:
            if not name.startswith(root_prefix):
                return None
            relative = name[len(root_prefix) :]
        else:
            relative = name
        if not relative or relative.endswith("/"):
            return None
        if ".." in Path(relative).parts:
            raise RuntimeError("Unsafe path in archive.")
        return relative

    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            for name in archive.namelist():
                relative = _relpath(name)
                if not relative:
                    continue
                target = dest_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(name) as src, target.open("wb") as dst:
                    _copy_stream(src, dst)
        return

    if tarfile.is_tarfile(archive_path):
        with tarfile.open(archive_path) as archive:
            members = [m for m in archive.getmembers() if m.isfile()]
            for member in members:
                relative = _relpath(member.name)
                if not relative:
                    continue
                target = dest_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = archive.extractfile(member)
                if extracted is None:
                    continue
                with extracted, target.open("wb") as dst:
                    _copy_stream(extracted, dst)
        return

    raise RuntimeError(f"Unsupported archive type: {archive_path.name}")


def _mark_executable_dir(path: Path) -> None:
    if not path.exists() or not path.is_dir():
        return
    for candidate in path.iterdir():
        if not candidate.is_file():
            continue
        try:
            os.chmod(candidate, 0o755)
        except OSError:
            continue


def _select_archive_member(names: list[str], target_name: str) -> str | None:
    if target_name in names:
        return target_name
    for name in names:
        if name.endswith(f"/{target_name}") or name == target_name:
            return name
    return None


def _copy_stream(src, dst) -> None:
    for chunk in iter(lambda: src.read(1024 * 1024), b""):
        dst.write(chunk)


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


def ensure_first_run_dependencies() -> None:
    global _FIRST_RUN_READY
    if _FIRST_RUN_READY:
        return
    ensure_dependencies(["ffmpeg", "vggish_source", "vggish_assets"])
    _FIRST_RUN_READY = True


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

    _download_file(
        url,
        path,
        archive_member=dep_file.archive_member,
        archive_sha256=dep_file.archive_sha256,
        extract_all=dep_file.extract_all,
        archive_root=dep_file.archive_root,
        create_marker=dep_file.create_marker,
    )
    _verify_file(dep, dep_file)

    if dep_file.executable:
        os.chmod(path, 0o755)


def _verify_file(dep: Dependency, dep_file: DependencyFile) -> None:
    if not dep_file.sha256:
        return
    if dep_file.extract_all:
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


def postgres_bundle_dir() -> Path:
    return POSTGRES_BUNDLE_DIR


def postgres_bin_dir() -> Path:
    return POSTGRES_BUNDLE_DIR / "bin"


def postgres_bundle_marker() -> Path:
    return POSTGRES_BUNDLE_MARKER


def postgres_bundle_url() -> str | None:
    return _default_postgres_bundle_url()


if __name__ == "__main__":
    raise SystemExit(main())
