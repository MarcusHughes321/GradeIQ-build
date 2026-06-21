---
name: Android quota race condition
description: Multiple overlapping pollJobStatus calls (from AppState restarts) each fire recordUsage, burning the quota in one grade session.
---

## Rule
Always null `recordUsageRef.current` before calling it inside `pollJobStatus`.

## Why
On Android, backgrounding/foregrounding the app fires AppState "active", which calls `startPollingForJob`. This creates new poll ticks. Any in-flight HTTP requests from previous ticks are still running. All ticks that complete simultaneously see "completed" and each calls `recordUsageRef.current(1)`, incrementing the usage count multiple times for a single grade. With a free limit of 3, this blocks users after 1 grade.

## How to apply
```js
if (recordUsageRef.current) {
  const fn = recordUsageRef.current;
  recordUsageRef.current = null;  // claim first — prevents any other tick
  try { await fn(1); } catch {}
}
```
The null-before-call pattern ensures only the first completion tick records usage.
