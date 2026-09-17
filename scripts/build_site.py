#!/usr/bin/env python3
"""Assemble the exact public GitHub Pages payload into _site/."""

from __future__ import annotations

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "_site"
FILES = ("index.html", "catalog.json", "CNAME")
DIRECTORIES = ("assets", "audio")


def main() -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir()

    for relative in FILES:
        shutil.copy2(ROOT / relative, DEST / relative)
    for relative in DIRECTORIES:
        shutil.copytree(ROOT / relative, DEST / relative)

    file_count = sum(1 for path in DEST.rglob("*") if path.is_file())
    total_bytes = sum(path.stat().st_size for path in DEST.rglob("*") if path.is_file())
    print(f"OK: built _site with {file_count} files, {total_bytes / (1024 * 1024):.1f} MiB")


if __name__ == "__main__":
    main()
