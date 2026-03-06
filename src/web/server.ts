import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { agentsRoutes } from "./routes/agents.js";
import { skillsRoutes } from "./routes/skills.js";
import { tasksRoutes } from "./routes/tasks.js";
import { logsRoutes } from "./routes/logs.js";
import { layout } from "./views/layout.js";
import { createLogger } from "../util/logger.js";
import { escapeHtml } from "../util/html.js";

const log = createLogger("dashboard");

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const COOKIE_NAME = "devclaw_session";
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;

const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function signSession(sessionId: string, masterKey: string): string {
  const sig = createHmac("sha256", masterKey).update(sessionId).digest("hex");
  return `${sessionId}.${sig}`;
}

function verifySession(cookie: string, masterKey: string): string | null {
  const dotIdx = cookie.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const sessionId = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  const expected = createHmac("sha256", masterKey).update(sessionId).digest("hex");
  try {
    if (timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return sessionId;
    }
  } catch {
    return null;
  }
  return null;
}

const sessions = new Map<string, { createdAt: number; csrfToken: string }>();

function isSameOrigin(requestUrl: string, originOrReferer: string): boolean {
  try {
    const requestOrigin = new URL(requestUrl).origin;
    const headerOrigin = new URL(originOrReferer).origin;
    return requestOrigin === headerOrigin;
  } catch {
    return false;
  }
}

function isAllowedOrigin(configured: string | undefined, requestUrl: string, originOrReferer: string): boolean {
  if (isSameOrigin(requestUrl, originOrReferer)) return true;
  if (!configured) return false;
  const allowed = configured.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const origin = new URL(originOrReferer).origin;
    return allowed.includes(origin);
  } catch {
    return false;
  }
}

function loginPage(error?: string, cspNonce?: string): string {
  const errorHtml = error
    ? `<p class="error-text">${escapeHtml(error)}</p>`
    : "";
  return layout(
    "Login",
    `
    <div class="card-login-wrap">
      <div class="card text-center">
        <h2 class="mb-16">DeVClaw AI</h2>
        ${errorHtml}
        <form method="POST" action="/login">
          <input
            name="password" type="password" placeholder="Dashboard password"
            autofocus autocomplete="current-password"
            class="login-input"
          >
          <button type="submit" class="btn btn-primary btn-full">Sign In</button>
        </form>
      </div>
    </div>
  `,
    undefined,
    cspNonce
  );
}

export function startDashboard(db: Database.Database, port: number): void {
  const config = loadConfig();
  if (config.nodeEnv === "production" && process.env.DASHBOARD_SKIP_AUTH === "true") {
    throw new Error("Refusing to start with DASHBOARD_SKIP_AUTH=true in production");
  }
  const app = new Hono();

  app.use("*", async (c, next) => {
    const cspNonce = randomBytes(16).toString("base64");
    (c as any).set("cspNonce", cspNonce);
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        `style-src 'self' 'nonce-${cspNonce}'`,
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "form-action 'self'",
      ].join("; ")
    );
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    await next();
  });

  // --- Auth routes (always accessible) ---

  app.get("/login", (c) => c.html(loginPage(undefined, ((c as any).get?.("cspNonce") as string | undefined))));

  app.post("/login", async (c) => {
    const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkLoginRateLimit(clientIp)) {
      return c.html(loginPage("Too many login attempts. Try again later.", ((c as any).get?.("cspNonce") as string | undefined)), 429);
    }

    const body = await c.req.parseBody();
    const password = typeof body.password === "string" ? body.password : "";

    if (password !== config.dashboardPassword) {
      return c.html(loginPage("Incorrect password", ((c as any).get?.("cspNonce") as string | undefined)), 401);
    }

    const sessionId = randomBytes(32).toString("hex");
    const csrfToken = randomBytes(32).toString("hex");
    sessions.set(sessionId, { createdAt: Date.now(), csrfToken });
    const signed = signSession(sessionId, config.masterKey);

    const isSecure = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https");
    const securePart = isSecure ? "; Secure" : "";
    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}${securePart}`
    );
    return c.redirect("/");
  });

  app.post("/logout", (c) => {
    const cookie = parseCookie(c.req.header("cookie") || "");
    if (cookie) {
      const sessionId = verifySession(cookie, config.masterKey);
      if (sessionId) sessions.delete(sessionId);
    }
    c.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
    return c.redirect("/login");
  });

  // --- Auth middleware ---

  app.use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/login") {
      await next();
      return;
    }

    const skipAuth = process.env.DASHBOARD_SKIP_AUTH === "true";
    if (skipAuth) {
      await next();
      return;
    }

    const cookie = parseCookie(c.req.header("cookie") || "");
    if (!cookie) return c.redirect("/login");

    const sessionId = verifySession(cookie, config.masterKey);
    if (!sessionId) return c.redirect("/login");

    const session = sessions.get(sessionId);
    if (!session || Date.now() - session.createdAt > SESSION_MAX_AGE_MS) {
      sessions.delete(sessionId!);
      return c.redirect("/login");
    }

    (c as any).set("csrfToken", session.csrfToken);

    if (c.req.method === "POST") {
      const origin = c.req.header("origin");
      const referer = c.req.header("referer");
      const sameOrigin = (origin && isAllowedOrigin(config.dashboardAllowedOrigins, c.req.url, origin))
        || (referer && isAllowedOrigin(config.dashboardAllowedOrigins, c.req.url, referer));
      if (!sameOrigin) return c.text("Forbidden", 403);

      const body = await c.req.parseBody();
      const csrf = typeof body._csrf === "string" ? body._csrf : "";
      if (!csrf || csrf !== session.csrfToken) {
        return c.text("Invalid CSRF token", 403);
      }
    }

    await next();
  });

  // --- App routes ---

  app.route("/", dashboardRoutes(db));
  app.route("/", agentsRoutes(db));
  app.route("/", skillsRoutes(db));
  app.route("/", tasksRoutes(db));
  app.route("/", logsRoutes(db));

  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.createdAt > SESSION_MAX_AGE_MS) sessions.delete(id);
    }
    for (const [ip, entry] of loginAttempts) {
      if (now - entry.windowStart >= LOGIN_WINDOW_MS) loginAttempts.delete(ip);
    }
  }, SESSION_CLEANUP_INTERVAL_MS);

  serve({ fetch: app.fetch, port }, () => {
    log.info(`Running at http://localhost:${port}`);
  });
}

function parseCookie(header: string): string | null {
  const match = header.split(";").find((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
  return match ? match.split("=").slice(1).join("=").trim() : null;
}
