#!/bin/bash
# Push current code to GitHub (fast - only changed files)
# Usage: bash scripts/push-to-github.sh

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN secret not set in Replit Secrets"
  exit 1
fi

GITHUB_URL="https://MarcusHughes321:${GITHUB_TOKEN}@github.com/MarcusHughes321/GradeIQ-build.git"
VERSION=$(node -p "require('./app.json').expo.version" 2>/dev/null || echo "unknown")

echo "Pushing Grade.IQ v$VERSION to GitHub..."

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Shallow clone the current GitHub state
echo "Fetching current GitHub state..."
GIT_LFS_SKIP_SMUDGE=1 git clone --depth=1 --quiet "$GITHUB_URL" "$TMPDIR/repo" 2>&1

# Copy only source files (exclude large/unneeded dirs)
echo "Copying updated source files..."
for item in \
  app app.json assets/grade-iq-logo.png assets/images \
  assets/tier-icons babel.config.js components constants \
  drizzle.config.ts eas.json eslint.config.js lib metro.config.js \
  package.json package-lock.json patches public replit.md scripts server \
  shared tsconfig.json .easignore .gitattributes .gitignore; do
  if [ -e "/home/runner/workspace/$item" ]; then
    mkdir -p "$TMPDIR/repo/$(dirname $item)"
    cp -r "/home/runner/workspace/$item" "$TMPDIR/repo/$item"
  fi
done

# Commit and push only if there are changes
cd "$TMPDIR/repo"
git config user.email "MarcusHughes321@gmail.com"
git config user.name "MarcusHughes321"

git add --all
if git diff --staged --quiet; then
  echo "Nothing to push - GitHub is already up to date"
else
  git commit -m "Grade.IQ v$VERSION"
  GIT_LFS_SKIP_PUSH=1 GIT_TERMINAL_PROMPT=0 git push origin main
  echo "Done! Successfully pushed v$VERSION to GitHub"
fi
