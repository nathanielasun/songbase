import sys
import uvicorn
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Songbase API Server')
    parser.add_argument('--host', default='127.0.0.1', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    args = parser.parse_args()

    uvicorn.run(
        "backend.api.app:app",
        host=args.host,
        port=args.port,
        log_level="info"
    )

if __name__ == "__main__":
    main()
