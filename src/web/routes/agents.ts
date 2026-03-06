import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import {
  listPendingAgents,
  getPendingAgent,
  deletePendingAgent,
  logAudit,
  listAgents,
} from "../../db/index.js";
import { registerAgentDynamic, getAllRuntimes } from "../../agent/registry.js";
import { loadConfig } from "../../config.js";
import { startBot } from "../../channels/telegram.js";
import { hasChannel } from "../../channels/router.js";
import { escapeHtml } from "../../util/html.js";

export function agentsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/agents", (c) => {
    const csrfToken = ((c as any).get?.("csrfToken") as string | undefined) ?? "";
    const cspNonce = ((c as any).get?.("cspNonce") as string | undefined) ?? "";
    const runtimes = getAllRuntimes();
    const pending = listPendingAgents(db);

    const agentRows = runtimes.map((r) => {
      const def = r.definition;
      const msgCount = (
        db.prepare("SELECT COUNT(*) as c FROM messages WHERE agent_name = ?").get(def.name) as { c: number }
      ).c;
      return `
        <tr>
          <td><strong>${escapeHtml(def.displayName)}</strong></td>
          <td><span class="badge badge-purple">${escapeHtml(def.name)}</span></td>
          <td>${escapeHtml(def.model.provider)}/${escapeHtml(def.model.model)}</td>
          <td>${msgCount}</td>
          <td>${def.telegramBotToken ? '<span class="badge badge-green">Telegram</span>' : ""} <span class="badge badge-green">Delegation</span></td>
          <td><span class="badge badge-green">Active</span></td>
        </tr>`;
    }).join("");

    const pendingRows = pending.map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.displayName)}</strong></td>
        <td><span class="badge badge-purple">${escapeHtml(p.name)}</span></td>
        <td>${escapeHtml(p.modelProvider)}/${escapeHtml(p.modelName)}</td>
        <td>${escapeHtml(p.proposedBy)}</td>
        <td>
          <form method="POST" action="/agents/approve" style="display:inline-flex;gap:8px;align-items:center;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="name" value="${escapeHtml(p.name)}">
            <input type="text" name="botToken" placeholder="Telegram bot token (optional)" class="form-input" style="width:240px;padding:4px 8px;font-size:12px;">
            <button type="submit" class="btn btn-primary" style="padding:4px 12px;font-size:12px;">Approve</button>
          </form>
          <form method="POST" action="/agents/reject" style="display:inline;">
            <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="name" value="${escapeHtml(p.name)}">
            <button type="submit" class="btn btn-outline" style="padding:4px 12px;font-size:12px;">Reject</button>
          </form>
        </td>
      </tr>
    `).join("");

    const html = layout("Agents", `
      <h1>Agent Management</h1>

      ${pending.length > 0 ? `
      <h2>Pending Proposals</h2>
      <div class="card mb-32">
        <table>
          <thead>
            <tr><th>Name</th><th>ID</th><th>Model</th><th>Proposed By</th><th>Actions</th></tr>
          </thead>
          <tbody>${pendingRows}</tbody>
        </table>
        <p class="dim small-12" style="margin-top:12px;">
          ${hasChannel("telegram")
            ? "Provide a Telegram bot token to give the agent its own bot, or leave blank for delegation-only."
            : "Sub-agents work via delegation from the main agent. Optionally provide a Telegram bot token for direct messaging."}
        </p>
      </div>
      ` : ""}

      <h2>Active Agents</h2>
      <div class="card">
        ${runtimes.length > 0 ? `
        <table>
          <thead>
            <tr><th>Name</th><th>ID</th><th>Model</th><th>Messages</th><th>Channels</th><th>Status</th></tr>
          </thead>
          <tbody>${agentRows}</tbody>
        </table>
        ` : '<div class="empty">No agents registered</div>'}
      </div>
    `, csrfToken, cspNonce);

    return c.html(html);
  });

  app.post("/agents/approve", async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name ?? "").trim();
    const botToken = String(body.botToken ?? "").trim() || undefined;

    if (!name) return c.redirect("/agents");

    const pending = getPendingAgent(db, name);
    if (!pending) return c.redirect("/agents");

    const config = loadConfig();

    try {
      registerAgentDynamic(db, config.agentsDir, {
        name: pending.name,
        displayName: pending.displayName,
        personality: pending.personality,
        modelProvider: pending.modelProvider,
        modelName: pending.modelName,
        capabilities: pending.capabilities,
        rawBotToken: botToken,
      });

      deletePendingAgent(db, name);

      if (botToken && hasChannel("telegram")) {
        startBot(name);
      }

      logAudit(db, "main", "agent_approved", `Agent: ${name} (via dashboard)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAudit(db, "main", "agent_approve_failed", `Agent: ${name}, Error: ${msg}`);
    }

    return c.redirect("/agents");
  });

  app.post("/agents/reject", async (c) => {
    const body = await c.req.parseBody();
    const name = String(body.name ?? "").trim();

    if (name && deletePendingAgent(db, name)) {
      logAudit(db, "main", "agent_rejected", `Agent: ${name} (via dashboard)`);
    }

    return c.redirect("/agents");
  });

  return app;
}
