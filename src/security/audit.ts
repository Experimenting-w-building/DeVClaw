import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "../util/logger.js";

const log = createLogger("audit");

export type Severity = "pass" | "info" | "warn" | "fail";

export interface AuditCheck {
  name: string;
  severity: Severity;
  message: string;
}

export interface AuditReport {
  checks: AuditCheck[];
  summary: { pass: number; info: number; warn: number; fail: number };
  timestamp: string;
}

function check(name: string, severity: Severity, message: string): AuditCheck {
  return { name, severity, message };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkMasterKey(): AuditCheck {
  const key = process.env.MASTER_KEY;
  if (!key) return check("MASTER_KEY", "fail", "MASTER_KEY is not set");
  if (key.length < 64)
    return check("MASTER_KEY", "warn", `MASTER_KEY is ${key.length} chars (recommend 64 hex chars)`);
  if (!/^[0-9a-f]+$/i.test(key))
    return check("MASTER_KEY", "warn", "MASTER_KEY contains non-hex characters");
  return check("MASTER_KEY", "pass", "MASTER_KEY is set and properly sized");
}

function checkDashboardPassword(): AuditCheck {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return check("DASHBOARD_PASSWORD", "fail", "DASHBOARD_PASSWORD is not set");
  const weak = ["password", "admin", "123456", "devclaw", "changeme", "test"];
  if (weak.includes(pw.toLowerCase()))
    return check("DASHBOARD_PASSWORD", "fail", "DASHBOARD_PASSWORD is a commonly-guessed value");
  if (pw.length < 12)
    return check("DASHBOARD_PASSWORD", "warn", `DASHBOARD_PASSWORD is only ${pw.length} chars (recommend 12+)`);
  return check("DASHBOARD_PASSWORD", "pass", "DASHBOARD_PASSWORD looks strong");
}

function checkSkipAuth(): AuditCheck {
  const skip = process.env.DASHBOARD_SKIP_AUTH;
  const env = process.env.NODE_ENV ?? "development";
  if (skip === "true" && env === "production")
    return check("DASHBOARD_SKIP_AUTH", "fail", "Auth bypass is enabled in production");
  if (skip === "true")
    return check("DASHBOARD_SKIP_AUTH", "warn", "Auth bypass is enabled (acceptable for local dev only)");
  return check("DASHBOARD_SKIP_AUTH", "pass", "Dashboard auth is enforced");
}

function checkNodeEnv(): AuditCheck {
  const env = process.env.NODE_ENV;
  if (!env) return check("NODE_ENV", "info", "NODE_ENV is not set (defaults to development)");
  if (env === "production") return check("NODE_ENV", "pass", "NODE_ENV is set to production");
  return check("NODE_ENV", "info", `NODE_ENV is "${env}"`);
}

function checkProviderKeys(): AuditCheck {
  const has = [
    process.env.ANTHROPIC_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.GOOGLE_API_KEY,
  ].filter(Boolean).length;
  if (has === 0) return check("LLM_API_KEYS", "fail", "No LLM provider API key is set");
  return check("LLM_API_KEYS", "pass", `${has} LLM provider key(s) configured`);
}

function checkChannels(): AuditCheck[] {
  const results: AuditCheck[] = [];
  const hasTelegram = !!process.env.MAIN_BOT_TOKEN && !!process.env.OWNER_CHAT_ID;
  const hasWhatsApp = !!process.env.WHATSAPP_OWNER_JID;

  if (!hasTelegram && !hasWhatsApp) {
    results.push(check("CHANNELS", "fail", "No messaging channel configured (set Telegram or WhatsApp in .env)"));
    return results;
  }

  if (hasTelegram) {
    const id = process.env.OWNER_CHAT_ID!;
    if (!/^\d+$/.test(id))
      results.push(check("OWNER_CHAT_ID", "warn", "OWNER_CHAT_ID does not look like a numeric Telegram ID"));
    else
      results.push(check("OWNER_CHAT_ID", "pass", "OWNER_CHAT_ID is set"));

    const token = process.env.MAIN_BOT_TOKEN!;
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token))
      results.push(check("MAIN_BOT_TOKEN", "warn", "MAIN_BOT_TOKEN format looks unusual"));
    else
      results.push(check("MAIN_BOT_TOKEN", "pass", "MAIN_BOT_TOKEN is set"));
  } else {
    results.push(check("TELEGRAM", "info", "Telegram not configured (optional)"));
  }

  if (hasWhatsApp) {
    const jid = process.env.WHATSAPP_OWNER_JID!;
    if (!jid.includes("@"))
      results.push(check("WHATSAPP_OWNER_JID", "warn", "WHATSAPP_OWNER_JID should be in format: number@s.whatsapp.net"));
    else
      results.push(check("WHATSAPP_OWNER_JID", "pass", "WHATSAPP_OWNER_JID is set"));
  } else {
    results.push(check("WHATSAPP", "info", "WhatsApp not configured (optional)"));
  }

  return results;
}

