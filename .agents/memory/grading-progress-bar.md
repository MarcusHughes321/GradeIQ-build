---
name: Grading waiting-screen progress
description: How the grade waiting bar is driven and why the AI step must creep continuously
---

The grading waiting screen is driven by REAL server progress, not a fake timer.
The server marks each job with a stage (received → preparing → analyzing →
finalizing) and the client polls it; the bar maps stage → percentage.

**Rule:** during the `analyzing` stage (the single Claude call) the bar must
creep *continuously* — close a fraction of the remaining gap to a sub-1.0 cap on
a repeating interval — NOT a one-shot timed animation to a fixed value.

**Why:** the Claude call is one opaque block of unknown length (15s–2min under
load). A one-shot `Animated.timing` to e.g. 0.9 over 35s visibly freezes once it
arrives if the AI is still running, which is exactly the "honest, never-freezes"
behaviour we promised the user.

**How to apply:** keep a `progressTargetRef` so the bar never rewinds when an
out-of-order poll reports an earlier stage. The bar should only hit ~1.0 when the
real `completed` result arrives, never before. Same continuous creep is the
fallback when no `progress` field is present (older server / DB-restored job).
