import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { randomUUID } from "node:crypto";
import { MIGRATIONS } from "./schema.js";
import type {
  AgentDefinition,
  AgentMessage,
  AuditLogEntry,
  SkillDefinition,
  ScheduledTask,
} from "../types.js";

let _db: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (_db) return _db;

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  sqliteVec.load(_db);

  for (const migration of MIGRATIONS) {
    try {
      _db.exec(migration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw err;
    }
  }

  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
      embedding float[384]
    )
  `);

  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

// --- Agents ---

export function upsertAgent(
  db: Database.Database,
  def: AgentDefinition,
  encryptedBotToken?: string
): void {
  db.prepare(`
    INSERT INTO agents (name, display_name, personality, model_provider, model_name, telegram_bot_token, encrypted_bot_token, secrets, capabilities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      display_name = excluded.display_name,
      personality = excluded.personality,
      model_provider = excluded.model_provider,
      model_name = excluded.model_name,
      telegram_bot_token = excluded.telegram_bot_token,
      encrypted_bot_token = COALESCE(excluded.encrypted_bot_token, agents.encrypted_bot_token),
      secrets = excluded.secrets,
      capabilities = excluded.capabilities
  `).run(
    def.name,
    def.displayName,
    def.personality,
    def.model.provider,
    def.model.model,
    def.telegramBotToken,
    encryptedBotToken ?? null,
    JSON.stringify(def.secrets),
    JSON.stringify(def.capabilities),
  );
}

function rowToAgentDef(row: Record<string, unknown>): AgentDefinition {
  return {
    name: row.name as string,
    displayName: row.display_name as string,
    personality: row.personality as string,
    model: {
      provider: row.model_provider as AgentDefinition["model"]["provider"],
      model: row.model_name as string,
    },
    telegramBotToken: row.telegram_bot_token as string,
    secrets: JSON.parse(row.secrets as string),
    capabilities: JSON.parse(row.capabilities as string),
  };
}

export function getAgent(db: Database.Database, name: string): AgentDefinition | null {
  const row = db.prepare("SELECT * FROM agents WHERE name = ? AND enabled = 1").get(name) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToAgentDef(row);
}

export function getAgentEncryptedToken(db: Database.Database, name: string): string | null {
  const row = db.prepare("SELECT encrypted_bot_token FROM agents WHERE name = ?").get(name) as { encrypted_bot_token: string | null } | undefined;
  return row?.encrypted_bot_token ?? null;
}

export function listAgents(db: Database.Database): AgentDefinition[] {
  const rows = db.prepare("SELECT * FROM agents WHERE enabled = 1 ORDER BY created_at").all() as Record<string, unknown>[];
  return rows.map(rowToAgentDef);
}

// --- Pending Agents ---

export interface PendingAgent {
  name: string;
  displayName: string;
  personality: string;
  modelProvider: string;
  modelName: string;
  capabilities: string[];
  proposedBy: string;
  createdAt: string;
}

export function createPendingAgent(
  db: Database.Database,
  pending: Omit<PendingAgent, "createdAt">
): void {
  db.prepare(`
    INSERT INTO pending_agents (name, display_name, personality, model_provider, model_name, capabilities, proposed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      display_name = excluded.display_name,
      personality = excluded.personality,
      model_provider = excluded.model_provider,
      model_name = excluded.model_name,
      capabilities = excluded.capabilities,
      proposed_by = excluded.proposed_by
  `).run(
    pending.name,
    pending.displayName,
    pending.personality,
    pending.modelProvider,
    pending.modelName,
    JSON.stringify(pending.capabilities),
    pending.proposedBy,
  );
}

export function getPendingAgent(db: Database.Database, name: string): PendingAgent | null {
  const row = db.prepare("SELECT * FROM pending_agents WHERE name = ?").get(name) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    name: row.name as string,
    displayName: row.display_name as string,
    personality: row.personality as string,
    modelProvider: row.model_provider as string,
    modelName: row.model_name as string,
    capabilities: JSON.parse(row.capabilities as string),
    proposedBy: row.proposed_by as string,
    createdAt: row.created_at as string,
  };
}

export function listPendingAgents(db: Database.Database): PendingAgent[] {
  const rows = db.prepare("SELECT * FROM pending_agents ORDER BY created_at").all() as Record<string, unknown>[];
  return rows.map((row) => ({
    name: row.name as string,
    displayName: row.display_name as string,
    personality: row.personality as string,
    modelProvider: row.model_provider as string,
    modelName: row.model_name as string,
    capabilities: JSON.parse(row.capabilities as string),
    proposedBy: row.proposed_by as string,
    createdAt: row.created_at as string,
  }));
}

export function deletePendingAgent(db: Database.Database, name: string): boolean {
  return db.prepare("DELETE FROM pending_agents WHERE name = ?").run(name).changes > 0;
}

// --- Messages ---

export function saveMessage(db: Database.Database, msg: Omit<AgentMessage, "id">): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO messages (id, agent_name, role, content, timestamp) VALUES (?, ?, ?, ?, ?)"
  ).run(id, msg.agentName, msg.role, msg.content, msg.timestamp);
  return id;
}

export function getRecentMessages(
  db: Database.Database,
  agentName: string,
  limit = 50
): AgentMessage[] {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE agent_name = ? ORDER BY timestamp DESC LIMIT ?"
    )
    .all(agentName, limit) as Record<string, unknown>[];

  return rows.reverse().map((row) => ({
    id: row.id as string,
    agentName: row.agent_name as string,
    role: row.role as AgentMessage["role"],
    content: row.content as string,
    timestamp: row.timestamp as string,
  }));
}

export function getMessageCount(db: Database.Database, agentName: string): number {
  const row = db
    .prepare("SELECT COUNT(*) as c FROM messages WHERE agent_name = ?")
    .get(agentName) as { c: number };
  return row.c;
}

export function getOlderMessagesForSummary(
  db: Database.Database,
  agentName: string,
  keepRecent: number,
  olderLimit = 200
): AgentMessage[] {
  const rows = db
    .prepare(`
      SELECT * FROM messages
      WHERE agent_name = ?
        AND id NOT IN (
          SELECT id FROM messages
          WHERE agent_name = ?
          ORDER BY timestamp DESC
          LIMIT ?
        )
      ORDER BY timestamp ASC
      LIMIT ?
    `)
    .all(agentName, agentName, keepRecent, olderLimit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    agentName: row.agent_name as string,
    role: row.role as AgentMessage["role"],
    content: row.content as string,
    timestamp: row.timestamp as string,
  }));
}

export function pruneMessagesKeepRecent(
  db: Database.Database,
  agentName: string,
  keepRecent: number
): void {
  db.prepare(`
    DELETE FROM messages
    WHERE agent_name = ?
      AND id NOT IN (
        SELECT id FROM messages
        WHERE agent_name = ?
        ORDER BY timestamp DESC
        LIMIT ?
      )
  `).run(agentName, agentName, keepRecent);
}

// --- Audit Log ---

export function logAudit(
  db: Database.Database,
  agentName: string,
  action: string,
  detail = ""
): void {
  db.prepare(
    "INSERT INTO audit_log (agent_name, action, detail) VALUES (?, ?, ?)"
  ).run(agentName, action, detail);
}

export function getAuditLog(
  db: Database.Database,
  agentName?: string,
  limit = 100
): AuditLogEntry[] {
  const query = agentName
    ? "SELECT * FROM audit_log WHERE agent_name = ? ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?";
  const params = agentName ? [agentName, limit] : [limit];
  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    agentName: row.agent_name as string,
    action: row.action as string,
    detail: row.detail as string,
    timestamp: row.timestamp as string,
  }));
}
