#!/usr/bin/env bash
# VYBE APP: SYNC PROTOCOL
# Run from repo root: ./scripts/vybe-sync-lockdown.sh
# Requires: clean intent to sync *main* (see branch check below).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Not a git repository."
  exit 1
}
cd "$ROOT"

MAIN_BRANCH="${VYBE_SYNC_MAIN_BRANCH:-main}"
CURRENT="$(git branch --show-current)"

if [[ "$CURRENT" != "$MAIN_BRANCH" && "${VYBE_SYNC_IGNORE_BRANCH:-}" != "1" ]]; then
  echo "You are on '$CURRENT', not '$MAIN_BRANCH'."
  echo "git push origin $MAIN_BRANCH would update remote $MAIN_BRANCH from your *local* $MAIN_BRANCH, not this branch."
  echo "Checkout main and merge/rebase first, or run with: VYBE_SYNC_IGNORE_BRANCH=1 $0"
  exit 1
fi

echo "📥 Fetching latest Vybe from the cloud..."
git pull origin "$MAIN_BRANCH"

echo "📦 Staging updates..."
git add .

if git diff --cached --quiet; then
  echo "Nothing new to commit — working tree was already captured."
else
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
  git commit -m "SYNC: $TIMESTAMP - Vybe Lockdown"
fi

echo "🚀 Pushing to GitHub... Work is safe."
git push origin "$MAIN_BRANCH"
