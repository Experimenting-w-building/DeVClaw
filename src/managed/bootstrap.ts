import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "../util/logger.js";

const log = createLogger("bootstrap");

export interface BootstrapPayload {
  masterKey: string;
  dashboardPassword: string;

  mainModelProvider: string;

  // LLM proxy (managed instances use this instead of direct API keys)
  llmProxyUrl?: string;
  llmProxyToken?: string;

  // Direct API keys (BYOK mode)
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;

  // Channels (at least one required)
  ownerChatId?: string;
  mainBotToken?: string;
  whatsappOwnerJid?: string;

  // Managed mode callback
  managedCallbackUrl?: string;
  managedInstanceId?: string;

  dashboardPort?: number;
}

function buildEnvFromPayload(payload: BootstrapPayload): string {
  const lines: string[] = [
    `NODE_ENV=production`,
    `MASTER_KEY=${payload.masterKey}`,
    `DASHBOARD_PASSWORD=${payload.dashboardPassword}`,
    `DASHBOARD_PORT=${payload.dashboardPort ?? 3000}`,
    ``,
    `MAIN_MODEL_PROVIDER=${payload.mainModelProvider}`,
  ];

  if (payload.llmProxyUrl) {
    lines.push(`LLM_PROXY_URL=${payload.llmProxyUrl}`);
    lines.push(`LLM_PROXY_TOKEN=${payload.llmProxyToken ?? ""}`);
  }

  if (payload.anthropicApiKey) lines.push(`ANTHROPIC_API_KEY=${payload.anthropicApiKey}`);
  if (payload.openaiApiKey) lines.push(`OPENAI_API_KEY=${payload.openaiApiKey}`);
  if (payload.googleApiKey) lines.push(`GOOGLE_API_KEY=${payload.googleApiKey}`);

  lines.push(``);
  if (payload.ownerChatId) lines.push(`OWNER_CHAT_ID=${payload.ownerChatId}`);
  if (payload.mainBotToken) lines.push(`MAIN_BOT_TOKEN=${payload.mainBotToken}`);
  if (payload.whatsappOwnerJid) lines.push(`WHATSAPP_OWNER_JID=${payload.whatsappOwnerJid}`);

  if (payload.managedCallbackUrl) {
    lines.push(``);
    lines.push(`MANAGED_CALLBACK_URL=${payload.managedCallbackUrl}`);
    lines.push(`MANAGED_INSTANCE_ID=${payload.managedInstanceId ?? ""}`);
  }

  lines.push(``);
  return lines.join("\n");
}

/**
 * Creates a one-shot bootstrap Hono app. Once a valid bootstrap request
 * is received, it writes .env and exits the process so the service manager
 * restarts with the new config.
 */
export function createBootstrapApp(bootstrapToken: string): Hono {
  const app = new Hono();
  let consumed = false;

  app.post("/bootstrap", async (c) => {
    if (consumed) {
      return c.json({ error: "Bootstrap already completed" }, 409);
    }

    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");

    if (!token || token !== bootstrapToken) {
      log.warn("Bootstrap attempt with invalid token");
      return c.json({ error: "Invalid bootstrap token" }, 401);
    }

    let payload: BootstrapPayload;
    try {
      payload = await c.req.json<BootstrapPayload>();
    } catch {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }

    if (!payload.masterKey || !payload.dashboardPassword || !payload.mainModelProvider) {
      return c.json({ error: "Missing required fields: masterKey, dashboardPassword, mainModelProvider" }, 400);
    }

    const hasChannel = !!(payload.mainBotToken && payload.ownerChatId) || !!payload.whatsappOwnerJid;
    if (!hasChannel) {
      return c.json({ error: "At least one messaging channel must be configured" }, 400);
    }

    const hasLlm = !!payload.llmProxyUrl || !!payload.anthropicApiKey || !!payload.openaiApiKey || !!payload.googleApiKey;
    if (!hasLlm) {
      return c.json({ error: "LLM access required: set llmProxyUrl or at least one API key" }, 400);
    }

    const envContent = buildEnvFromPayload(payload);
    const envPath = resolve(".env");

    try {
      writeFileSync(envPath, envContent, { mode: 0o600 });
      consumed = true;
      log.info("Bootstrap complete -- .env written");
    } catch (err) {
      log.error("Bootstrap failed to write .env", { error: String(err) });
      return c.json({ error: "Failed to write configuration" }, 500);
    }

    setTimeout(() => {
      log.info("Restarting after bootstrap...");
      process.exit(0);
    }, 1000);

    return c.json({ ok: true, message: "Configuration applied. Instance restarting." });
  });

  app.get("/bootstrap/health", (c) => {
    return c.json({
      status: consumed ? "configured" : "awaiting_bootstrap",
      envExists: existsSync(resolve(".env")),
    });
  });

  return app;
}
