---
name: things-tried
description: Approaches tried in Grade.IQ that were abandoned or proven wrong, with the reason — so future work does not repeat them.
---

# Things Tried (and Why They Were Abandoned)

A record of dead ends and wrong turns. Read this before "fixing" the same symptoms again.

---

### Quota — Raising the free limit from 3 to 5 to fix the "one grade then paywall" bug
**Date:** June 2026 (v1.0.19)
**What was tried:** Testers reported being able to do only one free grade before hitting the paywall. The first response assumed they were burning through the 3-grade limit in a session, and bumped the free limit 3→5 on both client and server.
**Why it was abandoned:** The limit was never the problem. The real bug was a client-side race (overlapping Android poll ticks each calling `recordUsage`, counting one grade as 2–3). The 3→5 change was reverted in v1.0.20 and the actual fix (claim-and-clear the usage recorder) was applied.
**Lesson:** The free tier is deliberately **3** quick grades/month. If users hit the paywall "too early", suspect double-counting / a recording race before touching the limit. Treat the symptom's cause, not the threshold.

---

### 403 Grading Error — Reducing image size to fix it
**Date:** June 2026 (v1.0.21)
**What was tried:** Grading POSTs returned a 403 HTML page. First diagnosis was that 2048px images produced a ~10MB body over Replit's proxy limit, so image size was dropped to 1024px and shipped as v1.0.21.
**Why it was abandoned (as the fix):** It did nothing. The 403 was Replit's WAF blocking the `data:image/jpeg;base64,` string pattern, not a size limit — a 5-byte fake payload with that prefix triggers the same 403. The real fix (v1.0.22) was stripping the data URI prefix on the client.
**Lesson:** Capping at 1024px was still kept (it is correct for the proxy limit and costs nothing), but it was not what fixed the 403. When a POST returns 403 *HTML*, test the body *pattern* before assuming it is size — send a tiny payload and a prefix-free payload to isolate which it is.

---

### Raw Image Upload — Sending full/uncompressed photos through the proxy
**Date:** June 2026 (explored, not built)
**What was tried:** The user wanted the server to receive the highest-quality (ideally raw) photos. Options explored: send full images through a normal POST; move all on-device processing (crop, tilt, enhance) to the server.
**Why it was abandoned:** Replit's proxy caps bodies at ~10MB. A raw iPhone JPEG is 8–15MB and a true raw photo 20–50MB — there is no path for them through the proxy. Moving processing server-side without a new transport would break every grade.
**Lesson:** Any "full quality to the server" plan must bypass the proxy entirely; a plain POST cannot carry it. See product-evolution.md for the chosen S3 presigned-URL direction.

---

### Direct Client Upload — GCS signed URLs via Replit Object Storage
**Date:** June 2026 (tested, rejected)
**What was tried:** To let the client upload full images straight to storage (bypassing the proxy), tested whether GCS signed URLs work with Replit's Object Storage credentials.
**Why it was abandoned:** Replit's Object Storage uses a sidecar at `127.0.0.1:1106` only reachable from inside the container — not from a user's device — so no direct client upload. Replit's credentials are an "external account" token type that likely cannot do the RSA signing GCS signed URLs require.
**Lesson:** Replit Object Storage is **server-only**. Do not design a client-direct-upload flow on top of it. For client-direct uploads, an external provider (S3) is needed.

---

### Transport Alternatives — Chunked upload and WebSocket binary frames
**Date:** June 2026 (considered, not chosen)
**What was tried:** As ways to move large images off the proxy: splitting images into ~1MB chunks POSTed separately and reassembled server-side; sending image bytes over a WebSocket (proxies treat upgraded connections differently from buffered POST bodies).
**Why they were set aside:** Both work in principle but add real complexity (partial-upload handling, reassembly, connection management). The user chose AWS S3 presigned URLs instead for guaranteed reliability at any file size, accepting a small external cost.
**Lesson:** These remain valid fallbacks if S3 is ever undesirable, but presigned-URL upload to an external store is the agreed direction. Binary `multipart/form-data` (no base64 overhead) is the lightest stopgap that clears the proxy for most real-world photos.
