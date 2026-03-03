import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";

export function logsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/logs", (c) => {
    const agentFilter = c.req.query("agent") || "";
    const actionFilter = c.req.query("action") || "";
    const limit = Math.min(Number(c.req.query("limit") || 100), 500);

    let query = "SELECT * FROM audit_log WHERE 1=1";
    const params: (string | number)[] = [];

    if (agentFilter) {
      query += " AND agent_name = ?";
      params.push(agentFilter);
    }
    if (actionFilter) {
      query += " AND action LIKE ?";
      params.push(`%${actionFilter}%`);
    }

    query += " ORDER BY timestamp DESC LIMIT ?";
    params.push(limit);

    const logs = db.prepare(query).all(...params) as Record<string, unknown>[];

    const agents = (
      db.prepare("SELECT DISTINCT agent_name FROM audit_log ORDER BY agent_name").all() as { agent_name: string }[]
    ).map((r) => r.agent_name);

    const agentOptions = agents
      .map((a) => `<option value="${a}" ${a === agentFilter ? "selected" : ""}>${a}</option>`)
      .join("");

    const rows = logs
      .map(
        (log) => `
        <tr>
          <td class="mono dim" style="white-space:nowrap">${log.timestamp}</td>
          <td><span class="badge badge-purple">${log.agent_name}</span></td>
          <td class="mono">${log.action}</td>
          <td class="dim" style="max-width:500px;overflow:hidden;text-overflow:ellipsis">${(log.detail as string).slice(0, 200)}</td>
        </tr>`
      )
      .join("");

    const html = layout(
      "Audit Logs",
      `
      <h1>Audit Logs</h1>

      <div class="card" style="margin-bottom:16px">
        <form method="GET" action="/logs" style="display:flex;gap:12px;align-items:center">
          <select name="agent" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px">
            <option value="">All agents</option>
            ${agentOptions}
          </select>
          <input name="action" value="${actionFilter}" placeholder="Filter by action..."
                 style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;flex:1">
          <button type="submit" class="btn btn-primary">Filter</button>
        </form>
      </div>

      <div class="card">
        ${
          rows
            ? `<table>
                <thead><tr><th>Timestamp</th><th>Agent</th><th>Action</th><th>Detail</th></tr></thead>
                <tbody>${rows}</tbody>
               </table>`
            : '<div class="empty">No logs yet</div>'
        }
      </div>
    `
    );

    return c.html(html);
  });

  return app;
}
