---
name: Upload size proxy limit
description: Replit's reverse proxy has a ~10MB request body limit; large base64 image POSTs return 403 HTML before reaching Express.
---

## Rule
Always use `uploadMaxDim = 1024` (not 2048) for client-to-server image uploads in this app.

## Why
Production builds were sending two 2048px JPEG images as base64 JSON for each grade request. That body is ~8-14 MB, which exceeds Replit's reverse-proxy limit. The proxy returns `403 Forbidden` as an HTML page — our Express server never sees the request. At 1024px the payload is ~1-2 MB.

## How to apply
- `lib/grading-context.tsx`: `const uploadMaxDim = 1024;` (no __DEV__ conditional)
- The server's `optimizeImageForAI` uses `withoutEnlargement: true`, so it never upscales a 1024px input — Claude sees the same effective resolution.
- Any new endpoint that receives base64 images must keep total JSON body well under 10 MB. For deep grade (many corner images), verify total payload stays under limit.
