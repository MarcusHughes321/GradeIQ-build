---
name: image-pipeline-expert
description: L3 expert on the image processing pipeline in Grade.IQ. Knows every transformation applied to a card photo before it reaches the AI — HEIF conversion, resize, compression, AI boundary detection, Sobel fallback, auto-crop, tilt correction, slab detection, and Deep Grade enhancement. Consult when changing how images are prepared, adding new photo processing steps, debugging image quality issues, or modifying how card boundaries are detected.
---

# Image Processing Pipeline — L3 Expert

You know every step applied to a card photo between capture and AI analysis. This pipeline runs entirely on the server (Express/TypeScript) for all grading modes. The client only captures images and sends them — all processing happens server-side.

---

## Pipeline Overview (Quick Grade & Bulk Grade)

All steps run in sequence on each image before it is sent to Claude.

```
Client image (JPEG/HEIC/PNG/WebP)
       │
       ▼
1. HEIF/HEIC conversion    (heif-convert)
       │
       ▼
2. Resize to max 1024px    (sharp)
       │
       ▼
3. JPEG compression        (sharp, quality 85)
       │
       ▼
4. AI boundary detection   (Claude Sonnet)
       │  └─ fallback: Sobel gradient
       ▼
5. Auto-crop + padding     (sharp)
       │
       ▼
6. Base64 encode           (Buffer.toString('base64'))
       │
       ▼
Claude vision API
```

---

## Step 1 — HEIF/HEIC Conversion

iOS devices can send photos in HEIC format (iOS Live Photos default). The `heif-convert` package converts these to JPEG before any further processing.

**Why first:** `sharp` cannot reliably process HEIC files on all server environments.

```typescript
import heifConvert from 'heif-convert';
const jpegBuffer = await heifConvert({ buffer: inputBuffer, format: 'JPEG' });
```

If the input is already JPEG/PNG/WebP, this step is a no-op (detected by magic bytes).

---

## Step 2 — Resize

Max 1024px on the longest side. Aspect ratio preserved.

```typescript
sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
```

**Why 1024px:** Claude's vision API processes images at a maximum effective resolution of ~1024px. Sending larger images increases payload size and latency without improving accuracy.

**Do not increase this limit** without benchmarking — it has a direct cost/latency impact on every grade.

---

## Step 3 — JPEG Compression

Quality 85 after resize. Strips EXIF metadata.

```typescript
.jpeg({ quality: 85, stripMetadata: true })
```

---

## Step 4 — AI Boundary Detection

Claude Sonnet is asked to return pixel coordinates for:
- Outer card edges (the full card boundary)
- Inner artwork bounds (the printed image area)

Returns a JSON object: `{ outerBounds: {x, y, w, h}, artworkBounds: {x, y, w, h} }`.

**Validation:** The response is validated — if coordinates are outside the image dimensions, negative, or the bounding box is smaller than a minimum card size (to catch hallucinations), the Sobel fallback runs instead.

### Sobel Gradient Fallback

Multi-resolution Sobel edge detection:
1. Convert to greyscale
2. Apply Gaussian blur (reduces noise)
3. Compute horizontal + vertical Sobel gradients
4. Threshold to find strong edges
5. Find the largest rectangular region bounded by strong edges
6. Repeat at 2× and 4× resolution, take the median result

The Sobel fallback is less accurate than AI detection on complex backgrounds (cluttered desk, patterned fabric). If accuracy reports worsen, check whether users are hitting the fallback path more than expected.

---

## Step 5 — Auto-Crop with Padding

Uses the outer card bounds from step 4. Adds 3% padding on each side (so the crop has a small margin around the card rather than cutting to the exact edge).

```typescript
sharp(buffer).extract({ left: x - pad, top: y - pad, width: w + 2*pad, height: h + 2*pad })
```

---

## Step 6 — Base64 Encoding

Final processed buffer is base64-encoded for inclusion in Claude's message content array.

---

## Deep Grade Enhancement (additional steps)

Deep Grade runs all standard steps PLUS an enhancement pass on every photo before the boundary detection step.

**Inserted after step 3, before step 4:**

```typescript
sharp(buffer)
  .sharpen({ sigma: 1.2 })          // increase definition of edges/texture
  .modulate({ brightness: 1.05 })   // lift shadows slightly
  .linear(1.1, -(128 * 0.1))        // contrast boost
```

**Why:** These adjustments make surface scratches, edge wear, and corner chipping more visible to the AI at the cost of slightly artificial-looking images. The AI is analysing for defects, not aesthetics — the enhancement helps it find them.

---

## Slab Detection (Crossover Grade)

For crossover grading (cards in slabs), standard card boundary detection doesn't work — the slab edges are not the card edges.

**Approach:** Aspect ratio analysis. A standard PSA/BGS/ACE slab has a known aspect ratio (~1:1.4). The label region occupies the top ~15% of the slab. The physical card occupies the remaining window.

Steps:
1. Detect the outer slab boundary using standard boundary detection
2. Calculate the label height from the top based on known label proportions
3. The card top = slab top + label height
4. Card bounds = slab inner window below the label

This gives approximate card coordinates. Claude is then given these coordinates as context when analysing the slab photo.

**Known limitation:** Non-standard slabs (thick slabs, SGC, older PSA cases) may have different proportions. The approximation degrades for unusual slab types.

---

## Tilt Detection and Correction

If the card is photographed at an angle (tilted in-frame), the crop will be skewed, which confuses both boundary detection and the AI.

**Detection:** After boundary detection, check if the bounding box has a rotation component (i.e., the detected card edges are not axis-aligned). If the tilt exceeds ~3°, apply correction.

**Correction:** `sharp` rotation to align the card with the image axes before cropping.

**Note:** Tilt correction is only applied when the tilt is detected with high confidence. Aggressive correction on an incorrectly-detected tilt makes things worse.

---

## Client-Side: expo-file-system Import

When the client needs to access the file system (e.g., writing audio files, reading captured images), the import must be:

```typescript
import * as FileSystem from 'expo-file-system/legacy';
```

**Not** `from 'expo-file-system'`. The non-legacy export changed its API and breaks existing usage patterns in this codebase.

---

## Key Files

- `server/routes.ts` — image processing logic (look for `processImage`, `detectCardBoundary`, `enhanceForDeepGrade`)
- `server/imageProcessing.ts` — Sharp pipeline helpers (if extracted from routes)

---

## Common Mistakes to Avoid

- **Don't bypass boundary detection** — sending uncropped images reduces AI accuracy significantly
- **Don't increase the 1024px limit** without testing — every extra pixel adds cost and latency
- **Don't run enhancement on Quick Grade** — it's Deep Grade only. Enhancement on Quick Grade would slow the pipeline without a corresponding accuracy benefit
- **Don't remove the Sobel fallback** — Claude boundary detection fails occasionally; the fallback ensures the pipeline never crashes
- **Slab detection is approximate** — never trust it to be pixel-perfect; give Claude context about the uncertainty
