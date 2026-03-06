import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setupLayout } from "./views/setup-layout.js";
import { escapeHtml } from "../util/html.js";
import {
  validateTelegramToken,
  validateLLMKey,
  validateOwnerChatId,
} from "../util/validate.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("setup");
const TOTAL_STEPS = 5;

interface SetupState {
  provider?: string;
  apiKey?: string;
  botToken?: string;
  botUsername?: string;
  ownerChatId?: string;
  dashboardPassword?: string;
  whatsappJid?: string;
}

const state: SetupState = {};

function stepWelcome(cspNonce?: string): string {
  return setupLayout("Welcome", 1, TOTAL_STEPS, `
    <h1>Let's set up your AI agent</h1>
    <p class="dim">This wizard will walk you through everything. You'll need:</p>
    <div class="info-box">
      <ol>
        <li>An API key from <strong>Anthropic</strong>, <strong>OpenAI</strong>, or <strong>Google</strong></li>
        <li>A <strong>Telegram bot token</strong> (you'll create one with @BotFather)</li>
        <li>Your <strong>Telegram user ID</strong> (from @userinfobot)</li>
      </ol>
    </div>
    <p class="dim">Takes about 5 minutes. All data stays on your machine.</p>
    <div class="btn-row">
      <a href="/setup/provider" class="btn btn-primary">Get Started</a>
    </div>
  `, cspNonce);
}

function stepProvider(error?: string, cspNonce?: string): string {
  const errorHtml = error ? `<p class="error-text">${escapeHtml(error)}</p>` : "";
  const selected = state.provider ?? "anthropic";
  return setupLayout("LLM Provider", 2, TOTAL_STEPS, `
    <h1>Choose your LLM provider</h1>
    <p class="dim">Select which AI model will power your agent.</p>
    ${errorHtml}
    <form method="POST" action="/setup/provider">
      <div class="provider-cards">
        <label class="provider-card${selected === "anthropic" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected')">
          <input type="radio" name="provider" value="anthropic"${selected === "anthropic" ? " checked" : ""}>
          Anthropic<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">Claude</span>
        </label>
        <label class="provider-card${selected === "openai" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected')">
          <input type="radio" name="provider" value="openai"${selected === "openai" ? " checked" : ""}>
          OpenAI<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">GPT</span>
        </label>
        <label class="provider-card${selected === "google" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected')">
          <input type="radio" name="provider" value="google"${selected === "google" ? " checked" : ""}>
          Google<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">Gemini</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-label" for="apiKey">API Key</label>
        <input type="password" id="apiKey" name="apiKey" class="form-input"
          placeholder="Paste your API key here"
          value="${escapeHtml(state.apiKey ?? "")}" required>
        <p class="form-hint">Get one from your provider's dashboard. We'll verify it works.</p>
      </div>
      <div class="btn-row">
        <a href="/setup" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-primary">Verify &amp; Continue</button>
      </div>
    </form>
  `, cspNonce);
}

function stepTelegram(error?: string, cspNonce?: string): string {
  const errorHtml = error ? `<p class="error-text">${escapeHtml(error)}</p>` : "";
  return setupLayout("Telegram", 3, TOTAL_STEPS, `
    <h1>Connect Telegram</h1>
    <p class="dim">Your agent lives on Telegram. Follow these steps:</p>
    <div class="info-box">
      <ol>
        <li>Open Telegram and message <code>@BotFather</code></li>
        <li>Send <code>/newbot</code> and follow the prompts</li>
        <li>Copy the <strong>bot token</strong> (looks like <code>123456:ABCdef...</code>)</li>
        <li>Message <code>@userinfobot</code> to get your <strong>numeric user ID</strong></li>
      </ol>
    </div>
    ${errorHtml}
    <form method="POST" action="/setup/telegram">
      <div class="form-group">
        <label class="form-label" for="botToken">Bot Token</label>
        <input type="text" id="botToken" name="botToken" class="form-input"
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
          value="${escapeHtml(state.botToken ?? "")}" required autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="ownerChatId">Your User ID</label>
        <input type="text" id="ownerChatId" name="ownerChatId" class="form-input"
          placeholder="123456789"
          value="${escapeHtml(state.ownerChatId ?? "")}" required autocomplete="off">
        <p class="form-hint">Only this user can talk to your agent.</p>
      </div>
      <div class="btn-row">
        <a href="/setup/provider" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-primary">Verify &amp; Continue</button>
      </div>
    </form>
  `, cspNonce);
}

