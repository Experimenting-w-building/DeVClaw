import { Hono } from "hono";
import type Database from "better-sqlite3";
import { layout } from "../views/layout.js";
import { promoteSkill, demoteSkill, deleteSkill } from "../../skills/manager.js";
import { loadConfig } from "../../config.js";

export function skillsRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/skills", (c) => {
    const skills = db
      .prepare("SELECT * FROM skills ORDER BY agent_name, created_at")
      .all() as Record<string, unknown>[];

    const rows = skills
      .map(
        (s) => `
        <tr>
          <td><span class="badge badge-purple">${s.agent_name}</span></td>
          <td class="mono">${s.name}</td>
          <td>${s.description}</td>
          <td>
            <span class="badge ${s.tier === "trusted" ? "badge-green" : "badge-yellow"}">${s.tier}</span>
          </td>
          <td class="dim">${s.last_used_at || "never"}</td>
          <td>
            ${
              s.tier === "sandbox"
                ? `<form method="POST" action="/skills/${s.agent_name}/${s.name}/promote" style="display:inline">
                     <button class="btn btn-primary" type="submit">Promote</button>
                   </form>`
                : `<form method="POST" action="/skills/${s.agent_name}/${s.name}/demote" style="display:inline">
                     <button class="btn btn-outline" type="submit">Demote</button>
                   </form>`
            }
            <form method="POST" action="/skills/${s.agent_name}/${s.name}/delete" style="display:inline;margin-left:8px">
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
    `
    );

    return c.html(html);
  });

  app.post("/skills/:agent/:name/promote", (c) => {
    const { agent, name } = c.req.param();
    const config = loadConfig();
    promoteSkill(db, config.agentsDir, agent, name);
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
