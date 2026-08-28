#!/usr/bin/env bash
# GM Helper - pull, commit, push, then optional FTP deploy (Linux)
#
# Used when Arnd asks to change something on the Linux bot:
#   ./ship.sh "Fix dice roller layout"
#   npm run ship -- "Fix dice roller layout"
#
# Never prompts interactively. Never prints FTP_PASSWORD.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

MSG="${1:-}"
BRANCH="$(git branch --show-current)"
if [[ -z "$BRANCH" ]]; then
  echo "Could not determine current branch (detached HEAD?)." >&2
  exit 1
fi

echo "git pull --ff-only origin ${BRANCH}..."
if git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  git pull --ff-only origin "$BRANCH"
else
  git fetch origin "$BRANCH" >/dev/null 2>&1 || true
  if git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
    git pull --ff-only origin "$BRANCH"
  else
    echo "Remote branch origin/${BRANCH} not found yet; continuing without pull."
  fi
fi

porcelain="$(git status --porcelain || true)"
if [[ -n "$porcelain" ]]; then
  change_count="$(printf '%s\n' "$porcelain" | grep -c . || true)"
  if [[ -z "$MSG" ]]; then
    if [[ "$change_count" -eq 1 ]]; then
      path="$(printf '%s\n' "$porcelain" | awk '{print $NF}')"
      MSG="Update ${path}"
      echo "No commit message given; using short default for one change: ${MSG}"
    else
      echo "Commit message required when there are ${change_count} changed paths." >&2
      echo "Usage: ./ship.sh \"Your message\"" >&2
      exit 1
    fi
  fi

  echo "Committing changes..."
  git add -A
  git commit -m "$MSG"
else
  echo "No local changes to commit."
fi

echo "git push origin ${BRANCH}..."
git push -u origin "$BRANCH"

if [[ -n "${FTP_PASSWORD:-}" ]]; then
  echo "FTP_PASSWORD is set; running ./deploy-sync.sh..."
  ./deploy-sync.sh
else
  echo "Push done. FTP_PASSWORD is unset — GitHub Action deploy will run if the Action and FTP_PASSWORD secret exist."
fi
