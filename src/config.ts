import { z } from "zod";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const AppConfigSchema = z.object({
  masterKey: z.string().min(1, "MASTER_KEY is required"),
  ownerChatId: z.string().min(1, "OWNER_CHAT_ID is required"),
  dashboardPort: z.coerce.number().default(3000),
  dashboardPassword: z.string().min(1, "DASHBOARD_PASSWORD is required"),

  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),

  mainBotToken: z.string().min(1, "MAIN_BOT_TOKEN is required"),

  mcpServers: z.string().optional(),

  dbPath: z.string().default("data.db"),
  agentsDir: z.string().default("agents"),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const raw = {
    masterKey: process.env.MASTER_KEY,
    ownerChatId: process.env.OWNER_CHAT_ID,
    dashboardPort: process.env.DASHBOARD_PORT,
    dashboardPassword: process.env.DASHBOARD_PASSWORD,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY,
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
    console.error(`Configuration errors:\n${issues}`);
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
}

export function parseMCPServers(config: AppConfig): MCPServerEntry[] {
  if (!config.mcpServers) return [];
  try {
    const parsed = JSON.parse(config.mcpServers);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    console.warn("[config] Invalid MCP_SERVERS JSON, skipping");
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
