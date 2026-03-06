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

type ChannelChoice = "telegram" | "whatsapp" | "both";

interface SetupState {
  provider?: string;
  apiKey?: string;
  channels?: ChannelChoice;
  botToken?: string;
  botUsername?: string;
  ownerChatId?: string;
  whatsappJid?: string;
  dashboardPassword?: string;
}

const state: SetupState = {};

function stepWelcome(cspNonce?: string): string {
  return setupLayout("Welcome", 1, TOTAL_STEPS, `
    <h1>Let's set up your AI agent</h1>
    <p class="dim">This wizard will walk you through everything. You'll need:</p>
    <div class="info-box">
      <ol>
        <li>An API key from <strong>Anthropic</strong>, <strong>OpenAI</strong>, or <strong>Google</strong></li>
        <li>A messaging channel: <strong>Telegram</strong>, <strong>WhatsApp</strong>, or both</li>
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

function stepChannels(error?: string, cspNonce?: string): string {
  const errorHtml = error ? `<p class="error-text">${escapeHtml(error)}</p>` : "";
  const selected = state.channels ?? "telegram";

  const telegramFields = `
    <div id="telegram-fields" class="channel-fields">
      <div class="info-box" style="margin-bottom:16px;">
        <ol>
          <li>Open Telegram and message <code>@BotFather</code></li>
          <li>Send <code>/newbot</code> and follow the prompts</li>
          <li>Copy the <strong>bot token</strong> (looks like <code>123456:ABCdef...</code>)</li>
          <li>Message <code>@userinfobot</code> to get your <strong>numeric user ID</strong></li>
        </ol>
      </div>
      <div class="form-group">
        <label class="form-label" for="botToken">Bot Token</label>
        <input type="text" id="botToken" name="botToken" class="form-input"
          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
          value="${escapeHtml(state.botToken ?? "")}" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label" for="ownerChatId">Your User ID</label>
        <input type="text" id="ownerChatId" name="ownerChatId" class="form-input"
          placeholder="123456789"
          value="${escapeHtml(state.ownerChatId ?? "")}" autocomplete="off">
        <p class="form-hint">Only this user can talk to your agent.</p>
      </div>
    </div>`;

  const whatsappFields = `
    <div id="whatsapp-fields" class="channel-fields">
      <div class="info-box" style="margin-bottom:16px;">
        <p>Enter your WhatsApp phone number in JID format: <code>&lt;country&gt;&lt;number&gt;@s.whatsapp.net</code></p>
        <p>Example: <code>14155551234@s.whatsapp.net</code> (US number 415-555-1234)</p>
        <p>On first start, a QR code will appear in the logs. Scan it with WhatsApp on your phone.</p>
      </div>
      <div class="form-group">
        <label class="form-label" for="whatsappJid">WhatsApp JID</label>
        <input type="text" id="whatsappJid" name="whatsappJid" class="form-input"
          placeholder="14155551234@s.whatsapp.net"
          value="${escapeHtml(state.whatsappJid ?? "")}" autocomplete="off">
      </div>
    </div>`;

  return setupLayout("Messaging Channel", 3, TOTAL_STEPS, `
    <h1>Choose your messaging channel</h1>
    <p class="dim">How do you want to talk to your agent?</p>
    ${errorHtml}
    <form method="POST" action="/setup/channels">
      <div class="provider-cards" style="margin-bottom:20px;">
        <label class="provider-card${selected === "telegram" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected');showChannelFields('telegram')">
          <input type="radio" name="channels" value="telegram"${selected === "telegram" ? " checked" : ""}>
          Telegram<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">Full features + sub-agents</span>
        </label>
        <label class="provider-card${selected === "whatsapp" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected');showChannelFields('whatsapp')">
          <input type="radio" name="channels" value="whatsapp"${selected === "whatsapp" ? " checked" : ""}>
          WhatsApp<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">No extra app needed</span>
        </label>
        <label class="provider-card${selected === "both" ? " selected" : ""}" onclick="this.querySelector('input').checked=true;document.querySelectorAll('.provider-card').forEach(c=>c.classList.remove('selected'));this.classList.add('selected');showChannelFields('both')">
          <input type="radio" name="channels" value="both"${selected === "both" ? " checked" : ""}>
          Both<br><span style="font-weight:400;font-size:12px;color:var(--text-dim)">Telegram + WhatsApp</span>
        </label>
      </div>

      <div id="fields-telegram" style="display:${selected === "telegram" || selected === "both" ? "block" : "none"}">
        ${telegramFields}
      </div>
      <div id="fields-whatsapp" style="display:${selected === "whatsapp" || selected === "both" ? "block" : "none"}">
        ${whatsappFields}
      </div>

      <div class="btn-row">
        <a href="/setup/provider" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-primary">Verify &amp; Continue</button>
      </div>
    </form>
    <script>
    function showChannelFields(choice) {
      document.getElementById('fields-telegram').style.display = (choice === 'telegram' || choice === 'both') ? 'block' : 'none';
      document.getElementById('fields-whatsapp').style.display = (choice === 'whatsapp' || choice === 'both') ? 'block' : 'none';
    }
    </script>
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
      <div class="btn-row">
        <a href="/setup/channels" class="btn btn-outline">Back</a>
        <button type="submit" class="btn btn-primary">Continue</button>
      </div>
    </form>
  `, cspNonce);
}

function stepReview(cspNonce?: string): string {
  const providerLabel: Record<string, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI (GPT)", google: "Google (Gemini)" };
  const maskedKey = state.apiKey ? `${state.apiKey.slice(0, 8)}...${state.apiKey.slice(-4)}` : "not set";
  const channelLabel: Record<string, string> = { telegram: "Telegram", whatsapp: "WhatsApp", both: "Telegram + WhatsApp" };

  let channelDetails = "";
  if (state.channels === "telegram" || state.channels === "both") {
    channelDetails += `
      <div class="review-row">
        <span class="review-label">Telegram Bot</span>
        <span class="review-value">@${escapeHtml(state.botUsername ?? "unknown")}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Owner Chat ID</span>
        <span class="review-value mono">${escapeHtml(state.ownerChatId ?? "")}</span>
      </div>`;
  }
  if (state.channels === "whatsapp" || state.channels === "both") {
    channelDetails += `
      <div class="review-row">
        <span class="review-label">WhatsApp JID</span>
        <span class="review-value mono">${escapeHtml(state.whatsappJid ?? "")}</span>
      </div>`;
  }

  return setupLayout("Review", 5, TOTAL_STEPS, `
    <h1>Ready to launch</h1>
    <p class="dim">Review your settings. You can change anything later in the <code>.env</code> file.</p>
    <div style="margin-bottom: 24px;">
      <div class="review-row">
        <span class="review-label">LLM Provider</span>
        <span class="review-value">${escapeHtml(providerLabel[state.provider ?? ""] ?? state.provider ?? "")}</span>
      </div>
      <div class="review-row">
        <span class="review-label">API Key</span>
        <span class="review-value mono">${escapeHtml(maskedKey)}</span>
      </div>
      <div class="review-row">
        <span class="review-label">Channel</span>
        <span class="review-value">${escapeHtml(channelLabel[state.channels ?? ""] ?? "")}</span>
      </div>
      ${channelDetails}
      <div class="review-row">
        <span class="review-label">Dashboard Password</span>
        <span class="review-value">${"*".repeat(state.dashboardPassword?.length ?? 0)}</span>
      </div>
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

  if (state.channels === "telegram" || state.channels === "both") {
    lines.push(`OWNER_CHAT_ID=${state.ownerChatId}`);
    lines.push(`MAIN_BOT_TOKEN=${state.botToken}`);
  }

  if (state.channels === "whatsapp" || state.channels === "both") {
    lines.push(`WHATSAPP_OWNER_JID=${state.whatsappJid}`);
  }

  lines.push(``);
  lines.push(`DASHBOARD_PORT=3000`);
  lines.push(`DASHBOARD_PASSWORD=${state.dashboardPassword}`);
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
  app.get("/setup/channels", (c) => c.html(stepChannels(undefined, (c as any).get?.("cspNonce"))));
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
    return c.redirect("/setup/channels");
  });

  app.post("/setup/channels", async (c) => {
    const body = await c.req.parseBody();
    const channels = String(body.channels ?? "telegram") as ChannelChoice;
    const nonce = (c as any).get?.("cspNonce");

    const needsTelegram = channels === "telegram" || channels === "both";
    const needsWhatsApp = channels === "whatsapp" || channels === "both";

    if (needsTelegram) {
      const botToken = String(body.botToken ?? "").trim();
      const ownerChatId = String(body.ownerChatId ?? "").trim();

      if (!botToken) return c.html(stepChannels("Telegram bot token is required", nonce), 400);
      if (!ownerChatId) return c.html(stepChannels("Telegram user ID is required", nonce), 400);

      const chatResult = validateOwnerChatId(ownerChatId);
      if (!chatResult.valid) return c.html(stepChannels(chatResult.message, nonce), 400);

      const tokenResult = await validateTelegramToken(botToken);
      if (!tokenResult.valid) return c.html(stepChannels(tokenResult.message, nonce), 400);

      state.botToken = botToken;
      state.ownerChatId = ownerChatId;
      state.botUsername = tokenResult.detail ?? "unknown";
    } else {
      state.botToken = undefined;
      state.ownerChatId = undefined;
      state.botUsername = undefined;
    }

    if (needsWhatsApp) {
      const whatsappJid = String(body.whatsappJid ?? "").trim();
      if (!whatsappJid) return c.html(stepChannels("WhatsApp JID is required", nonce), 400);
      if (!whatsappJid.includes("@")) {
        return c.html(stepChannels("WhatsApp JID must be in format: number@s.whatsapp.net", nonce), 400);
      }
      state.whatsappJid = whatsappJid;
    } else {
      state.whatsappJid = undefined;
    }

    state.channels = channels;
    return c.redirect("/setup/password");
  });

  app.post("/setup/password", async (c) => {
    const body = await c.req.parseBody();
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");
    const nonce = (c as any).get?.("cspNonce");

    if (password.length < 8)
      return c.html(stepPassword("Password must be at least 8 characters", nonce), 400);
    if (password !== confirmPassword)
      return c.html(stepPassword("Passwords do not match", nonce), 400);

    state.dashboardPassword = password;
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
    if (!content.includes("MASTER_KEY=")) return false;
    const hasTelegram = content.includes("MAIN_BOT_TOKEN=");
    const hasWhatsApp = content.includes("WHATSAPP_OWNER_JID=");
    return hasTelegram || hasWhatsApp;
  } catch {
    return false;
  }
}
