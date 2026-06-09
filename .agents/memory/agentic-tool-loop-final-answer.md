---
name: Agentic tool-loop must force a final answer
description: Bounded Anthropic tool-use loops must drop tools on the last turn to force text; a cap that returns a canned fallback when exhausted produces useless replies.
---

# Agentic tool-use loops must force a final answer

Any server-side agentic loop that lets Claude call tools across multiple turns
(e.g. the TCG Advisor `/api/pokemon-chat` loop in `server/routes.ts`) must, on its
final allowed turn, call `anthropic.messages.create` **without** the `tools` field
so the model is forced to emit text instead of requesting yet another tool call.

**Why:** the loop was capped at a fixed turn count and, when exhausted, returned a
canned "I'm having trouble right now" fallback. Whenever the model needed more tool
turns than the cap (very common on follow-up questions, where the added history makes
it re-search and price several cards), the user got the useless fallback even though
nothing actually errored. This read as "the advisor breaks on the second message."

**How to apply:** structure the loop as `for (turn = 0; turn < MAX; turn++)` with
`allowTools = turn < MAX - 1`, and spread `...(allowTools ? { tools } : {})` into the
create call. Dropping tools on the last turn is safe even when message history
contains tool_use/tool_result pairs — Anthropic only rejects a *dangling* tool_use
with no matching tool_result, and the loop always pushes the tool_result (user) turn
before the next create call. Keep a small MAX (≈5) to bound per-request Claude calls
and cost; leave the old fallback return as an unreachable safety net.
