import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import { escapeHtml } from "../../util/html.js";
import { deleteScheduledTask, setScheduledTaskEnabled } from "../../tools/scheduler.js";

export function tasksRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/tasks", (c) => {
    const csrfToken = ((c as any).get?.("csrfToken") as string | undefined) ?? "";
    const cspNonce = ((c as any).get?.("cspNonce") as string | undefined) ?? "";
    const tasks = db
      .prepare("SELECT * FROM scheduled_tasks ORDER BY agent_name, created_at")
      .all() as Record<string, unknown>[];

    const rows = tasks
      .map(
        (t) => `
        <tr>
          <td><span class="badge badge-purple">${escapeHtml(t.agent_name as string)}</span></td>
          <td>${escapeHtml(t.description as string)}</td>
          <td class="mono">${escapeHtml(t.cron_expression as string)}</td>
          <td>
            <span class="badge ${t.enabled ? "badge-green" : "badge-red"}">${t.enabled ? "Active" : "Paused"}</span>
          </td>
          <td class="dim">${escapeHtml((t.last_run_at as string) || "never")}</td>
          <td>
            <form method="POST" action="/tasks/${encodeURIComponent(t.id as string)}/toggle" class="inline-form">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken ?? "")}">
              <button class="btn btn-outline" type="submit">${t.enabled ? "Pause" : "Resume"}</button>
            </form>
            <form method="POST" action="/tasks/${encodeURIComponent(t.id as string)}/delete" class="inline-form ml-8">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken ?? "")}">
              <button class="btn btn-danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>`
      )
      .join("");

    const html = layout(
      "Scheduled Tasks",
      `
      <h1>Scheduled Tasks</h1>
      <div class="card">
        ${
          rows
            ? `<table>
                <thead><tr><th>Agent</th><th>Description</th><th>Schedule</th><th>Status</th><th>Last Run</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
               </table>`
            : '<div class="empty">No scheduled tasks. Agents can create tasks using the schedule_task tool.</div>'
        }
      </div>
    `,
      csrfToken,
      cspNonce
    );

    return c.html(html);
  });

  app.post("/tasks/:id/toggle", (c) => {
    const { id } = c.req.param();
    const current = db
      .prepare("SELECT enabled FROM scheduled_tasks WHERE id = ?")
      .get(id) as { enabled: number } | undefined;
    if (!current) return c.redirect("/tasks");
    setScheduledTaskEnabled(db, id, current.enabled !== 1);
    return c.redirect("/tasks");
  });

  app.post("/tasks/:id/delete", (c) => {
    const { id } = c.req.param();
    deleteScheduledTask(db, id);
    return c.redirect("/tasks");
  });

  return app;
}
