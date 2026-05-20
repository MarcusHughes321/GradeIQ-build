---
name: object-storage-expert
description: L3 expert on the Object Storage and image backup system in Grade.IQ. Knows how grading photos are uploaded to Replit Object Storage, the storage path conventions, how images are served back via API, retroactive upload, and the expo-file-system/legacy import requirement. Consult when changing how images are stored, adding new types of file uploads, or debugging missing images after reinstall.
---

# Object Storage & Image Backup — L3 Expert

You know how Grade.IQ stores and retrieves card photos from Replit Object Storage. This system is what makes grading history images survive a reinstall — without it, users lose their card photos as soon as they delete the app.

---

## What Gets Stored

Only grading result images are stored in Object Storage:
- Front card image
- Back card image

These are uploaded automatically after a grading job completes, as a background fire-and-forget operation. They are NOT uploaded before grading — the server uses the images for grading and then the client uploads them afterward.

**What is NOT stored:** Collection Scan images, Deep Grade close-up images (16 photos would be expensive), Centering Tool images. Only the 2 primary quick/crossover grade photos per result.

---

## Bucket Structure

**Bucket:** The `PRIVATE_OBJECT_DIR` bucket (`.private`). Not publicly accessible.

**Path convention:**
```
{stableUserId}/{gradingUUID}/front.jpg
{stableUserId}/{gradingUUID}/back.jpg
```

Using `stableUserId` as the top-level directory:
1. All photos for a user are grouped together
2. If the user reinstalls and has a new RC user ID but the same stable UUID, their photos are still found

---

## Upload Process (`lib/server-history.ts`)

Called after a grading result is saved locally. Fire-and-forget — does not block the UI or the results screen.

```typescript
async function uploadGradingImages(grading: SavedGrading): Promise<void> {
  if (!grading.frontImageUri || !grading.backImageUri) return;
  if (grading.frontImageUrl && grading.backImageUrl) return; // already uploaded

  // Resize to 400px wide, JPEG quality 60
  const frontResized = await resizeImage(grading.frontImageUri, 400, 60);
  const backResized = await resizeImage(grading.backImageUri, 400, 60);

  // Upload both
  const frontUrl = await uploadToStorage(grading.stableId, grading.id, 'front', frontResized);
  const backUrl = await uploadToStorage(grading.stableId, grading.id, 'back', backResized);

  // Save URLs back to local storage
  await updateGradingImageUrls(grading.id, frontUrl, backUrl);
}
```

**Image spec:** 400px wide, JPEG at 60% quality. This is enough to recognise the card on reinstall without excessive storage cost.

---

## Serving Images (`GET /api/grading-image/:uuid`)

Object Storage objects are not publicly accessible. The client cannot fetch them directly — all access goes through the server.

The route:
1. Looks up `grading_history` row by UUID to find the storage path
2. Verifies the requesting user owns this grading (via `rcUserId` or `stableUserId` in query params)
3. Fetches the object from Object Storage
4. Pipes it to the response with appropriate `Content-Type: image/jpeg` header

**Client usage:** When rendering history after reinstall, `SavedGrading.frontImageUrl` contains the full URL to this endpoint. The Expo `Image` component loads it like any remote URL.

---

## Retroactive Upload (`retroactiveImageUpload`)

Users who had grading history before photo backup was introduced (or who had local images not yet uploaded) get their photos uploaded retroactively on startup.

```typescript
async function retroactiveImageUpload(): Promise<void> {
  const local = await loadAllGradings();
  const needsUpload = local
    .filter(g => g.frontImageUri && !g.frontImageUrl)
    .slice(0, 30); // cap at 30 to avoid long startup

  for (const grading of needsUpload) {
    await uploadGradingImages(grading).catch(() => {}); // ignore failures
  }
}
```

**Key properties:**
- **Fire-and-forget:** Called with no `await` from the startup sequence
- **30-item cap:** Prevents long startup time for users with large history
- **Fails silently:** Individual upload failures are caught and ignored — a failed upload just means that image stays local for now and will be retried next launch

---

## expo-file-system/legacy Import

All file system operations in the client **must** import from `expo-file-system/legacy`:

```typescript
import * as FileSystem from 'expo-file-system/legacy';
```

**Not** `from 'expo-file-system'`. The non-legacy export changed its API in a way that breaks the patterns used throughout the codebase. This includes:
- Writing TTS audio files
- Reading captured image files before upload
- Writing downloaded image files for the results screen

**If you add any new file system operation**, use the `/legacy` import.

---

## Object Storage Client (`server/objectStorage.ts`)

The server-side module that wraps Replit Object Storage operations.

Key functions:
```typescript
uploadObject(path: string, buffer: Buffer, contentType: string): Promise<string>
downloadObject(path: string): Promise<Buffer>
deleteObject(path: string): Promise<void>
objectExists(path: string): Promise<boolean>
```

**Env var:** `DEFAULT_OBJECT_STORAGE_BUCKET_ID` — the bucket ID. Already set in the environment; never hardcode.

---

## Public vs Private Bucket

The setup includes two directories in the bucket:
- `public/` — for publicly accessible assets (not currently used for user data)
- `.private/` — for private user data (grading photos)

Grading photos always go in `.private/`. Never put user-uploaded content in `public/` — it would be accessible without authentication.

---

## Key Files

- `server/objectStorage.ts` — Object Storage client wrapper
- `lib/server-history.ts` — `uploadGradingImages`, `retroactiveImageUpload`
- `server/routes.ts` — `GET /api/grading-image/:uuid` serving route

---

## Common Mistakes to Avoid

- **Always use `expo-file-system/legacy`** — the non-legacy export breaks existing file operation patterns
- **Upload is fire-and-forget** — never await it in a user-facing flow; it should not block results display
- **Only call `acknowledge` after local save AND after upload URLs are stored** — actually, `acknowledge` is about the job result, not the image upload. Don't conflate these two flows.
- **Never expose Object Storage objects directly to the client** — always serve via the API route with auth check
- **Retroactive upload must stay capped at 30 items** — it runs on startup; an uncapped version would make startup painfully slow for power users