function checkEnvFilePermissions(): AuditCheck {
  const envPath = resolve(".env");
  if (!existsSync(envPath))
    return check("ENV_FILE", "info", ".env file not found (may be using system env vars)");
  try {
    const stat = statSync(envPath);
    const mode = stat.mode & 0o777;
    if (mode & 0o044)
      return check("ENV_FILE", "warn", `.env is world/group-readable (mode ${mode.toString(8)}). Run: chmod 600 .env`);
    return check("ENV_FILE", "pass", `.env permissions look secure (mode ${mode.toString(8)})`);
  } catch {
    return check("ENV_FILE", "info", "Could not stat .env file");
  }
}

function checkAllowedOrigins(): AuditCheck {
  const origins = process.env.DASHBOARD_ALLOWED_ORIGINS;
  if (!origins) return check("ALLOWED_ORIGINS", "pass", "No extra allowed origins (strictest default)");
  const list = origins.split(",").map((s) => s.trim());
  const insecure = list.filter((o) => o.startsWith("http://") && !o.includes("localhost"));
  if (insecure.length > 0)
    return check("ALLOWED_ORIGINS", "warn", `Non-localhost HTTP origins: ${insecure.join(", ")}`);
  return check("ALLOWED_ORIGINS", "pass", `${list.length} allowed origin(s) configured`);
}

function checkMCPConfig(): AuditCheck {
  const raw = process.env.MCP_SERVERS;
  if (!raw) return check("MCP_SERVERS", "info", "No MCP servers configured");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return check("MCP_SERVERS", "warn", "MCP_SERVERS is not a JSON array");
    const noAllowAgents = parsed.filter((s: Record<string, unknown>) => !s.allowAgents);
    if (noAllowAgents.length > 0)
      return check("MCP_SERVERS", "warn", `${noAllowAgents.length} MCP server(s) without allowAgents restriction`);
    return check("MCP_SERVERS", "pass", `${parsed.length} MCP server(s) configured with access controls`);
  } catch {
    return check("MCP_SERVERS", "fail", "MCP_SERVERS contains invalid JSON");
  }
}

function checkMCPToolAgents(): AuditCheck {
  const agents = process.env.MCP_TOOL_AGENTS;
  if (!agents) return check("MCP_TOOL_AGENTS", "info", "MCP_TOOL_AGENTS not set (defaults to main)");
  return check("MCP_TOOL_AGENTS", "pass", `MCP tools scoped to: ${agents}`);
}

function checkMCPEnvAllowlist(): AuditCheck {
  const list = process.env.MCP_ENV_ALLOWLIST;
  if (!list) return check("MCP_ENV_ALLOWLIST", "info", "MCP_ENV_ALLOWLIST not set (MCP processes inherit minimal env)");
  const vars = list.split(",").map((s) => s.trim());
  const risky = vars.filter((v) =>
    /^(MASTER_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY|DASHBOARD_PASSWORD|MAIN_BOT_TOKEN)$/i.test(v)
  );
  if (risky.length > 0)
    return check("MCP_ENV_ALLOWLIST", "fail", `Secrets exposed to MCP processes: ${risky.join(", ")}`);
  return check("MCP_ENV_ALLOWLIST", "pass", `${vars.length} env vars allowed for MCP processes`);
}

async function checkDocker(): Promise<AuditCheck> {
  try {
    const { isDockerAvailable } = await import("../container/docker.js");
    const ok = await isDockerAvailable();
    if (!ok) return check("DOCKER", "fail", "Docker daemon is not reachable (tool execution will be disabled)");
    return check("DOCKER", "pass", "Docker daemon is running and reachable");
  } catch {
    return check("DOCKER", "fail", "Could not import Docker module");
  }
}

