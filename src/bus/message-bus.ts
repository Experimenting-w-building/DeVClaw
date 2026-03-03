import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getRuntime, getAllRuntimes } from "../agent/registry.js";
import { runAgent } from "../agent/runtime.js";
import { logAudit } from "../db/index.js";
import type { DelegationRequest, DelegationResult } from "./types.js";

const MAX_DELEGATION_DEPTH = 2;
const activeDelegations = new Map<string, number>(); // requestId -> depth

export async function delegate(
  db: Database.Database,
  fromAgent: string,
  toAgent: string,
  task: string,
  opts: { waitForResult?: boolean; currentDepth?: number } = {}
): Promise<DelegationResult> {
  const { waitForResult = true, currentDepth = 0 } = opts;

  if (currentDepth >= MAX_DELEGATION_DEPTH) {
    return {
      requestId: randomUUID(),
      fromAgent,
      toAgent,
      result: `Delegation depth limit (${MAX_DELEGATION_DEPTH}) reached. Cannot delegate further.`,
      success: false,
      durationMs: 0,
    };
  }

  const targetRuntime = getRuntime(toAgent);
  if (!targetRuntime) {
    return {
      requestId: randomUUID(),
      fromAgent,
      toAgent,
      result: `Agent "${toAgent}" not found or not running.`,
      success: false,
      durationMs: 0,
    };
  }

  const requestId = randomUUID();
  const startTime = Date.now();

  logAudit(db, fromAgent, "delegation_sent", `To: ${toAgent}, Task: ${task.slice(0, 200)}`);
  logAudit(db, toAgent, "delegation_received", `From: ${fromAgent}, Task: ${task.slice(0, 200)}`);

  db.prepare(`
    INSERT INTO delegations (id, from_agent, to_agent, task)
    VALUES (?, ?, ?, ?)
  `).run(requestId, fromAgent, toAgent, task);

  try {
    activeDelegations.set(requestId, currentDepth + 1);
    const result = await runAgent(targetRuntime, `[Delegated task from ${fromAgent}]: ${task}`);
    const durationMs = Date.now() - startTime;

    db.prepare(`
      UPDATE delegations SET result = ?, success = 1, duration_ms = ?
      WHERE id = ?
    `).run(result.response, durationMs, requestId);

    logAudit(db, fromAgent, "delegation_completed", `From: ${toAgent}, Duration: ${durationMs}ms`);

    return {
      requestId,
      fromAgent,
      toAgent,
      result: result.response,
      success: true,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);

    db.prepare(`
      UPDATE delegations SET result = ?, success = 0, duration_ms = ?
      WHERE id = ?
    `).run(errMsg, durationMs, requestId);

    logAudit(db, fromAgent, "delegation_failed", `To: ${toAgent}, Error: ${errMsg.slice(0, 200)}`);

    return {
      requestId,
      fromAgent,
      toAgent,
      result: `Delegation to ${toAgent} failed: ${errMsg}`,
      success: false,
      durationMs,
    };
  } finally {
    activeDelegations.delete(requestId);
  }
}

export function listAvailableAgents(excludeAgent?: string): string[] {
  const runtimes = getAllRuntimes();
  return runtimes
    .map((r) => r.definition.name)
    .filter((name) => name !== excludeAgent);
}
