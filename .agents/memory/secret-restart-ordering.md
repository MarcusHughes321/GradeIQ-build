---
name: Secret update / workflow restart ordering
description: Why a workflow restart can silently keep the OLD secret value when rotating/adding a secret.
---

# Restart only AFTER the secret is actually saved

When you rotate or add a secret that a long-running server reads from
`process.env` (e.g. `ADMIN_PASSWORD`), the new value is only injected at process
start. `requestEnvVar` pauses, but the user saving the secret is a *separate*
later event — it arrives as a `secrets have been added` automatic update.

**Why:** If you issue a workflow restart immediately after `requestEnvVar`
(before that confirmation), the process boots with the OLD env and the change
appears to "not take". Symptom: a request with the new value 401s while the old
value still 200s — i.e. the running process is one rotation behind.

**How to apply:** Wait for the `secrets have been added` system message, *then*
restart the workflow, *then* verify with two requests — new value should pass,
old value should now fail. Test the secret in the shell tool (where env vars are
present), never in the code-execution sandbox (no secret access there), and never
echo the value.
