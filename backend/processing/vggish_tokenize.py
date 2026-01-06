#!/usr/bin/env python3
"""Deprecated wrapper for the audio_pipeline CLI."""

from __future__ import annotations

from audio_pipeline.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
