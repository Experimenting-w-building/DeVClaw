import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import { promoteSkill, demoteSkill, deleteSkill } from "../../skills/manager.js";
import { loadConfig } from "../../config.js";
import { escapeHtml } from "../../util/html.js";

export function skillsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/skills", (c) => {
    const csrfToken = ((c as any).get?.("csrfToken") as string | undefined) ?? "";
    const cspNonce = ((c as any).get?.("cspNonce") as string | undefined) ?? "";
    const skills = db
      .prepare("SELECT * FROM skills ORDER BY agent_name, created_at")
      .all() as Record<string, unknown>[];

    const rows = skills
      .map(
        (s) => `
        <tr>
          <td><span class="badge badge-purple">${escapeHtml(s.agent_name as string)}</span></td>
          <td class="mono">${escapeHtml(s.name as string)}</td>
          <td>${escapeHtml(s.description as string)}</td>
          <td>
            <span class="badge ${s.tier === "trusted" ? "badge-green" : "badge-yellow"}">${escapeHtml(s.tier as string)}</span>
          </td>
          <td class="dim">${escapeHtml((s.last_used_at as string) || "never")}</td>
          <td>
            ${
              s.tier === "sandbox"
                ? `<form method="POST" action="/skills/${encodeURIComponent(s.agent_name as string)}/${encodeURIComponent(s.name as string)}/promote" class="inline-form">
                     <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken ?? "")}">
                     <button class="btn btn-primary" type="submit">Promote</button>
                   </form>`
                : `<form method="POST" action="/skills/${encodeURIComponent(s.agent_name as string)}/${encodeURIComponent(s.name as string)}/demote" class="inline-form">
                     <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken ?? "")}">
                     <button class="btn btn-outline" type="submit">Demote</button>
                   </form>`
            }
            <form method="POST" action="/skills/${encodeURIComponent(s.agent_name as string)}/${encodeURIComponent(s.name as string)}/delete" class="inline-form ml-8">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken ?? "")}">
              <button class="btn btn-danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>`
      )
      .join("");

    const html = layout(
      "Skills",
      `
      <h1>Skills</h1>
      <div class="card">
        ${
          rows
            ? `<table>
                <thead><tr><th>Agent</th><th>Name</th><th>Description</th><th>Tier</th><th>Last Used</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
               </table>`
            : '<div class="empty">No skills created yet. Agents will create skills as needed.</div>'
        }
      </div>
    `,
      csrfToken,
      cspNonce
    );

    return c.html(html);
  });

  app.post("/skills/:agent/:name/promote", (c) => {
    const { agent, name } = c.req.param();
    const config = loadConfig();
    promoteSkill(db, config.agentsDir, agent, name, config.masterKey);
    return c.redirect("/skills");
  });

  app.post("/skills/:agent/:name/demote", (c) => {
    const { agent, name } = c.req.param();
    demoteSkill(db, agent, name);
    return c.redirect("/skills");
  });

  app.post("/skills/:agent/:name/delete", (c) => {
    const { agent, name } = c.req.param();
    deleteSkill(db, agent, name);
    return c.redirect("/skills");
  });

  return app;
}
