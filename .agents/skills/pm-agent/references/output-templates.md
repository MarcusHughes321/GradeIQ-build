# PM Agent Output Templates

---

## Feature Mode Output

Produce both parts in sequence. Label them clearly so the user knows what each one is.

---

### Part 1 — Feature Brief (for the user to read and approve)

```
## Feature Brief: [Feature Name]

**What it is**
[2-3 sentences describing the feature in plain language — what it does, who uses it, why it matters.]

**How it works**
[Step-by-step flow from the user's perspective. No code. Written as "The user taps X, then sees Y, then Z happens."]

**Where it lives**
[Tab, navigation path, and whether it's a new screen, modal, or addition to an existing screen.]

**Who can use it**
[All users / Pro subscribers only / Admin only. Note any gating logic.]

**What it looks like**
[Visual description — layout, key UI elements, how it fits the Grade.IQ dark theme. Reference any specific components if the user mentioned them.]

**Data and backend**
[What data it needs, whether new DB tables or routes are required, any external APIs involved. Keep this plain — no schema details.]

**Edge cases covered**
[List the main error states and empty states that need handling.]

**Out of scope**
[Anything explicitly not included in this version.]

**Assumptions I made**
[List any gaps the interview didn't fully answer and what you assumed. Be explicit — the user should correct these before building.]

**Done looks like**
[Bullet list of observable outcomes. How will the user know this is complete and working?]
```

---

### Part 2 — Implementation Prompt (for the build agent)

```
## Implementation Prompt: [Feature Name]

### App context
Grade.IQ is a Pokémon card grading app built with Expo React Native (frontend) and Express.js / TypeScript (backend), backed by PostgreSQL. It uses Anthropic Claude Sonnet 4-6 for AI analysis, RevenueCat for subscriptions (tiers: Free / Grade Curious £2.99 / Grade Enthusiast £5.99 / Grade Obsessed £9.99), and Replit Object Storage for image backup. The UI is dark-themed: black (#000000), surface (#111111), primary red (#FF3C31), white text. Navigation uses Expo Router with a bottom tab bar (Home, Grade, Values, Settings).

Subscription gating pattern: `const { isSubscribed, isGateEnabled, isAdminMode } = useSubscription()` — gate with `isGateEnabled && !isSubscribed && !isAdminMode`.

### Feature to build
**Name:** [Feature Name]
**Location:** [Tab → Screen path]
**Access:** [All users / Pro only]

### User flow
[Numbered steps describing exactly what the user does and sees. Include every screen transition.]

### UI specification
[Describe layout, components, colours, and behaviour. Be specific enough that no design decisions are left to the builder.]

### Backend requirements
[New routes needed, DB changes, external API calls. State the method and path for each new endpoint.]

### Data shape
[Describe the request/response shape for any new endpoints. Plain English is fine — no need for TypeScript types here.]

### Edge cases to handle
[List each error state, empty state, and edge case with the expected behaviour.]

### Acceptance criteria
[Bullet list. Each item should be testable and observable — no vague criteria.]

### Known constraints
[Anything the builder must not change or must work around. E.g. "do not modify the existing RevenueCat subscription flow", "follow the existing hub card pattern in grade.tsx".]

### Assumptions
[Restate any assumptions made during the interview. The builder should flag if any assumption is wrong before proceeding.]
```

---

## Methodology Mode Output — Agent Brief

```
## Agent Brief: [Agent Name]

**Purpose**
[1-2 sentences: what area of the app this agent covers and what it's for.]

**What it knows deeply**
[Bullet list of the 3-5 most important things this agent must understand. Be specific — not "the backend" but "the grading_history table schema and sync logic".]

**Example questions it should answer confidently**
1. [Question]
2. [Question]
3. [Question]

**What it produces**
[Description of the agent's output — implementation guidance, a spec, a list of constraints, etc. — and whether it hands off to the build agent or produces something the user reviews first.]

**Core files and areas**
[List of the most important files, routes, or components the agent must know. These become the foundation of the agent's system prompt / skill file.]

**Tricky parts to document**
[Any patterns, gotchas, or common mistakes in this area that the agent must know to give trustworthy advice.]

**Suggested skill file location**
`.agents/skills/[agent-name]/SKILL.md`

**Next step**
To build this agent: switch to Build mode and ask the main agent to create the skill file based on this brief.
```