async function checkContainerImages(): Promise<AuditCheck> {
  try {
    const Docker = (await import("dockerode")).default;
    const docker = new Docker();
    const images = await docker.listImages();
    const names = images.flatMap((i) => i.RepoTags ?? []);
    const hasBase = names.some((n) => n.startsWith("node:22"));
    const hasSandbox = names.some((n) => n.includes("devclaw-sandbox") || n.includes("devclaw_sandbox"));
    const hasBrowser = names.some((n) => n.includes("devclaw-browser") || n.includes("devclaw_browser"));
    const parts: string[] = [];
    if (!hasBase) parts.push("node:22-alpine (base image)");
    if (!hasSandbox) parts.push("sandbox container");
    if (!hasBrowser) parts.push("browser container");
    if (parts.length === 0) return check("CONTAINER_IMAGES", "pass", "All expected container images found");
    return check("CONTAINER_IMAGES", "warn", `Missing images: ${parts.join(", ")}. Run: docker compose build`);
  } catch {
    return check("CONTAINER_IMAGES", "info", "Could not list Docker images (Docker may not be running)");
  }
}

function checkDashboardPort(): AuditCheck {
  const port = Number(process.env.DASHBOARD_PORT ?? 3000);
  if (port < 1024)
    return check("DASHBOARD_PORT", "warn", `Port ${port} is privileged (< 1024), may require elevated permissions`);
  return check("DASHBOARD_PORT", "pass", `Dashboard on port ${port}`);
}

function checkLogLevel(): AuditCheck {
  const level = process.env.LOG_LEVEL;
  const env = process.env.NODE_ENV ?? "development";
  if (!level) return check("LOG_LEVEL", "info", "LOG_LEVEL not set (defaults to info)");
  if (level === "debug" && env === "production")
    return check("LOG_LEVEL", "warn", "Debug logging in production can leak sensitive data");
  return check("LOG_LEVEL", "pass", `Log level: ${level}`);
}

function checkLLMResilience(): AuditCheck {
  const timeout = process.env.LLM_TIMEOUT_MS;
  const retries = process.env.LLM_MAX_RETRIES;
  if (!timeout && !retries)
    return check("LLM_RESILIENCE", "info", "Using default timeout (45s) and retries (1)");
  return check("LLM_RESILIENCE", "pass", `Timeout: ${timeout ?? 45000}ms, Retries: ${retries ?? 1}`);
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

export async function runAudit(): Promise<AuditReport> {
  const checks: AuditCheck[] = [];

  // Synchronous checks
  checks.push(checkNodeEnv());
  checks.push(checkMasterKey());
  checks.push(checkDashboardPassword());
  checks.push(checkSkipAuth());
  checks.push(checkProviderKeys());
  checks.push(...checkChannels());
  checks.push(checkEnvFilePermissions());
  checks.push(checkAllowedOrigins());
  checks.push(checkDashboardPort());
  checks.push(checkLogLevel());
  checks.push(checkLLMResilience());
  checks.push(checkMCPConfig());
  checks.push(checkMCPToolAgents());
  checks.push(checkMCPEnvAllowlist());

  // Async checks (Docker)
  checks.push(await checkDocker());
  checks.push(await checkContainerImages());

  const summary = { pass: 0, info: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.severity]++;

  return { checks, summary, timestamp: new Date().toISOString() };
}

export function formatReport(report: AuditReport): string {
  const icons: Record<Severity, string> = {
    pass: "  PASS ",
    info: "  INFO ",
    warn: "  WARN ",
    fail: "  FAIL ",
  };

  const lines: string[] = [
    "",
    "=== DeVClaw Security Audit ===",
    `Timestamp: ${report.timestamp}`,
    "",
  ];

  for (const c of report.checks) {
    lines.push(`[${icons[c.severity]}] ${c.name}: ${c.message}`);
  }

  lines.push("");
  lines.push("--- Summary ---");
  lines.push(`  Pass: ${report.summary.pass}  |  Info: ${report.summary.info}  |  Warn: ${report.summary.warn}  |  Fail: ${report.summary.fail}`);

  if (report.summary.fail > 0) {
    lines.push("");
    lines.push(`${report.summary.fail} check(s) FAILED -- address these before deploying to production.`);
  } else if (report.summary.warn > 0) {
    lines.push("");
    lines.push(`No failures, but ${report.summary.warn} warning(s) to review.`);
  } else {
    lines.push("");
    lines.push("All checks passed.");
  }

  lines.push("");
  return lines.join("\n");
}
