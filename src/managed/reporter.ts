import type Database from "better-sqlite3";
import { createLogger } from "../util/logger.js";
import { getAllRuntimes } from "../agent/registry.js";
import { getActiveChannels } from "../channels/router.js";

const log = createLogger("managed");

const REPORT_INTERVAL_MS = 60_000;
let reportTimer: ReturnType<typeof setInterval> | null = null;
const startedAt = Date.now();

interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
  toolExecutions: number;
}

function collectUsageSinceLastReport(db: Database.Database, since: string): UsageSnapshot {
  const rows = db
    .prepare(
      `SELECT action, detail FROM audit_log WHERE timestamp > ? AND action IN ('llm_call', 'tool_executed')`
    )
    .all(since) as { action: string; detail: string }[];

  let inputTokens = 0;
  let outputTokens = 0;
  let llmCalls = 0;
  let toolExecutions = 0;

  for (const row of rows) {
    if (row.action === "llm_call") {
      llmCalls++;
      const inMatch = row.detail.match(/Input:\s*(\d+)/);
      const outMatch = row.detail.match(/Output:\s*(\d+)/);
      if (inMatch) inputTokens += Number(inMatch[1]);
      if (outMatch) outputTokens += Number(outMatch[1]);
    } else if (row.action === "tool_executed") {
      toolExecutions++;
    }
  }

  return { inputTokens, outputTokens, llmCalls, toolExecutions };
}

function buildReport(db: Database.Database, instanceId: string, since: string) {
  const usage = collectUsageSinceLastReport(db, since);
  const runtimes = getAllRuntimes();
  const channels = getActiveChannels();
  const memUsage = process.memoryUsage();

  return {
    instanceId,
    timestamp: new Date().toISOString(),
    health: {
      uptimeMs: Date.now() - startedAt,
      memoryMb: Math.round(memUsage.rss / 1024 / 1024),
      agentCount: runtimes.length,
      channels,
    },
    usage,
  };
}

export function startReporter(
  db: Database.Database,
  callbackUrl: string,
  instanceId: string,
  token: string
): void {
  let lastReportTime = new Date().toISOString();

  async function sendReport() {
    const since = lastReportTime;
    lastReportTime = new Date().toISOString();

    const report = buildReport(db, instanceId, since);

    try {
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(report),
      });

      if (!res.ok) {
        log.warn("Health report rejected by control plane", {
          status: res.status,
        });
      }
    } catch (err) {
      log.warn("Failed to send health report", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  sendReport().catch(() => {});

  reportTimer = setInterval(() => {
    sendReport().catch(() => {});
  }, REPORT_INTERVAL_MS);

  log.info("Managed mode reporter started", { intervalMs: REPORT_INTERVAL_MS });
}

export function stopReporter(): void {
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
    log.info("Managed mode reporter stopped");
  }
}
