#!/usr/bin/env python3
"""Fail-fast integrity check for the static listening catalog."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog.json"
MAX_MEDIA_BYTES = 100 * 1024 * 1024


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    try:
        data = json.loads(CATALOG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read catalog.json: {exc}")

    tracks = data.get("tracks")
    if not isinstance(tracks, list):
        fail("catalog.json must contain a tracks array")

    seen_ids: set[str] = set()
    seen_sources: set[str] = set()
    total_bytes = 0

    for index, track in enumerate(tracks):
        if not isinstance(track, dict):
            fail(f"track {index} is not an object")
        for field in ("id", "title", "src"):
            if not isinstance(track.get(field), str) or not track[field].strip():
                fail(f"track {index} has no non-empty {field!r}")

        track_id = track["id"]
        src = track["src"]
        if track_id in seen_ids:
            fail(f"duplicate track id: {track_id}")
        if src in seen_sources:
            fail(f"duplicate audio src: {src}")
        seen_ids.add(track_id)
        seen_sources.add(src)

        if src.startswith(("http://", "https://")):
            continue
        path = (ROOT / src).resolve()
        if ROOT.resolve() not in path.parents:
            fail(f"track {track_id} escapes the site root: {src}")
        if not path.is_file():
            fail(f"track {track_id} references missing file: {src}")
        size = path.stat().st_size
        total_bytes += size
        if size >= MAX_MEDIA_BYTES:
            fail(f"track {track_id} is >= 100 MiB and should not be committed directly: {src}")

    required = [ROOT / "index.html", ROOT / "assets/app.js", ROOT / "assets/styles.css", ROOT / "CNAME"]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        fail(f"required site files missing: {', '.join(missing)}")

    print(f"OK: {len(tracks)} tracks, {total_bytes / (1024 * 1024):.1f} MiB local audio")


if __name__ == "__main__":
    main()
