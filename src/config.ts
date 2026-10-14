export interface Config {
  databaseUrl: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  workspaceId?: string;
  devTools: boolean;
  provider: "anthropic" | "gemini";
  geminiApiKey?: string;
  geminiModel: string;
  port: number;
  host: string;
  logLevel: string;
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export function loadConfig(env = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required (see .env.example)");
  const effort = (env.ELLIS_EFFORT ?? "low") as Config["effort"];
  if (!EFFORTS.includes(effort)) throw new Error(`ELLIS_EFFORT must be one of ${EFFORTS.join(", ")}`);
  return {
    databaseUrl,
    model: env.ELLIS_MODEL ?? "claude-opus-5-5",
    effort,
    workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
    devTools: env.ELLIS_DEV_TOOLS === "1",
    provider: pickProvider(env),
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL || "gemini-flash-latest",
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}

/** ELLIS_PROVIDER wins; otherwise Gemini if only a Gemini key is set. */
function pickProvider(env: NodeJS.ProcessEnv): Config["provider"] {
  const p = env.ELLIS_PROVIDER?.toLowerCase();
  if (p === "anthropic" || p === "gemini") return p;
  if (p) throw new Error("ELLIS_PROVIDER must be anthropic or gemini");
  return env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY ? "gemini" : "anthropic";
}
