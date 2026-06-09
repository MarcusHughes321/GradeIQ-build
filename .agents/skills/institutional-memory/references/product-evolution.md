---
name: product-evolution
description: How Grade.IQ's product thinking has evolved — the shifts in priorities, positioning, and direction over time.
---

# Product Evolution

The story of how the product's thinking has changed, beyond any single technical decision.

---

### Positioning — Honest "independent, early-stage" framing built into the product
**Date:** June 2026
**Shift:** The app explicitly tells users it is new, built and maintained by a single developer (Marceus), and may have bugs — surfaced on the first-launch disclaimer ("Independent & Early-Stage" bullet), on the paywall just before the subscribe button, and as a clause in the EULA.
**Why:** After a stretch of real outages (the WAF breakage, lost history on reinstall), the priority became setting honest expectations *before* anyone pays. Subscribers should know service may be disrupted despite paying. Trust over polish.
**Implication:** New monetization or onboarding surfaces should preserve this transparency, not bury it. The framing is deliberate, not a placeholder.

---

### Image Quality — Moving toward highest-possible-quality images (S3 direction)
**Date:** June 2026
**Shift:** The user's stated north star is that the AI grades the *highest possible quality* image the user's phone can capture — the raw photo is "the most optimal quality of their card." This drove a decision to pursue AWS S3 presigned-URL uploads so full images bypass the Replit proxy entirely, with the original stored for history (replacing the current 400px thumbnail backup).
**Why:** The user values grading on the best available data and showing full-quality images in history, even though Claude internally downsamples (~1000–1100px) and the practical accuracy gain above ~2048px is negligible. The motivation is partly principle (best input) and partly future-proofing (archival originals, potential future ML training data).
**Status:** Agreed direction, **not yet built**. Blocked on the user creating an S3 bucket + IAM user and adding `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets. Cost is negligible at this scale (cents to a few dollars/month).
**Implication:** When this lands it changes the core grading submission path, server grading endpoints, and history image source. Expect it to require a fresh build on both platforms.

---

### Architecture Philosophy — Tension between "thin client" and the proxy limit
**Date:** June 2026
**Shift:** The user instinctively wanted to move on-device processing (crop, tilt, enhance) to the server so the phone "just sends photos" — fewer device-specific bugs, server-side improvements without app updates. This is sound, but repeatedly collides with the ~10MB proxy limit that forces on-device shrinking before upload.
**Why it matters:** The current split (device resizes/crops, server grades) is not an accident — it is the equilibrium the proxy limit forces. The long-term resolution is to bypass the proxy (S3), which is what unblocks moving processing server-side.
**Implication:** Do not treat client-side image processing as legacy cruft to remove; it exists because of a hard infrastructure constraint. It can only move server-side once transport bypasses the proxy.

---

### Distribution — Android beta push and the tester backdoor
**Date:** June 2026
**Shift:** Grade.IQ reached Android via Play Store internal testing, needing 12 opted-in testers before Google would allow wider publishing. The team leaned on an informal email campaign to friends/testers. A deliberate backdoor exists for testers: tap the Settings header 5× and enter the admin password to unlock full (unrestricted) access.
**Why:** Getting to the 12-tester threshold was the immediate gate to publishing. The backdoor lets testers bypass free-tier limits without paying, so they can exercise the whole app.
**Implication:** The 5-tap + `ADMIN_PASSWORD` admin unlock is intentional and tester-facing. The admin password is held as the `ADMIN_PASSWORD` secret — admin mode only works if that secret matches what testers are told to type. Keep this in mind before changing or removing the admin gate.

---

### Compliance — App Store subscription requirements surfaced late
**Date:** June 2026
**Shift:** Apple rejected a submission for not exposing a Terms of Use / EULA link from the store listing (required for auto-renewable subscriptions). A custom EULA was written and added to App Store Connect → App Information → License Agreement.
**Why:** Subscriptions bring platform compliance obligations that are easy to miss when focused on features. The custom EULA (vs Apple's standard one) keeps terms consistent with the app's own `/terms` screen.
**Implication:** Subscription/paywall changes can have store-side metadata consequences, not just code. Treat compliance metadata (EULA, privacy, auto-renew disclosure) as part of the release checklist.
