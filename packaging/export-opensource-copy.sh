#!/usr/bin/env bash
# Exports the current HEAD tree as a fresh git repo (single commit, no prior history).
# Use before pushing to a new public remote so old private notes/commits stay private.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"

if [[ -z "$DEST" ]]; then
  echo "Usage: $0 <destination-directory>" >&2
  echo "Example: $0 ../household-finance-public" >&2
  exit 1
fi

if [[ -e "$DEST" ]]; then
  echo "Destination already exists: $DEST" >&2
  exit 1
fi

mkdir -p "$DEST"
# Only tracked files — respects .gitignore / what is committed.
git -C "$ROOT" archive HEAD | tar -x -C "$DEST"

cd "$DEST"
git init -b main
git add -A
git commit -m "chore: open-source release snapshot

Exported from private tree via packaging/export-opensource-copy.sh (no prior history)."

echo ""
echo "Created fresh repo at: $DEST"
echo "Next (example):"
echo "  cd $(printf '%q' "$DEST")"
echo "  gh repo create YOUR_ORG/REPO_NAME --public --source=. --remote=origin --push"
echo "  # or: git remote add origin <url> && git push -u origin main"
