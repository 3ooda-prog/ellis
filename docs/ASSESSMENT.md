# Assessment against the handover

This document answers the handover's §10, points 1–3 and 5. Point 4 is the code in this repository. The product brief (`ELLIS — AI COMPANION & PERSONAL AI WORLD, v0.1`) was **not available** when this was written; everything here is measured against the handover only. Check it against the brief before acting on it.

## 1. Starting state

The repository was empty. The prototype (single HTML file) is not in it, and its user data is not in it either. That is deliberate: per §10, personal data gets imported, never committed.

## 2. Exists vs. missing

| Area (handover) | Status | Where |
|---|---|---|
| §8.1 Auth | **Done (minimal)**. Hashed bearer tokens, revocation, expiry, a CLI to issue them | `src/users.ts`, `scripts/create-user.ts` |
| §8.1 Schema + migrations | **Done**. All §3 tables plus `auth_tokens`, `users.timezone`, `records.version/updated_at`, check constraints, a partial unique index for live-text dedupe | `migrations/001_init.sql`, `src/db/migrate.ts` |
| §8.1 Audit | **Done** for record changes, extraction problems and provider errors | `src/audit.ts` |
| §8.2 Conversation slice | **Done**. One call per message, streamed, tool-based extraction, validated, transactional, receipts | `src/conversation/service.ts`, `src/extraction/*` |
| §8.3 Retrieval | **Done (baseline)**. The §5 scorer, plus pinning of events due within 48 h (see deviations) | `src/retrieval/score.ts` |
| §8.4 Record management UI | Missing. Read-only list/get routes exist; no confirm/correct/done/delete/export routes yet | — |
| §8.5 Recaps | Missing. `recaps` table exists | — |
| §8.6 Reminders | Missing. `reminders` table exists; no job runner | — |
| §8.7 Voice | Missing. `turns.source = 'voice'` is accepted | — |
| §8.8 Gmail | Missing | — |
| §8.9 World view, multiple companions, agents | Deferred, per the brief. The schema supports multiple companions and `/v1/chat` takes `companion_id`, but there is no route to create one | — |
| Prototype importer (§3) | Missing | — |
| Web client | Missing; API only | — |

## 3. Deviations from the handover (and why)

1. **Extraction travels as a strict tool call, not `|||` + JSON.** §4 recommends this change on day one. The JSON shape is unchanged. The server still re-validates everything, because strict mode only guarantees the shape: an input can match the schema and still be a duplicate, an undated "event", or a truncated payload.
2. **`done` and `forget` accept a record id as well as words.** The model already sees ids, and an id cannot hit the wrong record by substring. Substring matching remains the fallback, with a 3-character minimum and newest-first tie-breaking.
3. **Events due within 48 hours are always included in retrieval.** With only the §5 weights, an event due tomorrow scores about 4–5 points while every brand-new task scores 5. On a busy day, that event gets pushed out of the top 28, which breaks the §9 requirement that "an event due tomorrow always appears". The test caught this.
4. **Timezones.** `users.timezone` lets "Monday at 3:30" resolve to the user's 3:30, not the server's. A date with no time still gets 09:00 local.
5. **Dedupe is also enforced by the database**, through a partial unique index on `(user_id, lower(text))` over live records, so two concurrent tabs cannot both insert the same memory. Status changes check `version`, so a stale plan skips the change rather than overwriting it.
6. **Context is the current conversation's last 12 turns**, not turns across conversations. After a 45-minute gap the model starts fresh and relies on saved records. Revisit if that feels forgetful in use.

## 4. Remaining limitations

- **Never called the real model from here.** No API key was available in the build environment. The Anthropic adapter typechecks against the installed SDK (`@anthropic-ai/sdk` 0.133), and a request with a dummy key reached the API and came back 401. But a 401 is decided before the request body is validated, so the exact request shape is still unproven. **Run `npm run test:live` before relying on it.**
- **Verified against a real PostgreSQL 16** (migrations twice, user creation, every route, SSE) through the production `pg` adapter. The automated suite runs on PGlite.
- Auth is token-only: no login flow, OAuth or password reset. Fine for one user; replace before inviting anyone.
- No rate limiting, no per-user cost cap.
- A race between two requests can create two conversations at once; harmless but untidy.
- `loadLive` reads every live record per message. Fine into the low thousands, then move scoring into SQL or switch to embeddings.
- Thinking blocks are not replayed between turns (only text turns are stored). That is valid API usage, but the model loses its earlier reasoning between turns.
- No prompt caching: the system prompt changes every request (retrieved records, Now). Worth restructuring once volume makes it matter.
- `extraction.notes` audit entries contain record wording (they quote dropped items); `extraction.error` entries deliberately do not include the raw payload.

## 5. Recommended next step

**§8 step 4, record management**, because recaps (step 5) are only trustworthy if the user can confirm candidates and fix mistakes. It touches:

| File | Change |
|---|---|
| `src/server.ts` (or split into `src/routes/records.ts`) | `POST /v1/records/:id/confirm` (candidate → active), `PATCH /v1/records/:id` (text/when/area; a correction writes a new record that supersedes the old one), `POST /v1/records/:id/done`, `DELETE /v1/records/:id` (status `deleted`), `DELETE /v1/records/:id?hard=true` (user hard-delete), `GET /v1/export` (JSON of everything the user owns) |
| `src/records.ts` | Shared, version-checked state transitions (reuse `closeRecord` from `src/extraction/apply.ts`); every route takes `If-Match: <version>` and returns 409 on mismatch |
| `migrations/002_*.sql` | Probably none. Maybe `records.confirmed_at` if the brief wants it |
| `test/records.test.ts` | Each transition, 409 on stale version, isolation for every new route, export completeness |
| `scripts/import-prototype.ts` | One-off importer for `data/users/<id>/state` JSON (§3), with the raw file kept as a backup outside the repo |

After that comes step 5 (recaps), with the grounding tests from §9 that diff proper nouns against the corpus.
