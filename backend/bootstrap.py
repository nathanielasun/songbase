from __future__ import annotations

import argparse
import hashlib
import importlib
import os
import subprocess
import sys
import warnings
from pathlib import Path

# Suppress FutureWarning from Keras tf2onnx_lib.py about np.object deprecation
# This is a known issue with Keras and NumPy 2.x compatibility
warnings.filterwarnings(
    "ignore",
    message=r".*np\.object.*",
    category=FutureWarning,
    module=r"keras\.src\.export\.tf2onnx_lib"
)

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

# Optional modules for GPU acceleration (not required for CPU-only operation)
OPTIONAL_MODULES = {
    "tensorflow_metal": "Metal GPU acceleration for macOS (Apple Silicon M1/M2/M3)",
}


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
        except Exception as exc:
            # Handle cases like tensorflow failing due to incompatible plugins
            if module_name == "tensorflow" and "metal" in str(exc).lower():
                print(
                    f"⚠ TensorFlow failed to load due to incompatible tensorflow-metal plugin.\n"
                    f"  Attempting to fix by uninstalling tensorflow-metal..."
                )
                try:
                    subprocess.run(
                        [sys.executable, "-m", "pip", "uninstall", "tensorflow-metal", "-y"],
                        check=True,
                        capture_output=True,
                    )
                    print("✓ Removed incompatible tensorflow-metal. Please restart the application.")
                except subprocess.CalledProcessError:
                    print(
                        f"  Failed to auto-remove. Please run manually:\n"
                        f"    pip uninstall tensorflow-metal"
                    )
                return False
            raise
    return True


def _is_apple_silicon() -> bool:
    """Check if running on Apple Silicon (M1/M2/M3)."""
    import platform
    return platform.system() == "Darwin" and platform.processor() == "arm"


def _is_tensorflow_metal_installed() -> bool:
    """Check if tensorflow-metal package is installed."""
    try:
        from importlib.metadata import distributions
        installed_packages = {dist.metadata['Name'].lower() for dist in distributions()}
        return 'tensorflow-metal' in installed_packages
    except Exception:
        return False


def _install_tensorflow_metal(env: dict[str, str] | None = None) -> bool:
    """
    Attempt to install tensorflow-metal on Apple Silicon Macs.

    Returns True if installation succeeded or module already installed.
    """
    # Check if already installed
    if _is_tensorflow_metal_installed():
        return True

    if not _is_apple_silicon():
        return False

    # Verify TensorFlow version for compatibility
    try:
        import tensorflow as tf
        tf_version = tf.__version__
        major, minor = map(int, tf_version.split('.')[:2])

        # tensorflow-metal works with TensorFlow 2.13-2.17
        # requirements.txt pins TensorFlow to <2.18.0 for compatibility
        if major != 2 or minor < 13 or minor > 17:
            print(
                f"⚠ TensorFlow {tf_version} detected on Apple Silicon.\n"
                f"  tensorflow-metal requires TensorFlow 2.13-2.17.\n"
                f"  Please install a compatible version:\n"
                f"    pip install 'tensorflow>=2.16.0,<2.18.0'"
            )
            return False
    except Exception:
        pass

    print("🍎 Apple Silicon detected. Installing tensorflow-metal for GPU acceleration...")

    install_env = env or os.environ.copy()
    install_env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
    install_env.setdefault("PIP_CACHE_DIR", str(PIP_CACHE_DIR))

    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "tensorflow-metal>=1.1.0",
    ]

    try:
        subprocess.run(cmd, check=True, env=install_env, capture_output=True)
        # Invalidate import caches so the newly installed module can be found
        importlib.invalidate_caches()
        print("✓ tensorflow-metal installed successfully")
        return True
    except subprocess.CalledProcessError as exc:
        print(f"⚠ Failed to install tensorflow-metal: {exc}")
        print("  GPU acceleration will not be available. CPU will be used instead.")
        return False


def _check_optional_modules(skip_metal_warning: bool = False) -> None:
    """Check and log availability of optional GPU acceleration modules."""
    for module_name, description in OPTIONAL_MODULES.items():
        if module_name == "tensorflow_metal":
            # Check package installation, not module import (tensorflow-metal is a plugin)
            if _is_tensorflow_metal_installed():
                print(f"✓ tensorflow-metal is installed: {description}")
            elif not skip_metal_warning and _is_apple_silicon():
                print(
                    f"ℹ tensorflow-metal not installed.\n"
                    f"  {description}\n"
                    f"  To enable Metal GPU acceleration, run: pip install tensorflow-metal"
                )
        else:
            try:
                importlib.import_module(module_name)
                print(f"✓ Optional module '{module_name}' is installed: {description}")
            except ImportError:
                print(f"ℹ Optional module '{module_name}' not installed: {description}")


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
        # Auto-install tensorflow-metal on Apple Silicon if not present
        metal_attempted = _is_apple_silicon()
        _install_tensorflow_metal()
        # Check optional modules when dependencies are ready
        _check_optional_modules(skip_metal_warning=metal_attempted)
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

    # Auto-install tensorflow-metal on Apple Silicon Macs
    metal_attempted = _is_apple_silicon()
    _install_tensorflow_metal(env)

    MARKER_PATH.write_text(
        f"requirements={requirements_hash}\npython={python_tag}\n",
        encoding="utf-8",
    )

    # Check optional modules after installation
    _check_optional_modules(skip_metal_warning=metal_attempted)


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
