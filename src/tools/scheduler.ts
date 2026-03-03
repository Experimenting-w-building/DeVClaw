import { tool } from "../types.js";
import { z } from "zod";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getRuntime } from "../agent/registry.js";
import { runAgent } from "../agent/runtime.js";
import { logAudit } from "../db/index.js";
import { sendMessage } from "../channels/telegram.js";
import { loadConfig } from "../config.js";

const activeTasks = new Map<string, cron.ScheduledTask>();

export function createSchedulerTool(db: Database.Database, agentName: string) {
  return tool({
    description:
      "Schedule a recurring task. The task will run the given instruction on a cron schedule " +
      "and send results via Telegram. Use standard cron expressions (minute hour day month weekday). " +
      "Examples: '0 9 * * 1-5' (weekdays at 9am), '*/30 * * * *' (every 30 min), '0 8 * * 1' (Mondays at 8am).",
    inputSchema: z.object({
      description: z.string().describe("Human-readable description of what this task does"),
      cronExpression: z.string().describe("Cron expression for the schedule"),
      instruction: z
        .string()
        .describe("The instruction to give the agent when the task runs"),
    }),
    execute: async ({ description, cronExpression, instruction }) => {
      if (!cron.validate(cronExpression)) {
        return { error: `Invalid cron expression: ${cronExpression}` };
      }

      const taskId = randomUUID();

      db.prepare(`
        INSERT INTO scheduled_tasks (id, agent_name, description, cron_expression, tool_name, tool_input)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(taskId, agentName, description, cronExpression, "agent_instruction", JSON.stringify({ instruction }));

      scheduleTask(db, taskId, agentName, cronExpression, instruction);

      logAudit(db, agentName, "task_created", `Task: ${description}, Cron: ${cronExpression}`);

      return {
        message: `Task scheduled: ${description}`,
        taskId,
        cronExpression,
        nextRun: "Will run on next cron match",
      };
    },
  });
}

export function createListTasksTool(db: Database.Database, agentName: string) {
  return tool({
    description: "List all scheduled tasks for this agent.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = db
        .prepare(
          "SELECT * FROM scheduled_tasks WHERE agent_name = ? ORDER BY created_at"
        )
        .all(agentName) as Record<string, unknown>[];

      if (rows.length === 0) {
        return { message: "No scheduled tasks.", tasks: [] };
      }

      return {
        tasks: rows.map((row) => ({
          id: row.id,
          description: row.description,
          cronExpression: row.cron_expression,
          enabled: !!row.enabled,
          lastRun: row.last_run_at,
        })),
      };
    },
  });
}

export function createCancelTaskTool(db: Database.Database, agentName: string) {
  return tool({
    description: "Cancel (delete) a scheduled task by its ID.",
    inputSchema: z.object({
      taskId: z.string().describe("The ID of the task to cancel"),
    }),
    execute: async ({ taskId }) => {
      const existing = activeTasks.get(taskId);
      if (existing) {
        existing.stop();
        activeTasks.delete(taskId);
      }

      const result = db
        .prepare("DELETE FROM scheduled_tasks WHERE id = ? AND agent_name = ?")
        .run(taskId, agentName);

      if (result.changes === 0) {
        return { error: "Task not found" };
      }

      logAudit(db, agentName, "task_cancelled", `Task: ${taskId}`);
      return { message: "Task cancelled successfully" };
    },
  });
}

function scheduleTask(
  db: Database.Database,
  taskId: string,
  agentName: string,
  cronExpression: string,
  instruction: string
): void {
  const task = cron.schedule(cronExpression, async () => {
    const runtime = getRuntime(agentName);
    if (!runtime) {
      console.error(`[scheduler] No runtime for agent ${agentName}, skipping task ${taskId}`);
      return;
    }

    logAudit(db, agentName, "task_started", `Task: ${taskId}`);

    try {
      const result = await runAgent(runtime, `[Scheduled task]: ${instruction}`);

      db.prepare(
        "UPDATE scheduled_tasks SET last_run_at = datetime('now') WHERE id = ?"
      ).run(taskId);

      const config = loadConfig();
      try {
        await sendMessage(agentName, config.ownerChatId, `📋 Scheduled task result:\n\n${result.response}`);
      } catch {
        console.log(`[scheduler] Task ${taskId} completed but could not send Telegram message`);
      }

      logAudit(db, agentName, "task_completed", `Task: ${taskId}, Tokens: ${result.tokensUsed}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logAudit(db, agentName, "task_failed", `Task: ${taskId}, Error: ${msg}`);
      console.error(`[scheduler] Task ${taskId} failed:`, msg);
    }
  });

  activeTasks.set(taskId, task);
}

export function loadAndScheduleAllTasks(db: Database.Database): void {
  const rows = db
    .prepare("SELECT * FROM scheduled_tasks WHERE enabled = 1")
    .all() as Record<string, unknown>[];

  for (const row of rows) {
    const input = JSON.parse(row.tool_input as string);
    scheduleTask(
      db,
      row.id as string,
      row.agent_name as string,
      row.cron_expression as string,
      input.instruction
    );
  }

  if (rows.length > 0) {
    console.log(`[scheduler] Loaded ${rows.length} scheduled task(s)`);
  }
}

export function stopAllTasks(): void {
  for (const [id, task] of activeTasks) {
    task.stop();
  }
  activeTasks.clear();
}
