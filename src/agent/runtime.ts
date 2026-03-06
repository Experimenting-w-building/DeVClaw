import type { ToolSet } from "../types.js";
import type Database from "better-sqlite3";
import type { AgentDefinition } from "../types.js";
import { callLLM } from "./llm.js";
import {
  buildSystemPromptWithMemory,
  loadConversationHistory,
  persistMessage,
} from "./context.js";
import { extractAndStoreMemories } from "../memory/extractor.js";
import { maybeSummarize } from "../memory/summarizer.js";
import { pruneOldMemories } from "../memory/store.js";
import { logAudit } from "../db/index.js";
import { checkRateLimit } from "../security/rate-limiter.js";
import { createLogger } from "../util/logger.js";
import { redactForAudit, redactSensitive } from "../util/redact.js";
import { applyInjectionGuard, checkResponse } from "../security/injection.js";

const log = createLogger("runtime");

export interface AgentRuntime {
  definition: AgentDefinition;
  db: Database.Database;
  agentsDir: string;
  tools: ToolSet;
}

export interface RunResult {
  response: string;
  steps: number;
  tokensUsed: number;
}

export async function runAgent(
  runtime: AgentRuntime,
  userMessage: string
): Promise<RunResult> {
  const { definition, db, agentsDir, tools } = runtime;

  const rateCheck = checkRateLimit(definition.name, "llm_call");
  if (!rateCheck.allowed) {
    return {
      response: `Rate limit reached (${rateCheck.remaining} remaining). Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`,
      steps: 0,
      tokensUsed: 0,
    };
  }

  persistMessage(db, definition.name, "user", userMessage);

  const baseSystem = await buildSystemPromptWithMemory(
    db,
    definition.name,
    definition.personality,
    agentsDir,
    userMessage
  );

  const guard = applyInjectionGuard(baseSystem, userMessage);

  if (guard.inputScan.flagged) {
    logAudit(
      db,
      definition.name,
      "injection_detected",
      `Score: ${guard.inputScan.score}, Patterns: ${guard.inputScan.matches.join(", ")}`
    );
  }

  let history = loadConversationHistory(db, definition.name);
  history = await maybeSummarize(db, definition.name, definition.model, history);

  logAudit(
    db,
    definition.name,
    "llm_call",
    `User: ${String(redactSensitive(userMessage)).slice(0, 200)}`
  );

  const result = await callLLM({
    modelConfig: definition.model,
    system: guard.augmentedSystem,
    messages: history,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    maxSteps: 10,
    onToolCall: (toolName, input) => {
      logAudit(
        db,
        definition.name,
        "tool_call",
        redactForAudit({ tool: toolName, input }, 500)
      );
    },
  });

  let response = result.text || "(no response)";

  const canaryCheck = checkResponse(response, guard.canary);
  if (canaryCheck.leaked) {
    logAudit(db, definition.name, "canary_leak", "LLM response contained canary token");
    response = response.replaceAll(guard.canary, "[REDACTED]");
  }
  persistMessage(db, definition.name, "assistant", response);

  const totalTokens = result.usage.inputTokens + result.usage.outputTokens;
  logAudit(
    db,
    definition.name,
    "llm_response",
    `Tokens: ${totalTokens}, Steps: ${result.steps.length}`
  );

  extractAndStoreMemories(db, definition.name, definition.model, userMessage, response).catch((err) => {
    log.error("Memory extraction failed", { agent: definition.name, error: String(err) });
  });
  pruneOldMemories(db, definition.name);

  return {
    response,
    steps: result.steps.length,
    tokensUsed: totalTokens,
  };
}