function stepPassword(error?: string, cspNonce?: string): string {
  const errorHtml = error ? `<p class="error-text">${escapeHtml(error)}</p>` : "";
  return setupLayout("Security", 4, TOTAL_STEPS, `
    <h1>Set dashboard password</h1>
    <p class="dim">This protects the web dashboard where you can manage your agent.</p>
    ${errorHtml}
    <form method="POST" action="/setup/password">
      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input type="password" id="password" name="password" class="form-input"
          placeholder="Choose a strong password" required minlength="8" autocomplete="new-password">
        <p class="form-hint">At least 8 characters. This is the login for your web dashboard.</p>
      </div>
      <div class="form-group">
        <label class="form-label" for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" name="confirmPassword" class="form-input"
          placeholder="Type it again" required autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label" for="whatsappJid">WhatsApp Number (optional)</label>
        <input type="text" id="whatsappJid" name="whatsappJid" class="form-input"
          placeholder="14155551234@s.whatsapp.net"
          value="${escapeHtml(state.whatsappJid ?? "")}">
        <p class="form-hint">Your phone number in WhatsApp JID format. Leave blank to skip WhatsApp.</p>
      </div>
      <div class="btn-row">
        <a href="/setup/telegram" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-primary">Continue</button>
      </div>
    </form>
  `, cspNonce);
}

function stepReview(cspNonce?: string): string {
  const providerLabel = { anthropic: "Anthropic (Claude)", openai: "OpenAI (GPT)", google: "Google (Gemini)" };
  const maskedKey = state.apiKey ? `${state.apiKey.slice(0, 8)}...${state.apiKey.slice(-4)}` : "not set";

  return setupLayout("Review", 5, TOTAL_STEPS, `
    <h1>Ready to launch</h1>
    <p class="dim">Review your settings. You can change anything later in the <code>.env</code> file.</p>
    <div style="margin-bottom: 24px;">
      <div class="review-row">
        <span class="review-label">LLM Provider</span>
        <span class="review-value">${escapeHtml(providerLabel[state.provider as keyof typeof providerLabel] ?? state.provider ?? "")}</span>
      </div>
      <div class="review-row">
        <span class="review-label">API Key</span>
        <span class="review-value mono">${escapeHtml(maskedKey)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Telegram Bot</span>
        <span class="review-value">@${escapeHtml(state.botUsername ?? "unknown")}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Owner Chat ID</span>
        <span class="review-value mono">${escapeHtml(state.ownerChatId ?? "")}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Dashboard Password</span>
        <span class="review-value">${"*".repeat(state.dashboardPassword?.length ?? 0)}</span>
      </div>
      ${state.whatsappJid ? `<div class="review-row">
        <span class="review-label">WhatsApp</span>
        <span class="review-value mono">${escapeHtml(state.whatsappJid)}</span>
      </div>` : ""}
    </div>
    <form method="POST" action="/setup/finish">
      <div class="btn-row">
        <a href="/setup/password" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-success">Launch Agent</button>
      </div>
    </form>
  `, cspNonce);
}

function stepComplete(cspNonce?: string): string {
  return setupLayout("Complete", 5, TOTAL_STEPS, `
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:48px;margin-bottom:16px;">&#10003;</div>
      <h1>Your agent is starting!</h1>
      <p class="dim">Configuration saved. The process is restarting with your settings.</p>
      <p class="dim">In a few seconds, you'll be redirected to the dashboard login.</p>
      <div style="margin-top:24px;">
        <a href="/login" class="btn btn-primary">Go to Dashboard</a>
      </div>
    </div>
  `, cspNonce);
}

function buildEnvContent(): string {
  const masterKey = randomBytes(32).toString("hex");
  const lines = [
    `NODE_ENV=production`,
    `MASTER_KEY=${masterKey}`,
    ``,
  ];

  if (state.provider === "anthropic") lines.push(`ANTHROPIC_API_KEY=${state.apiKey}`);
  else if (state.provider === "openai") lines.push(`OPENAI_API_KEY=${state.apiKey}`);
  else if (state.provider === "google") lines.push(`GOOGLE_API_KEY=${state.apiKey}`);

  lines.push(`MAIN_MODEL_PROVIDER=${state.provider}`);
  lines.push(``);
  lines.push(`OWNER_CHAT_ID=${state.ownerChatId}`);
  lines.push(`MAIN_BOT_TOKEN=${state.botToken}`);
  lines.push(``);
  lines.push(`DASHBOARD_PORT=3000`);
  lines.push(`DASHBOARD_PASSWORD=${state.dashboardPassword}`);

  if (state.whatsappJid) {
    lines.push(``);
    lines.push(`WHATSAPP_OWNER_JID=${state.whatsappJid}`);
  }

  lines.push(``);
  return lines.join("\n");
}

