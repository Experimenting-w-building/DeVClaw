import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { skillsRoutes } from "./routes/skills.js";
import { tasksRoutes } from "./routes/tasks.js";
import { logsRoutes } from "./routes/logs.js";
import { layout } from "./views/layout.js";

const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = "openclaw_session";

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

const sessions = new Map<string, { createdAt: number }>();

function loginPage(error?: string): string {
  const errorHtml = error
    ? `<p style="color:var(--red);margin-bottom:16px;font-size:14px">${error}</p>`
    : "";
  return layout(
    "Login",
    `
    <div style="max-width:360px;margin:80px auto">
      <div class="card" style="text-align:center">
        <h2 style="margin-bottom:20px">OpenClaw AI</h2>
        ${errorHtml}
        <form method="POST" action="/login">
          <input
            name="password" type="password" placeholder="Dashboard password"
            autofocus autocomplete="current-password"
            style="width:100%;padding:10px 14px;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px;font-size:15px"
          >
          <button type="submit" class="btn btn-primary" style="width:100%;padding:10px">Sign In</button>
        </form>
      </div>
    </div>
  `
  );
}

export function startDashboard(db: Database.Database, port: number): void {
  const config = loadConfig();
  const app = new Hono();

  // --- Auth routes (always accessible) ---

  app.get("/login", (c) => c.html(loginPage()));

  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const password = typeof body.password === "string" ? body.password : "";

    if (password !== config.dashboardPassword) {
      return c.html(loginPage("Incorrect password"), 401);
    }

    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, { createdAt: Date.now() });
    const signed = signSession(sessionId, config.masterKey);

    c.header(
      "Set-Cookie",
      `${COOKIE_NAME}=${signed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}`
    );
    return c.redirect("/");
  });

  app.get("/logout", (c) => {
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

    const host = c.req.header("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    if (isLocalhost) {
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

    await next();
  });

  // --- App routes ---

  app.route("/", dashboardRoutes(db));
  app.route("/", skillsRoutes(db));
  app.route("/", tasksRoutes(db));
  app.route("/", logsRoutes(db));

  serve({ fetch: app.fetch, port }, () => {
    console.log(`[dashboard] Running at http://localhost:${port}`);
  });
}

function parseCookie(header: string): string | null {
  const match = header.split(";").find((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
  return match ? match.split("=").slice(1).join("=").trim() : null;
}
