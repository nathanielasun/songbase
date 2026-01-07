from __future__ import annotations

import argparse
import getpass
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_PORT = 5433
DEFAULT_METADATA_DB = "songbase_metadata"
DEFAULT_IMAGE_DB = "songbase_images"

if __package__ is None:  # Allow running as a script.
    sys.path.insert(0, str(REPO_ROOT))
    sys.path.insert(0, str(REPO_ROOT / "backend" / "processing"))

try:
    from backend.processing import dependencies as processing_deps
except ImportError:
    import dependencies as processing_deps

try:
    from backend import bootstrap as python_bootstrap
except ImportError:
    try:
        import bootstrap as python_bootstrap
    except ImportError:
        python_bootstrap = None

try:
    from backend import app_settings
except ImportError:
    app_settings = None


def _metadata_root() -> Path:
    override = os.environ.get("SONGBASE_METADATA_DIR")
    if override:
        return Path(override).expanduser()
    if app_settings:
        return app_settings.resolve_paths().get(
            "metadata_dir", REPO_ROOT / ".metadata"
        )
    return REPO_ROOT / ".metadata"


def _base_dir() -> Path:
    return _metadata_root() / "postgres"


def _data_dir() -> Path:
    return _base_dir() / "data"


def _run_dir() -> Path:
    return _base_dir() / "run"


def _log_path() -> Path:
    return _base_dir() / "postgres.log"


def _local_user() -> str:
    return os.environ.get("SONGBASE_LOCAL_DB_USER", getpass.getuser())


def _port() -> int:
    return int(os.environ.get("SONGBASE_LOCAL_DB_PORT", str(DEFAULT_PORT)))


def _metadata_db() -> str:
    return os.environ.get("SONGBASE_METADATA_DB_NAME", DEFAULT_METADATA_DB)


def _image_db() -> str:
    return os.environ.get("SONGBASE_IMAGE_DB_NAME", DEFAULT_IMAGE_DB)


def _metadata_url() -> str:
    host = _run_dir().as_posix()
    return f"postgresql://{_local_user()}@/{_metadata_db()}?host={host}&port={_port()}"


def _image_url() -> str:
    host = _run_dir().as_posix()
    return f"postgresql://{_local_user()}@/{_image_db()}?host={host}&port={_port()}"


def metadata_url() -> str:
    return _metadata_url()


def image_url() -> str:
    return _image_url()


def _require_tool(name: str) -> str:
    bundle_dir = _postgres_bin_dir()
    if bundle_dir:
        candidate = bundle_dir / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)

    resolved = shutil.which(name)
    if not resolved:
        bundle_url = processing_deps.postgres_bundle_url()
        if bundle_url:
            processing_deps.ensure_dependencies(["postgres_bundle"])
            bundle_dir = _postgres_bin_dir()
            if bundle_dir:
                candidate = bundle_dir / name
                if candidate.is_file() and os.access(candidate, os.X_OK):
                    return str(candidate)
        raise RuntimeError(
            f"Missing '{name}'. Install Postgres and ensure '{name}' is on PATH."
        )
    return resolved


def _postgres_bin_dir() -> Path | None:
    override = os.environ.get("POSTGRES_BIN_DIR")
    if override:
        candidate = Path(override).expanduser()
        if candidate.is_dir():
            return candidate

    candidate = processing_deps.postgres_bin_dir()
    if candidate.exists():
        return candidate
    return None


def _run(cmd: list[str], env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, env=env, check=check, text=True, capture_output=False)


def _pg_ctl_status(pg_ctl: str) -> bool:
    if not _data_dir().exists():
        return False
    result = subprocess.run(
        [pg_ctl, "-D", str(_data_dir()), "status"],
        check=False,
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def init_cluster(initdb: str) -> bool:
    data_dir = _data_dir()
    if data_dir.exists() and (data_dir / "PG_VERSION").exists():
        return False
    data_dir.mkdir(parents=True, exist_ok=True)
    _run_dir().mkdir(parents=True, exist_ok=True)
    _run(
        [
            initdb,
            "-D",
            str(data_dir),
            "-A",
            "trust",
            "-U",
            _local_user(),
        ]
    )
    return True


def start_cluster(pg_ctl: str) -> None:
    if _pg_ctl_status(pg_ctl):
        return
    run_dir = _run_dir()
    log_path = _log_path()
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    options = f"-k {run_dir} -p {_port()}"
    _run(
        [
            pg_ctl,
            "-D",
            str(_data_dir()),
            "-l",
            str(log_path),
            "-o",
            options,
            "-w",
            "start",
        ]
    )


def stop_cluster(pg_ctl: str) -> None:
    if not _pg_ctl_status(pg_ctl):
        return
    _run([pg_ctl, "-D", str(_data_dir()), "stop"])


def _db_exists(psql: str, db_name: str) -> bool:
    result = subprocess.run(
        [
            psql,
            "-h",
            str(_run_dir()),
            "-p",
            str(_port()),
            "-U",
            _local_user(),
            "-tAc",
            f"SELECT 1 FROM pg_database WHERE datname = '{db_name}'",
        ],
        check=False,
        text=True,
        capture_output=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "1"


def _ensure_database(createdb: str, psql: str, db_name: str) -> None:
    if _db_exists(psql, db_name):
        return
    _run(
        [
            createdb,
            "-h",
            str(_run_dir()),
            "-p",
            str(_port()),
            "-U",
            _local_user(),
            db_name,
        ]
    )


def _run_migrations() -> None:
    env = os.environ.copy()
    env["SONGBASE_DATABASE_URL"] = _metadata_url()
    env["SONGBASE_IMAGE_DATABASE_URL"] = _image_url()
    _run([sys.executable, str(REPO_ROOT / "backend" / "db" / "migrate.py")], env=env)
    _run(
        [sys.executable, str(REPO_ROOT / "backend" / "db" / "migrate_images.py")],
        env=env,
    )


def ensure_cluster() -> None:
    if processing_deps.postgres_bundle_marker().exists() or processing_deps.postgres_bundle_url():
        processing_deps.ensure_dependencies(["postgres_bundle"])
    initdb = _require_tool("initdb")
    pg_ctl = _require_tool("pg_ctl")
    createdb = _require_tool("createdb")
    psql = _require_tool("psql")

    init_cluster(initdb)
    start_cluster(pg_ctl)
    _ensure_database(createdb, psql, _metadata_db())
    _ensure_database(createdb, psql, _image_db())
    if python_bootstrap:
        python_bootstrap.ensure_python_deps()
    _run_migrations()


def print_env() -> None:
    print(f'export SONGBASE_DATABASE_URL="{_metadata_url()}"')
    print(f'export SONGBASE_IMAGE_DATABASE_URL="{_image_url()}"')


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Manage local Postgres databases under .metadata.",
    )
    parser.add_argument(
        "command",
        choices=["ensure", "start", "stop", "status", "env"],
        help="Command to run.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        pg_ctl = _require_tool("pg_ctl") if args.command != "env" else None
        if args.command == "ensure":
            ensure_cluster()
        elif args.command == "start":
            start_cluster(pg_ctl)
        elif args.command == "stop":
            stop_cluster(pg_ctl)
        elif args.command == "status":
            if _pg_ctl_status(pg_ctl):
                print("running")
            else:
                print("stopped")
                return 1
        elif args.command == "env":
            print_env()
        return 0
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as exc:
        print(str(exc), file=sys.stderr)
        return exc.returncode or 1


if __name__ == "__main__":
    raise SystemExit(main())