export function startSetupWizard(port: number): void {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const cspNonce = randomBytes(16).toString("base64");
    (c as any).set("cspNonce", cspNonce);
    c.header("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'unsafe-inline'",
      `style-src 'self' 'nonce-${cspNonce}'`,
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "));
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });

  app.get("/", (c) => c.redirect("/setup"));
  app.get("/setup", (c) => c.html(stepWelcome((c as any).get?.("cspNonce"))));
  app.get("/setup/provider", (c) => c.html(stepProvider(undefined, (c as any).get?.("cspNonce"))));
  app.get("/setup/telegram", (c) => c.html(stepTelegram(undefined, (c as any).get?.("cspNonce"))));
  app.get("/setup/password", (c) => c.html(stepPassword(undefined, (c as any).get?.("cspNonce"))));
  app.get("/setup/review", (c) => c.html(stepReview((c as any).get?.("cspNonce"))));

  app.post("/setup/provider", async (c) => {
    const body = await c.req.parseBody();
    const provider = String(body.provider ?? "anthropic");
    const apiKey = String(body.apiKey ?? "").trim();
    const nonce = (c as any).get?.("cspNonce");

    if (!apiKey) return c.html(stepProvider("API key is required", nonce), 400);

    const result = await validateLLMKey(provider as "anthropic" | "openai" | "google", apiKey);
    if (!result.valid) return c.html(stepProvider(result.message, nonce), 400);

    state.provider = provider;
    state.apiKey = apiKey;
    return c.redirect("/setup/telegram");
  });

  app.post("/setup/telegram", async (c) => {
    const body = await c.req.parseBody();
    const botToken = String(body.botToken ?? "").trim();
    const ownerChatId = String(body.ownerChatId ?? "").trim();
    const nonce = (c as any).get?.("cspNonce");

    const chatResult = validateOwnerChatId(ownerChatId);
    if (!chatResult.valid) return c.html(stepTelegram(chatResult.message, nonce), 400);

    const tokenResult = await validateTelegramToken(botToken);
    if (!tokenResult.valid) return c.html(stepTelegram(tokenResult.message, nonce), 400);

    state.botToken = botToken;
    state.ownerChatId = ownerChatId;
    state.botUsername = tokenResult.detail ?? "unknown";
    return c.redirect("/setup/password");
  });

  app.post("/setup/password", async (c) => {
    const body = await c.req.parseBody();
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");
    const whatsappJid = String(body.whatsappJid ?? "").trim();
    const nonce = (c as any).get?.("cspNonce");

    if (password.length < 8)
      return c.html(stepPassword("Password must be at least 8 characters", nonce), 400);
    if (password !== confirmPassword)
      return c.html(stepPassword("Passwords do not match", nonce), 400);

    state.dashboardPassword = password;
    state.whatsappJid = whatsappJid || undefined;
    return c.redirect("/setup/review");
  });

  app.post("/setup/finish", async (c) => {
    const envContent = buildEnvContent();
    const envPath = resolve(".env");

    try {
      writeFileSync(envPath, envContent, { mode: 0o600 });
      log.info("Setup complete -- .env written, restarting...");
    } catch (err) {
      log.error("Failed to write .env", { error: String(err) });
      return c.html(stepReview((c as any).get?.("cspNonce")));
    }

    const nonce = (c as any).get?.("cspNonce");
    const html = stepComplete(nonce);

    setTimeout(() => {
      log.info("Restarting process after setup...");
      process.exit(0);
    }, 2000);

    return c.html(html);
  });

  app.get("*", (c) => c.redirect("/setup"));

  serve({ fetch: app.fetch, port }, () => {
    log.info(`Setup wizard running at http://localhost:${port}/setup`);
    log.info("Open this URL in your browser to configure DeVClaw.");
  });
}

export function isConfigured(): boolean {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return false;
  try {
    const content = readFileSync(envPath, "utf-8");
    return content.includes("MASTER_KEY=") && content.includes("MAIN_BOT_TOKEN=");
  } catch {
    return false;
  }
}
