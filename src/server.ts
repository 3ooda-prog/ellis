import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { isValidAppearance } from "../public/creatures/index.js";
import { audit } from "./audit.js";
import { companionGrowth } from "./growth.js";
import { handleMessage, NotFoundError, type ChatEvent } from "./conversation/service.js";
import type { Db } from "./db/index.js";
import type { ChatProvider } from "./provider/types.js";
import { getRecord, listRecords } from "./records.js";
import { userForToken, type User } from "./users.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

export interface AppDeps {
  db: Db;
  provider: ChatProvider;
  clock?: () => Date;
  logLevel?: string;
  /** ELLIS_DEV_TOOLS: allows setting a companion's stage directly, to preview designs. */
  devTools?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID);

const ChatBody = z.object({
  message: z.string().trim().min(1).max(8000),
  companion_id: uuid.optional(),
  source: z.enum(["text", "voice"]).optional(),
});

const CompanionPatch = z
  .object({
    name: z.string().trim().min(1).max(24).optional(),
    appearance: z.unknown().refine(isValidAppearance, "unknown appearance option").optional(),
    keep_form: z.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.appearance !== undefined || b.keep_form !== undefined, "nothing to update");

const RecordQuery = z.object({
  status: z.enum(["active", "candidate", "superseded", "done", "deleted"]).optional(),
  kind: z.enum(["fact", "task", "event", "decision"]).optional(),
});

// The web client: three static files, read once at startup.
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  "/voice.js": { file: "voice.js", type: "text/javascript; charset=utf-8" },
  "/creatures/index.js": { file: "creatures/index.js", type: "text/javascript; charset=utf-8" },
  "/creatures/sleek.js": { file: "creatures/sleek.js", type: "text/javascript; charset=utf-8" },
  "/creatures/spirit.js": { file: "creatures/spirit.js", type: "text/javascript; charset=utf-8" },
  "/creatures/toy.js": { file: "creatures/toy.js", type: "text/javascript; charset=utf-8" },
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  const m = h && /^Bearer\s+(\S+)$/i.exec(h);
  return m?.[1] ?? null;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const { db } = deps;
  const app = Fastify({
    logger: deps.logLevel === "silent" ? false : { level: deps.logLevel ?? "info", redact: ["req.headers.authorization"] },
  });

  app.get("/health", async () => ({ ok: true }));

  for (const [route, { file, type }] of Object.entries(STATIC_FILES)) {
    const body = readFileSync(path.join(PUBLIC_DIR, file));
    app.get(route, async (_req, reply) =>
      reply
        .type(type)
        .header("content-security-policy", CSP)
        .header("x-content-type-options", "nosniff")
        .header("referrer-policy", "no-referrer")
        .header("cache-control", "no-cache")
        .send(body),
    );
  }

  // Everything under /v1 is per-user and requires a bearer token.
  app.register(
    async (v1) => {
      v1.decorateRequest("user", null as unknown as User);
      v1.addHook("onRequest", async (req, reply) => {
        const token = bearer(req);
        const user = token ? await userForToken(db, token) : null;
        if (!user) return reply.code(401).send({ error: "unauthorized" });
        req.user = user;
      });

      v1.get("/me", async (req) => {
        const companions = await db.query(
          `select c.id, c.name, c.role, c.is_primary, c.appearance, c.stage, c.keep_form, a.key as area_key
             from companions c left join areas a on a.id = c.area_id
            where c.user_id = $1 order by c.is_primary desc, c.created_at`,
          [req.user.id],
        );
        const areas = await db.query("select key, name, status from areas where user_id = $1 order by key", [req.user.id]);
        const withGrowth = await Promise.all(
          companions.rows.map(async (c) => ({ ...c, growth: await companionGrowth(db, req.user.id, c.id as string) })),
        );
        return { user: req.user, companions: withGrowth, areas: areas.rows, dev_tools: !!deps.devTools };
      });

      v1.patch<{ Params: { id: string } }>("/companions/:id", async (req, reply) => {
        if (!UUID.test(req.params.id)) return reply.code(404).send({ error: "not found" });
        const body = CompanionPatch.safeParse(req.body);
        if (!body.success) return reply.code(400).send({ error: "invalid body", issues: body.error.issues });
        const { rows } = await db.query(
          `update companions
              set name = coalesce($3, name),
                  appearance = coalesce($4::jsonb, appearance),
                  keep_form = coalesce($5, keep_form)
            where id = $1 and user_id = $2
            returning id, name, role, is_primary, appearance, stage, keep_form`,
          [
            req.params.id,
            req.user.id,
            body.data.name ?? null,
            body.data.appearance === undefined ? null : JSON.stringify(body.data.appearance),
            body.data.keep_form ?? null,
          ],
        );
        if (!rows[0]) return reply.code(404).send({ error: "not found" });
        return { companion: rows[0], growth: await companionGrowth(db, req.user.id, req.params.id) };
      });

      // Evolve to the next stage. Only when enough growth has been earned and
      // the user has not chosen to keep the current form.
      v1.post<{ Params: { id: string } }>("/companions/:id/evolve", async (req, reply) => {
        if (!UUID.test(req.params.id)) return reply.code(404).send({ error: "not found" });
        const growth = await companionGrowth(db, req.user.id, req.params.id);
        if (!growth) return reply.code(404).send({ error: "not found" });
        if (!growth.ready) return reply.code(409).send({ error: "not ready to evolve", growth });
        const { rows } = await db.query(
          `update companions set stage = stage + 1, evolved_at = now()
            where id = $1 and user_id = $2 and stage = $3
            returning id, name, role, is_primary, appearance, stage, keep_form`,
          [req.params.id, req.user.id, growth.stage],
        );
        // A concurrent evolve already moved it on.
        if (!rows[0]) return reply.code(409).send({ error: "already evolved", growth });
        await audit(db, req.user.id, "companion.evolve", req.params.id, { from: growth.stage, to: growth.stage + 1 });
        return { companion: rows[0], growth: await companionGrowth(db, req.user.id, req.params.id) };
      });

      // Development only: jump to any stage without earning growth.
      if (deps.devTools) {
        const DevStage = z.object({ stage: z.union([z.literal(1), z.literal(2), z.literal(3)]) });
        v1.post<{ Params: { id: string } }>("/dev/companions/:id/stage", async (req, reply) => {
          if (!UUID.test(req.params.id)) return reply.code(404).send({ error: "not found" });
          const body = DevStage.safeParse(req.body);
          if (!body.success) return reply.code(400).send({ error: "stage must be 1, 2 or 3" });
          const { rows } = await db.query(
            `update companions set stage = $3, evolved_at = now()
              where id = $1 and user_id = $2
              returning id, name, role, is_primary, appearance, stage, keep_form`,
            [req.params.id, req.user.id, body.data.stage],
          );
          if (!rows[0]) return reply.code(404).send({ error: "not found" });
          await audit(db, req.user.id, "companion.dev_stage", req.params.id, { stage: body.data.stage });
          return { companion: rows[0], growth: await companionGrowth(db, req.user.id, req.params.id) };
        });
      }

      v1.delete("/me", async (req, reply) => {
        await db.query("delete from users where id = $1", [req.user.id]);
        return reply.code(204).send();
      });

      v1.get("/records", async (req, reply) => {
        const q = RecordQuery.safeParse(req.query);
        if (!q.success) return reply.code(400).send({ error: "invalid query", issues: q.error.issues });
        return { records: await listRecords(db, req.user.id, q.data) };
      });

      v1.get<{ Params: { id: string } }>("/records/:id", async (req, reply) => {
        const rec = UUID.test(req.params.id) ? await getRecord(db, req.user.id, req.params.id) : null;
        if (!rec) return reply.code(404).send({ error: "not found" });
        return { record: rec };
      });

      v1.get("/conversations", async (req) => {
        const { rows } = await db.query(
          `select id, companion_id, started_at, ended_at from conversations
            where user_id = $1 order by started_at desc limit 50`,
          [req.user.id],
        );
        return { conversations: rows };
      });

      v1.get<{ Params: { id: string } }>("/conversations/:id/turns", async (req, reply) => {
        if (!UUID.test(req.params.id)) return reply.code(404).send({ error: "not found" });
        const owns = await db.query("select 1 from conversations where id = $1 and user_id = $2", [
          req.params.id,
          req.user.id,
        ]);
        if (!owns.rowCount) return reply.code(404).send({ error: "not found" });
        const { rows } = await db.query(
          "select id, role, content, source, created_at from turns where conversation_id = $1 order by created_at, id",
          [req.params.id],
        );
        return { turns: rows };
      });

      // POST /v1/chat streams Server-Sent Events when the client asks for
      // text/event-stream, otherwise returns one JSON body when the turn ends.
      v1.post("/chat", async (req, reply) => {
        const body = ChatBody.safeParse(req.body);
        if (!body.success) return reply.code(400).send({ error: "invalid body", issues: body.error.issues });
        const input = {
          user: req.user,
          message: body.data.message,
          companionId: body.data.companion_id,
          source: body.data.source,
        };
        const chatDeps = { db, provider: deps.provider, log: req.log, clock: deps.clock };
        const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");

        if (!wantsStream) {
          let error: Extract<ChatEvent, { type: "error" }> | null = null;
          try {
            const out = await handleMessage(chatDeps, input, (e) => {
              if (e.type === "error") error = e;
            });
            if (error) return reply.code(502).send({ conversation_id: out.conversationId, ...(error as object) });
            return { conversation_id: out.conversationId, reply: out.reply, receipts: out.receipts };
          } catch (err) {
            if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
            throw err;
          }
        }

        // Check the companion before committing to a 200 stream.
        if (input.companionId) {
          const found = await db.query("select 1 from companions where id = $1 and user_id = $2", [
            input.companionId,
            req.user.id,
          ]);
          if (!found.rowCount) return reply.code(404).send({ error: "companion not found" });
        }
        const abort = new AbortController();
        // Client went away mid-stream: stop paying for tokens nobody will read.
        reply.raw.on("close", () => {
          if (!reply.raw.writableFinished) abort.abort();
        });
        reply.hijack();
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const send = (e: ChatEvent) => {
          if (!reply.raw.writableEnded) reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        };
        try {
          await handleMessage(chatDeps, { ...input, signal: abort.signal }, send);
        } catch (err) {
          req.log.error({ err }, "chat failed");
          send({ type: "error", error: err instanceof NotFoundError ? err.message : "internal error", retryable: false });
        }
        reply.raw.end();
      });
    },
    { prefix: "/v1" },
  );

  return app;
}
