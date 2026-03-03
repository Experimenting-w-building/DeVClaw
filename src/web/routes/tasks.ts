import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";

export function tasksRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/tasks", (c) => {
    const tasks = db
      .prepare("SELECT * FROM scheduled_tasks ORDER BY agent_name, created_at")
      .all() as Record<string, unknown>[];

    const rows = tasks
      .map(
        (t) => `
        <tr>
          <td><span class="badge badge-purple">${t.agent_name}</span></td>
          <td>${t.description}</td>
          <td class="mono">${t.cron_expression}</td>
          <td>
            <span class="badge ${t.enabled ? "badge-green" : "badge-red"}">${t.enabled ? "Active" : "Paused"}</span>
          </td>
          <td class="dim">${t.last_run_at || "never"}</td>
          <td>
            <form method="POST" action="/tasks/${t.id}/toggle" style="display:inline">
              <button class="btn btn-outline" type="submit">${t.enabled ? "Pause" : "Resume"}</button>
            </form>
            <form method="POST" action="/tasks/${t.id}/delete" style="display:inline;margin-left:8px">
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
    `
    );

    return c.html(html);
  });

  app.post("/tasks/:id/toggle", (c) => {
    const { id } = c.req.param();
    db.prepare(
      "UPDATE scheduled_tasks SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?"
    ).run(id);
    return c.redirect("/tasks");
  });

  app.post("/tasks/:id/delete", (c) => {
    const { id } = c.req.param();
    db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
    return c.redirect("/tasks");
  });

  return app;
}
