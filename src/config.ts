import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { createLogger } from "./util/logger.js";

const log = createLogger("config");

loadDotenv();

const AppConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  masterKey: z.string().min(1, "MASTER_KEY is required"),
  ownerChatId: z.string().min(1, "OWNER_CHAT_ID is required"),
  dashboardPort: z.coerce.number().default(3000),
  dashboardPassword: z.string().min(1, "DASHBOARD_PASSWORD is required"),
  dashboardAllowedOrigins: z.string().optional(),

  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),

  mainModelProvider: z.enum(["anthropic", "openai", "google"]).default("anthropic"),
  mainModelName: z.string().default("claude-sonnet-4-20250514"),
  llmTimeoutMs: z.coerce.number().default(45_000),
  llmMaxRetries: z.coerce.number().default(1),

  mainBotToken: z.string().min(1, "MAIN_BOT_TOKEN is required"),

  mcpServers: z.string().optional(),

  dbPath: z.string().default("data.db"),
  agentsDir: z.string().default("agents"),
}).superRefine((val, ctx) => {
  if (!val.anthropicApiKey && !val.openaiApiKey && !val.googleApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anthropicApiKey"],
      message: "At least one provider API key must be set (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)",
    });
  }

  if (val.mainModelProvider === "anthropic" && !val.anthropicApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainModelProvider"],
      message: "MAIN_MODEL_PROVIDER=anthropic requires ANTHROPIC_API_KEY",
    });
  }
  if (val.mainModelProvider === "openai" && !val.openaiApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainModelProvider"],
      message: "MAIN_MODEL_PROVIDER=openai requires OPENAI_API_KEY",
    });
  }
  if (val.mainModelProvider === "google" && !val.googleApiKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainModelProvider"],
      message: "MAIN_MODEL_PROVIDER=google requires GOOGLE_API_KEY",
    });
  }
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const raw = {
    nodeEnv: process.env.NODE_ENV,
    masterKey: process.env.MASTER_KEY,
    ownerChatId: process.env.OWNER_CHAT_ID,
    dashboardPort: process.env.DASHBOARD_PORT,
    dashboardPassword: process.env.DASHBOARD_PASSWORD,
    dashboardAllowedOrigins: process.env.DASHBOARD_ALLOWED_ORIGINS,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
    mainModelProvider: process.env.MAIN_MODEL_PROVIDER,
    mainModelName: process.env.MAIN_MODEL_NAME,
    llmTimeoutMs: process.env.LLM_TIMEOUT_MS,
    llmMaxRetries: process.env.LLM_MAX_RETRIES,
    mainBotToken: process.env.MAIN_BOT_TOKEN,
    mcpServers: process.env.MCP_SERVERS,
    dbPath: process.env.DB_PATH,
    agentsDir: process.env.AGENTS_DIR,
  };

  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    log.error(`Configuration errors:\n${issues}`);
    process.exit(1);
  }

  _config = result.data;
  return _config;
}

export interface MCPServerEntry {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  allowAgents?: string[];
  allowTools?: string[];
  envAllowlist?: string[];
}

const MCPServerEntrySchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  allowAgents: z.array(z.string()).optional(),
  allowTools: z.array(z.string()).optional(),
  envAllowlist: z.array(z.string()).optional(),
});

export function parseMCPServers(config: AppConfig): MCPServerEntry[] {
  if (!config.mcpServers) return [];
  try {
    const parsed = JSON.parse(config.mcpServers);
    const result = z.array(MCPServerEntrySchema).safeParse(parsed);
    if (!result.success) {
      log.warn("Invalid MCP_SERVERS schema, skipping");
      return [];
    }
    return result.data;
  } catch (err) {
    log.warn(`Invalid MCP_SERVERS JSON, skipping: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

export function resolveEnvRef(ref: string): string {
  if (ref.startsWith("env:")) {
    const envVar = ref.slice(4);
    const value = process.env[envVar];
    if (!value) throw new Error(`Environment variable ${envVar} is not set`);
    return value;
  }
  return ref;
}
