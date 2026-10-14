# Ellis

Server for Ellis, an AI companion that remembers what you tell it. This repository is the first slice of the real application, built from the Ellis handover document (kept outside the repo; §8 steps 1–2): auth, schema, migrations, audit, and the conversation loop with validated memory extraction.

See [`docs/ASSESSMENT.md`](docs/ASSESSMENT.md) for what exists, what is missing, and what to build next.

## Stack

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node 22, TypeScript (ESM), run with `tsx` | Same language as the prototype and the future web client; no build step yet |
| HTTP | Fastify 5 | Small, fast, good streaming support |
| Database | PostgreSQL 16+ via `pg` | Source of truth (handover §2.1) |
| Tests | Vitest + PGlite (Postgres compiled to WASM, in process) | Real Postgres SQL with no server to install; no live model calls |
| Model | Anthropic API, `claude-opus-5-5`, behind a provider interface | Swappable (`src/provider/types.ts`) |

## Setup

```bash
npm install
cp .env.example .env            # then fill in the values
export $(grep -v '^#' .env | xargs)

npm run migrate                 # applies migrations/*.sql
npm run user:create -- you@example.com Asia/Dubai
#   prints a bearer token ONCE; only its hash is stored
npm run dev                     # http://127.0.0.1:3000
```

Open http://127.0.0.1:3000 and paste the token to sign in. The first visit asks you to choose a companion: a **sleek** fox-like creature, a glowing **spirit**, or a **toy** figure, with a name, a colour and a glow. Your companion is the main screen: it listens while you type, thinks, speaks its reply in a bubble, and celebrates when something is saved (with tags showing what). The panels hold what Ellis remembers, the conversation so far, and the companion editor.

**Growth and evolution.** Each family has three stages. A companion earns growth only from real use: 2 per kept memory, 3 per finished task, 3 per decision, 5 per day you talk (`src/growth.ts`; thresholds 60 and 240). When it has enough, a banner offers the evolution; nothing changes until you accept. "Keep this form" holds it in place. To add a new family, add a module to `public/creatures/` (see `sleek.js`) and list it in `public/creatures/index.js`.

To run it in a container (any host that runs Docker, such as Render, Railway or Fly.io):

```bash
docker build -t ellis .
docker run -p 3000:3000 -e DATABASE_URL=... -e ANTHROPIC_API_KEY=... ellis
```

### Railway

`railway.json` builds the Dockerfile and health-checks `/health`. In one Railway project:

1. Add a **PostgreSQL** database.
2. Add a service from this GitHub repo.
3. On that service, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`, then set `ANTHROPIC_API_KEY`, `ELLIS_BOOTSTRAP_EMAIL` (your email) and `ELLIS_BOOTSTRAP_TIMEZONE` (for example `Asia/Dubai`).
4. Generate a public domain under the service's Networking settings.

The first deploy creates your account and prints its access token once in the deploy log. Open the domain and paste that token in.

Quick check from the command line:

```bash
TOKEN=ellis_...
curl -s localhost:3000/v1/me -H "authorization: Bearer $TOKEN"

# JSON reply
curl -s localhost:3000/v1/chat -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"message":"I have the dentist Monday at 3:30"}'

# Streaming reply (Server-Sent Events: start, delta…, receipts, done | error)
curl -sN localhost:3000/v1/chat -H "authorization: Bearer $TOKEN" -H 'accept: text/event-stream' \
  -H 'content-type: application/json' -d '{"message":"Actually it moved to Tuesday"}'
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `ELLIS_PROVIDER` | no | `anthropic` (or `gemini` if only a Gemini key is set) | Which model answers: `anthropic` or `gemini` |
| `GEMINI_API_KEY` | for Gemini | — | Google AI Studio key |
| `GEMINI_MODEL` | no | `gemini-flash-latest` | Gemini model id |
| `ANTHROPIC_API_KEY` | for Claude | — | Model access. The SDK also accepts `ANTHROPIC_AUTH_TOKEN` or an `ant auth login` profile |
| `ANTHROPIC_WORKSPACE_ID` | only for keys not scoped to a workspace | — | The workspace to bill (`wrkspc_…`) |
| `ELLIS_DEV_TOOLS` | no | off | `1` shows "Evolve now" and "Reset to stage 1" in the companion panel, to preview designs. Turn off before others use the app |
| `ELLIS_MODEL` | no | `claude-opus-5-5` | Model id |
| `ELLIS_EFFORT` | no | `low` | `low` / `medium` / `high` / `xhigh` / `max`. Low fits short spoken replies |
| `PORT`, `HOST` | no | `3000`, `127.0.0.1` | Listen address |
| `LOG_LEVEL` | no | `info` | Pino level; `authorization` headers are redacted |

