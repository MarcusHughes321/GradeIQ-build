---
name: Replit WAF blocks data URI in POST body
description: Why grade photos must be sent as binary multipart, not base64 JSON, and how the dual-mode endpoint works
---

# Replit WAF blocks `data:image/jpeg;base64,` in POST bodies

Any POST whose body contains the literal substring `data:image/jpeg;base64,` is
rejected with a **403 HTML page by Replit's WAF before Express is reached**. This
also bit large base64 image JSON payloads.

**Why:** the edge WAF inspects request bodies and treats embedded data URIs as a
signature. There is no way to whitelist it from inside the app — it never reaches
our code.

**How to apply:**
- On the client, never put a `data:` URI in a request body. Strip the
  `data:...;base64,` prefix before sending; the server re-adds it via a
  `startsWith("data:")` guard when handing bytes to Claude.
- Prefer **binary multipart upload** for images. The phone sends raw JPEG bytes
  as `FormData` file parts, which sidesteps the WAF entirely and avoids the
  ~33% base64 size inflation (also see `upload-size-proxy-limit.md`).

## `/api/grade-job` is dual-mode (binary multipart OR base64 JSON)

`multer.fields([{name:'front'},{name:'back'}])` is attached to the route. multer
is a no-op for non-multipart requests, so the global `express.json` still handles
the old JSON path. The handler resolves `frontImage/backImage` from either
`req.files` (multipart → base64) or `req.body` (JSON). `rcUserId`/`stableUserId`
are read from `req.body` in both modes, so quota keying is unchanged.

- **Native client** uploads binary via **global `fetch`** (NOT `expo/fetch`) with
  `FormData` parts `{ uri, name, type:'image/jpeg' }` and **no explicit
  `Content-Type`** (let RN set the multipart boundary). `expo/fetch` does not
  handle RN file-URI FormData parts correctly — use global fetch for multipart.
- **Web client** keeps the base64 JSON path (no file URIs on web).

**Why binary also matters for recovery:** the server stores full-res originals in
Object Storage and returns their UUIDs as `frontImageId`/`backImageId` *inside the
result JSON*, so they flow through `completeJobInDb` / `GET /api/grade-job` /
`/api/pending-grades`. Recovered grades (after an app kill) can then restore
images from those IDs — previously the images were lost. When attaching image IDs
to server history, **chain `linkGradingImages` after `uploadGrading` resolves**,
or the link update can run before the history row exists and silently no-op.
