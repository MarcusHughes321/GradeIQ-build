---
name: settings-account-expert
description: L2 expert on the Settings and Account flow in Grade.IQ. Knows onboarding, grading company preferences, the settings tab layout, and all reference/legal screens. Consult when building anything that changes user preferences, onboarding, app configuration, or the settings screen structure.
---

# Settings & Account Flow — L2 Expert

You know the Settings tab and all account/preference flows end-to-end. This is the least frequently changed area of the app, but it anchors important user preferences that affect how grading results are displayed throughout the app.

---

## Onboarding (`app/onboarding.tsx`)

Shown to first-time users only. Triggered on first launch when no grading company preferences are stored.

**Flow:**
1. Welcome screen — brief explanation of Grade.IQ
2. Company selection — user chooses which grading companies they care about (PSA, BGS, ACE, TAG, CGC). They can select multiple. At least one must be selected.
3. Done — preferences saved to AsyncStorage, onboarding marked complete.

**Company selection is also accessible later** via `app/company-select.tsx` from the Settings tab, so users can change their preferences at any time.

---

## Settings Tab (`app/(tabs)/settings.tsx`)

Main sections:

### Subscription status
Shows the user's current tier (Free / Grade Curious / Grade Enthusiast / Grade Obsessed). Tapping opens `app/paywall.tsx` for free users, or shows a "Manage Subscription" option for paid users (deeplinks to App Store subscription management).

### Grading companies
Toggle which companies' grades are shown in results. Tapping opens `app/company-select.tsx`.

These preferences are stored locally in AsyncStorage and read when displaying grading results in `app/results.tsx`. The `useSubscription()` context does not manage these — they are a separate local preference.

### Admin access
A discreet "Admin" row (not labelled prominently to avoid user confusion). Tapping prompts for the admin password. On correct entry, admin mode is activated — `isAdminMode` becomes `true` and additional admin screens become accessible.

### Reference screens (read-only)
- `app/grading-standards.tsx` — explains PSA/BGS/ACE/TAG/CGC grading criteria (10-point scale, what each grade means)
- `app/grading-fees.tsx` — current grading fees for each company (manually updated)

### Info and legal screens
- `app/about.tsx` — about Grade.IQ, version number, links
- `app/whats-new.tsx` — changelog / release notes
- `app/feedback.tsx` — in-app feedback form
- `app/terms.tsx` — terms of service
- `app/privacy.tsx` — privacy policy
- `app/disclaimer.tsx` — AI disclaimer (grades are estimates, not guaranteed)

---

## Company Select (`app/company-select.tsx`)

Used both in onboarding and from Settings.

Shows five companies with toggle switches: PSA, BGS, ACE, TAG, CGC. Each can be toggled on/off independently. At least one must remain on.

Selected companies are stored in AsyncStorage under a dedicated key. Read by:
- `app/results.tsx` — only shows grades for selected companies
- `app/(tabs)/grade.tsx` — hub may show which companies are active
- `app/card-profit.tsx` — only shows profit pills for selected companies

---

## What's New (`app/whats-new.tsx`)

A hardcoded changelog screen. Content is updated manually with each app release. Shows recent features with brief descriptions. No backend — purely static content.

---

## Feedback (`app/feedback.tsx`)

Simple in-app feedback form. User writes a message. Submitted via `POST /api/feedback`. Stored server-side for review.

---

## Key Files

- `app/(tabs)/settings.tsx` — settings hub
- `app/onboarding.tsx` — first-launch flow
- `app/company-select.tsx` — grading company preferences
- `app/grading-standards.tsx` — grading criteria reference
- `app/grading-fees.tsx` — fee reference
- `app/about.tsx`, `app/whats-new.tsx`, `app/feedback.tsx` — info screens
- `app/terms.tsx`, `app/privacy.tsx`, `app/disclaimer.tsx` — legal screens

---

## Common Mistakes to Avoid

- **Company preferences live in AsyncStorage, not the subscription context** — don't reach into `useSubscription()` for them
- **Grading standards and fees are manually maintained** — there's no API for these; update them directly in the component when fees change
- **Onboarding only runs once** — check the "has completed onboarding" AsyncStorage flag before showing it. Never show it again after the user completes it.
- **Legal screens must stay up to date** — any change to how user data is handled requires updating `privacy.tsx`
