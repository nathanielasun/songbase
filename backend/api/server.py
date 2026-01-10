import os
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

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

def main():
    from backend import bootstrap
    bootstrap.ensure_python_deps()

    from backend.db import local_postgres

    import argparse
    parser = argparse.ArgumentParser(description='Songbase API Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--reload', action='store_true', help='Enable auto-reload')
    parser.add_argument('--log-level', default='info', help='Uvicorn log level')
    args = parser.parse_args()

    metadata_url = os.environ.get("SONGBASE_DATABASE_URL")
    image_url = os.environ.get("SONGBASE_IMAGE_DATABASE_URL")
    skip_bootstrap = os.environ.get("SONGBASE_SKIP_DB_BOOTSTRAP") == "1"
    needs_bootstrap = (
        not metadata_url
        or not image_url
        or local_postgres.is_local_url(metadata_url)
        or local_postgres.is_local_url(image_url)
    )
    if needs_bootstrap and not (skip_bootstrap and metadata_url and image_url):
        local_postgres.ensure_cluster()
        os.environ["SONGBASE_DATABASE_URL"] = local_postgres.metadata_url()
        os.environ["SONGBASE_IMAGE_DATABASE_URL"] = local_postgres.image_url()
        os.environ["SONGBASE_SKIP_DB_BOOTSTRAP"] = "1"

    import uvicorn

    uvicorn.run(
        "backend.api.app:app",
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        reload=args.reload,
    )

if __name__ == "__main__":
    main()