## Tests

```bash
npm run typecheck
npm test            # 78 tests, ~35 s, no network, no API key
npm run test:live   # one real model call (§9 smoke test); needs ANTHROPIC_API_KEY
```

| File | Covers (handover §9) |
|---|---|
| `test/auth.test.ts` | 401 on every protected route (missing, bad and revoked tokens); user A's data is invisible to user B on every route and in B's prompt; deleting a user cascades |
| `test/extraction.test.ts` | Unknown kind → fact; undated event → task; `certain:false` → candidate + inferred; duplicates dropped; 10 000-char text clamped and noted; `replaces` by id and by substring; `done`/`forget` matching; malformed payload rejected |
| `test/retrieval.test.ts` | A 60-day-old keyword match outranks a fresh unrelated record; an event due tomorrow always appears; superseded/deleted never appear; window capped at 28 |
| `test/conversation.test.ts` | Full HTTP slice with a stubbed model: turns persisted, provenance on records, receipts, supersede/done/forget, malformed or truncated extraction writes nothing but the reply still arrives, refusal, provider outage, 45-minute conversation split, 12-turn context cap, SSE event order, optimistic concurrency, DB-level dedupe |
| `test/live/smoke.test.ts` | The handover's smoke test (names replaced with fictional ones) against the real model (recap half pending step 5) |

## API (v1)

All `/v1` routes require `Authorization: Bearer <token>`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/` | Web client (public; signs in with your token) |
| `GET` | `/health` | Public |
| `GET` | `/v1/me` | User, companions, areas |
| `PATCH` | `/v1/companions/:id` | `{name?, appearance?, keep_form?}`; appearance is `{family, palette, accent}` |
| `POST` | `/v1/companions/:id/evolve` | Advance one stage when ready; 409 otherwise |
| `DELETE` | `/v1/me` | Deletes the user and everything they own |
| `POST` | `/v1/chat` | `{message, companion_id?, source?}`. JSON by default; SSE with `Accept: text/event-stream` |
| `GET` | `/v1/records?status=&kind=` | Defaults to everything except `deleted` |
| `GET` | `/v1/records/:id` | |
| `GET` | `/v1/conversations` | Latest 50 |
| `GET` | `/v1/conversations/:id/turns` | |

## How a message is handled

```
POST /v1/chat
  → companion (primary unless companion_id) → open conversation, or a new one after 45 min idle
  → persist user turn
  → load last 12 turns + top 28 live records (src/retrieval/score.ts)
  → ONE streamed model call; the reply streams to the client
       the model may call the strict tool save_to_memory once (src/extraction/contract.ts)
  → persist assistant turn
  → validate tool input (src/extraction/plan.ts) → write in one transaction (src/extraction/apply.ts)
  → receipts to the client; every change in audit_log
```

The model never touches the database. It proposes records through a tool call, and server code validates them and writes them.

## External services and costs

- **PostgreSQL**: any managed Postgres 16+ works (Neon, Supabase, RDS, Cloud SQL). One small instance is plenty at this stage.
- **Anthropic API**: `claude-opus-5-5` costs $4 per million input tokens and $20 per million output tokens. A typical turn sends about 3k input tokens (instructions, 28 records, 12 turns) and gets back about 0.5k output tokens (thinking at low effort, a short reply and the tool call). That works out to roughly **$0.02 per message**, or about $30 a month at 50 messages a day. These are estimates; check `usage` in real logs. Setting `ELLIS_MODEL=claude-sonnet-5-5` roughly halves the cost, if its quality holds up on your conversations.
- **Refusal fallback**: requests opt into server-side fallback (`fallbacks: "default"`). If the primary model declines on safety grounds, the API reruns the turn on another model, billed at that model's rates.

## Known limitations

See `docs/ASSESSMENT.md` §4.
