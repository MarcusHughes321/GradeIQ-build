---
name: Always-mounted tab query staleness
description: Why React Query data on a permanently-mounted tab (e.g. Home) silently never refreshes mid-session, and how to fix it.
---

# Always-mounted tab queries go stale for the whole session

A `useQuery` living on a screen that stays mounted (any tab in the bottom tab bar, e.g. Home `app/(tabs)/index.tsx`) will **not** refetch on its own just because data changed on the server. With only `staleTime` set and no `refetchInterval`, the query fetches once on first mount and then never again while the app is open — because the component never unmounts/remounts, so `refetchOnMount` never re-fires and there is no trigger.

Symptom seen: admin saved a Home banner (`/api/bulletin` returned `enabled:true`) but users with the app already open never saw it appear.

**Why:** tab screens are kept mounted by the navigator for instant switching, so the usual "refetch on remount" lifecycle that transient/stack screens rely on does not happen here.

**How to apply:** for any data on an always-mounted tab that can change server-side during a session, set `refetchInterval` (e.g. 60s) plus `refetchOnMount: "always"`, keep `staleTime` short (e.g. 30s), and also call the query's `refetch()` from the screen's pull-to-refresh handler. After an in-app mutation that changes the same data, `invalidateQueries` the public read key too so the editing device updates immediately instead of waiting for the poll.
