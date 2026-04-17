#!/bin/bash
# Push current code to GitHub (fast - no full history)
# Usage: bash scripts/push-to-github.sh

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN secret not set in Replit Secrets"
  exit 1
fi

GITHUB_URL="https://MarcusHughes321:${GITHUB_TOKEN}@github.com/MarcusHughes321/GradeIQ-build.git"
VERSION=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "unknown")

echo "Pushing Grade.IQ v$VERSION to GitHub..."

# Create an orphan branch with just current files (no large history)
git checkout --orphan _github_push 2>&1

# Stage everything except attached_assets
git add --all -- ':!attached_assets/' 2>&1

# Commit
git commit -m "Grade.IQ v$VERSION" --quiet

# Force push to GitHub main
GIT_LFS_SKIP_PUSH=1 GIT_TERMINAL_PROMPT=0 git push --force "$GITHUB_URL" _github_push:main
echo "✓ Successfully pushed to GitHub"

# Switch back to main
git checkout -f main 2>&1
git branch -D _github_push 2>&1 || true

echo "✓ Done! GitHub repo is up to date with v$VERSION"
