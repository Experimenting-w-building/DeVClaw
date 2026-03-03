import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import { getAllRuntimes } from "../../agent/registry.js";

export function dashboardRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/", (c) => {
    const runtimes = getAllRuntimes();

    const agentCount = runtimes.length;
    const skillCount = (
      db.prepare("SELECT COUNT(*) as c FROM skills").get() as { c: number }
    ).c;
    const taskCount = (
      db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks WHERE enabled = 1").get() as { c: number }
    ).c;
    const recentLogs = db
      .prepare("SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20")
      .all() as Record<string, unknown>[];

    const agentCards = runtimes
      .map((r) => {
        const def = r.definition;
        const msgCount = (
          db.prepare("SELECT COUNT(*) as c FROM messages WHERE agent_name = ?").get(def.name) as { c: number }
        ).c;
        const agentSkills = (
          db.prepare("SELECT COUNT(*) as c FROM skills WHERE agent_name = ?").get(def.name) as { c: number }
        ).c;

        return `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h3>${def.displayName}</h3>
              <span class="badge badge-green">Active</span>
            </div>
            <p class="dim" style="font-size:13px;margin-bottom:8px">${def.personality.slice(0, 120)}...</p>
            <div style="display:flex;gap:16px;font-size:13px;color:var(--text-dim)">
              <span>${def.model.provider}/${def.model.model}</span>
              <span>${msgCount} messages</span>
              <span>${agentSkills} skills</span>
            </div>
            <div style="margin-top:12px">
              <a href="/agents/${def.name}" class="btn btn-outline">View Details</a>
            </div>
          </div>`;
      })
      .join("");

    const logRows = recentLogs
      .map(
        (log) => `
        <tr>
          <td class="mono dim">${(log.timestamp as string).slice(11, 19)}</td>
          <td><span class="badge badge-purple">${log.agent_name}</span></td>
          <td>${log.action}</td>
          <td class="truncate dim">${(log.detail as string).slice(0, 100)}</td>
        </tr>`
      )
      .join("");

    const html = layout(
      "Dashboard",
      `
      <h1>Agent Team Dashboard</h1>

      <div class="grid grid-3" style="margin-bottom:32px">
        <div class="card stat">
          <div class="stat-value">${agentCount}</div>
          <div class="stat-label">Active Agents</div>
        </div>
        <div class="card stat">
          <div class="stat-value">${skillCount}</div>
          <div class="stat-label">Total Skills</div>
        </div>
        <div class="card stat">
          <div class="stat-value">${taskCount}</div>
          <div class="stat-label">Scheduled Tasks</div>
        </div>
      </div>

      <h2>Agents</h2>
      <div class="grid grid-2" style="margin-bottom:32px">
        ${agentCards || '<div class="empty">No agents registered</div>'}
      </div>

      <h2>Recent Activity</h2>
      <div class="card">
        ${
          logRows
            ? `<table><thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Detail</th></tr></thead><tbody>${logRows}</tbody></table>`
            : '<div class="empty">No activity yet</div>'
        }
      </div>
    `
    );

    return c.html(html);
  });

  return app;
}
