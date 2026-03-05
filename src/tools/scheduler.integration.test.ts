import Database from "better-sqlite3";
import { describe, it, expect, afterEach } from "vitest";
import { MIGRATIONS } from "../db/schema.js";
import {
  deleteScheduledTask,
  getActiveTaskCount,
  loadAndScheduleAllTasks,
  setScheduledTaskEnabled,
  stopAllTasks,
} from "./scheduler.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const migration of MIGRATIONS) {
    try {
      db.exec(migration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw err;
    }
  }
  db.prepare(
    "INSERT INTO agents (name, display_name, personality, model_provider, model_name, telegram_bot_token, secrets, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("main", "Main", "Test", "anthropic", "claude-sonnet-4-20250514", "env:MAIN_BOT_TOKEN", "[]", "[]");
  return db;
}

afterEach(() => {
  stopAllTasks();
});

describe("scheduler lifecycle sync", () => {
  it("keeps active cron map in sync with DB toggles/deletes", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO scheduled_tasks (id, agent_name, description, cron_expression, tool_name, tool_input, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)"
    ).run(
      "task-1",
      "main",
      "Test task",
      "0 0 1 1 *",
      "agent_instruction",
      JSON.stringify({ instruction: "say hi" })
    );

    loadAndScheduleAllTasks(db);
    expect(getActiveTaskCount()).toBe(1);

    const paused = setScheduledTaskEnabled(db, "task-1", false);
    expect(paused.ok).toBe(true);
    expect(paused.enabled).toBe(false);
    expect(getActiveTaskCount()).toBe(0);
    const rowAfterPause = db.prepare("SELECT enabled FROM scheduled_tasks WHERE id = ?").get("task-1") as { enabled: number };
    expect(rowAfterPause.enabled).toBe(0);

    const resumed = setScheduledTaskEnabled(db, "task-1", true);
    expect(resumed.ok).toBe(true);
    expect(resumed.enabled).toBe(true);
    expect(getActiveTaskCount()).toBe(1);

    const deleted = deleteScheduledTask(db, "task-1");
    expect(deleted.ok).toBe(true);
    expect(getActiveTaskCount()).toBe(0);
    const rowAfterDelete = db.prepare("SELECT id FROM scheduled_tasks WHERE id = ?").get("task-1");
    expect(rowAfterDelete).toBeUndefined();

    db.close();
  });

  it("skips malformed scheduled task payloads during startup", () => {
    const db = createTestDb();
    db.prepare(
      "INSERT INTO scheduled_tasks (id, agent_name, description, cron_expression, tool_name, tool_input, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)"
    ).run("task-bad", "main", "Broken", "0 0 1 1 *", "agent_instruction", "{");

    expect(() => loadAndScheduleAllTasks(db)).not.toThrow();
    expect(getActiveTaskCount()).toBe(0);

    db.close();
  });
});
