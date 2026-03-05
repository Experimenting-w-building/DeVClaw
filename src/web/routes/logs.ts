import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import { escapeHtml } from "../../util/html.js";

export function logsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/logs", (c) => {
    const csrfToken = ((c as any).get?.("csrfToken") as string | undefined) ?? "";
    const cspNonce = ((c as any).get?.("cspNonce") as string | undefined) ?? "";
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
      .map((a) => `<option value="${escapeHtml(a)}" ${a === agentFilter ? "selected" : ""}>${escapeHtml(a)}</option>`)
      .join("");

    const rows = logs
      .map(
        (log) => `
        <tr>
          <td class="mono dim log-time-cell">${escapeHtml(log.timestamp as string)}</td>
          <td><span class="badge badge-purple">${escapeHtml(log.agent_name as string)}</span></td>
          <td class="mono">${escapeHtml(log.action as string)}</td>
          <td class="dim log-detail-cell">${escapeHtml((log.detail as string).slice(0, 200))}</td>
        </tr>`
      )
      .join("");

    const html = layout(
      "Audit Logs",
      `
      <h1>Audit Logs</h1>

      <div class="card mb-16">
        <form method="GET" action="/logs" class="row-gap-12">
          <select name="agent" class="select-input">
            <option value="">All agents</option>
            ${agentOptions}
          </select>
          <input name="action" value="${escapeHtml(actionFilter)}" placeholder="Filter by action..." class="text-input text-input-flex">
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
    `,
      csrfToken,
      cspNonce
    );

    return c.html(html);
  });

  return app;
}
