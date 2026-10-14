export interface Config {
  databaseUrl: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  workspaceId?: string;
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
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
