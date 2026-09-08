#!/usr/bin/env python3
"""Replace the repository-owner placeholder before publishing to GitHub."""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "custom_components" / "cardata_analytics" / "manifest.json"
README = ROOT / "README.md"
PLACEHOLDER = "YOUR_GITHUB_USERNAME"


def main() -> int:
    if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9-]+", sys.argv[1]):
        print("Usage: python tools/set_github_username.py <github-username>")
        return 2
    username = sys.argv[1]

    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    base = f"https://github.com/{username}/cardata-analytics"
    data["documentation"] = base
    data["issue_tracker"] = f"{base}/issues"
    data["codeowners"] = [f"@{username}"]
    MANIFEST.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if README.exists():
        text = README.read_text(encoding="utf-8").replace(PLACEHOLDER, username)
        README.write_text(text, encoding="utf-8")

    print(f"Prepared repository for GitHub owner: {username}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
