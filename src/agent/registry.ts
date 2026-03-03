import type Database from "better-sqlite3";
import type { ToolSet } from "../types.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AgentDefinitionSchema, type AgentDefinition } from "../types.js";
import { upsertAgent, getAgent, listAgents, logAudit } from "../db/index.js";
import { encrypt } from "../security/crypto.js";
import { loadConfig } from "../config.js";
import { buildToolset } from "../tools/registry.js";
import { subAgentPersonality } from "./prompts.js";
import type { AgentRuntime } from "./runtime.js";

const runtimes = new Map<string, AgentRuntime>();

function setupAgentDirs(agentsDir: string, parsed: AgentDefinition): void {
  const agentDir = join(agentsDir, parsed.name);
  mkdirSync(join(agentDir, "skills", "sandbox"), { recursive: true });
  mkdirSync(join(agentDir, "skills", "trusted"), { recursive: true });

  const memoryPath = join(agentDir, "memory.md");
  if (!existsSync(memoryPath)) {
    writeFileSync(memoryPath, `# ${parsed.displayName} Memory\n\n`);
  }

  const configPath = join(agentDir, "config.json");
  const safeConfig = { ...parsed, telegramBotToken: "(stored encrypted in DB)" };
  writeFileSync(configPath, JSON.stringify(safeConfig, null, 2));
}

export function registerAgent(
  db: Database.Database,
  agentsDir: string,
  definition: AgentDefinition,
  tools: ToolSet = {}
): AgentRuntime {
  const parsed = AgentDefinitionSchema.parse(definition);
  upsertAgent(db, parsed);
  setupAgentDirs(agentsDir, parsed);

  const runtime: AgentRuntime = {
    definition: parsed,
    db,
    agentsDir,
    tools,
  };

  runtimes.set(parsed.name, runtime);
  return runtime;
}

/**
 * Register a new agent at runtime with a raw bot token.
 * Encrypts the token, stores it in DB, builds tools, and returns the runtime.
 * Call startBot() separately after this to start the Telegram bot.
 */
export function registerAgentDynamic(
  db: Database.Database,
  agentsDir: string,
  opts: {
    name: string;
    displayName: string;
    personality: string;
    modelProvider: string;
    modelName: string;
    capabilities: string[];
    rawBotToken: string;
  }
): AgentRuntime {
  const config = loadConfig();
  const encryptedToken = encrypt(opts.rawBotToken, config.masterKey);

  const fullPersonality = subAgentPersonality(opts.name, opts.personality);

  const definition: AgentDefinition = {
    name: opts.name,
    displayName: opts.displayName,
    personality: fullPersonality,
    model: {
      provider: opts.modelProvider as AgentDefinition["model"]["provider"],
      model: opts.modelName,
    },
    telegramBotToken: `db:${opts.name}`,
    secrets: [],
    capabilities: opts.capabilities as AgentDefinition["capabilities"],
  };

  const parsed = AgentDefinitionSchema.parse(definition);
  upsertAgent(db, parsed, encryptedToken);
  setupAgentDirs(agentsDir, parsed);

  const tools = buildToolset(db, parsed, agentsDir);

  const runtime: AgentRuntime = {
    definition: parsed,
    db,
    agentsDir,
    tools,
  };

  runtimes.set(parsed.name, runtime);
  logAudit(db, opts.name, "agent_registered_dynamic", `Display: ${opts.displayName}`);

  return runtime;
}

export function removeRuntime(name: string): boolean {
  return runtimes.delete(name);
}

export function getRuntime(name: string): AgentRuntime | undefined {
  return runtimes.get(name);
}

export function getAllRuntimes(): AgentRuntime[] {
  return Array.from(runtimes.values());
}

export function getAgentDefinition(
  db: Database.Database,
  name: string
): AgentDefinition | null {
  return getAgent(db, name);
}

export function listAgentDefinitions(db: Database.Database): AgentDefinition[] {
  return listAgents(db);
}
