---
name: Verifying Expo UI on Replit
description: Why app_preview/screenshot can't capture Expo screens here, and what to use instead.
---

The `screenshot` / `app_preview` tool targets port 5000 (the Express backend), which only
serves the API + a QR-code landing page at `/`. It returns an Express `Cannot GET /<path>`
for any Expo Router route and the landing page for `/`. It does NOT render the Expo web app
(which runs on port 8081).

**Why:** This stack splits backend (5000) and Expo dev server (8081); the preview/screenshot
plumbing points at 5000.

**How to apply:** To visually verify an Expo screen, use the `testing` skill (`runTest`),
which drives the real app on port 8081 — navigate by Expo Router path (e.g. `/how-it-works`),
mobile viewport 400x720. Don't burn `screenshot` calls on Expo routes; they will always show
the landing page or a 404.
