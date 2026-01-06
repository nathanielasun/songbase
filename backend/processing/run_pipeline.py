from __future__ import annotations

from backend import bootstrap


def main() -> int:
    bootstrap.ensure_python_deps()

    from backend.processing import orchestrator

    return orchestrator.main()


if __name__ == "__main__":
    raise SystemExit(main())
