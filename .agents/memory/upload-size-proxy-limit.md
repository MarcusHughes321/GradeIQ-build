---
name: Upload size proxy limit
description: Replit's reverse proxy has a ~10MB request body limit; large base64 image POSTs return 403 HTML before reaching Express.
---

## Rule
The real constraint is **total request body < ~10MB**, not a fixed per-image dimension. Pick the upload dimension by how many images the request carries:
- **base64 JSON path** (web fallback, `getBase64FromUri`): keep at **1024px**. base64 is ~1.33x the raw bytes, so even 2 images at 2048px (~8-14MB) blow the limit.
- **binary multipart path** (native, `prepareImageFile`): bytes are ~33% smaller than base64 and each image is a separate part, so single/few-image requests can safely go to **2048px** (quick grade = 2 imgs, crossover = 1-2 imgs).
- **many-image binary requests**: scale the dimension down so the *aggregate* stays under limit. Deep grade ships ~12 images (front/back/2 angled + 4+4 corners) → cap at **1600px** (`DEEP_MAX_DIM`). 12 imgs at 2048px ≈ 8-9MB with no margin; at 1600px ≈ 5-6MB. 1600px is still ~2.4x the pixel detail of the old 1024px path.

## Why
Production builds were sending 2048px JPEGs as base64 JSON, producing ~8-14MB bodies that exceed Replit's reverse-proxy limit. The proxy returns `403 Forbidden` HTML before Express sees the request. The fix has two parts: (1) move native uploads off base64 JSON onto binary multipart (also dodges the WAF data-URI block), and (2) size images by request cardinality, not a single global constant.

## How to apply
- `prepareImageFile(uri, maxDim = 2048)` in `lib/grading-context.tsx` takes a per-call dimension. Deep grade's binary helper passes 1600; quick/crossover use the 2048 default.
- The server's `optimizeImageForAI` uses `withoutEnlargement: true`, so it never upscales — sending 1600px means Claude sees 1600px (not re-inflated to 2048).
- Any NEW endpoint that bundles multiple images in one request: estimate worst-case aggregate (count × per-image size) and lower the dimension until it clears ~10MB with margin. Don't assume quick-grade's 2048px parity transfers to multi-image flows.
