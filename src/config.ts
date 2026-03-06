import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { createLogger } from "./util/logger.js";

const log = createLogger("config");

loadDotenv();

const AppConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  masterKey: z.string().min(1, "MASTER_KEY is required"),
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

  // Telegram channel (optional -- at least one channel must be configured)
  ownerChatId: z.string().optional(),
  mainBotToken: z.string().optional(),

  // WhatsApp channel (optional -- at least one channel must be configured)
  whatsappOwnerJid: z.string().optional(),

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

  const hasTelegram = !!val.mainBotToken && !!val.ownerChatId;
  const hasWhatsApp = !!val.whatsappOwnerJid;

  if (!hasTelegram && !hasWhatsApp) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainBotToken"],
      message: "At least one messaging channel must be configured: set MAIN_BOT_TOKEN + OWNER_CHAT_ID for Telegram, or WHATSAPP_OWNER_JID for WhatsApp",
    });
  }

  if (val.mainBotToken && !val.ownerChatId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ownerChatId"],
      message: "OWNER_CHAT_ID is required when MAIN_BOT_TOKEN is set (Telegram channel)",
    });
  }
  if (val.ownerChatId && !val.mainBotToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mainBotToken"],
      message: "MAIN_BOT_TOKEN is required when OWNER_CHAT_ID is set (Telegram channel)",
    });
  }
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

let _config: AppConfig | null = null;

function buildRawConfig(): Record<string, string | undefined> {
  return {
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
    whatsappOwnerJid: process.env.WHATSAPP_OWNER_JID,
    mcpServers: process.env.MCP_SERVERS,
    dbPath: process.env.DB_PATH,
    agentsDir: process.env.AGENTS_DIR,
  };
}

export function isConfigValid(): boolean {
  const result = AppConfigSchema.safeParse(buildRawConfig());
  return result.success;
}

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const raw = buildRawConfig();
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
