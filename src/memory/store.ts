import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { embed } from "./embedder.js";
import { EMBEDDING_DIMS } from "./embedder.js";

export type MemoryType = "fact" | "summary" | "preference" | "event";

export interface Memory {
  id: string;
  agentName: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  createdAt: string;
  lastAccessedAt: string | null;
}

export interface MemorySearchResult extends Memory {
  distance: number;
}

export async function addMemory(
  db: Database.Database,
  agentName: string,
  content: string,
  memoryType: MemoryType,
  importance = 0.5
): Promise<string> {
  const id = randomUUID();
  const vector = await embed(content);

  db.prepare(`
    INSERT INTO memories (id, agent_name, content, memory_type, importance)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, agentName, content, memoryType, importance);

  const row = db.prepare("SELECT rowid FROM memories WHERE id = ?").get(id) as { rowid: number };

  db.prepare(`
    INSERT INTO memory_vectors (rowid, embedding)
    VALUES (?, ?)
  `).run(row.rowid, Buffer.from(vector.buffer));

  return id;
}

export async function searchMemories(
  db: Database.Database,
  agentName: string,
  query: string,
  limit = 8
): Promise<MemorySearchResult[]> {
  const queryVec = await embed(query);

  const rows = db.prepare(`
    SELECT
      m.id,
      m.agent_name,
      m.content,
      m.memory_type,
      m.importance,
      m.created_at,
      m.last_accessed_at,
      v.distance
    FROM memory_vectors v
    INNER JOIN memories m ON m.rowid = v.rowid
    WHERE m.agent_name = ?
      AND v.embedding MATCH ?
    ORDER BY v.distance
    LIMIT ?
  `).all(agentName, Buffer.from(queryVec.buffer), limit) as Array<Record<string, unknown>>;

  const now = new Date().toISOString();
  const ids = rows.map((r) => r.id as string);
  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE memories SET last_accessed_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
  }

  return rows.map((r) => ({
    id: r.id as string,
    agentName: r.agent_name as string,
    content: r.content as string,
    memoryType: r.memory_type as MemoryType,
    importance: r.importance as number,
    createdAt: r.created_at as string,
    lastAccessedAt: now,
    distance: r.distance as number,
  }));
}

export function getMemoryCount(db: Database.Database, agentName: string): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE agent_name = ?").get(agentName) as { cnt: number };
  return row.cnt;
}

export function pruneOldMemories(
  db: Database.Database,
  agentName: string,
  maxMemories = 500
): number {
  const count = getMemoryCount(db, agentName);
  if (count <= maxMemories) return 0;

  const toDelete = count - maxMemories;

  const rows = db.prepare(`
    SELECT id, rowid FROM memories
    WHERE agent_name = ?
    ORDER BY importance ASC, last_accessed_at ASC NULLS FIRST, created_at ASC
    LIMIT ?
  `).all(agentName, toDelete) as Array<{ id: string; rowid: number }>;

  for (const row of rows) {
    db.prepare("DELETE FROM memory_vectors WHERE rowid = ?").run(row.rowid);
    db.prepare("DELETE FROM memories WHERE id = ?").run(row.id);
  }

  return rows.length;
}

export function listMemories(
  db: Database.Database,
  agentName: string,
  memoryType?: MemoryType,
  limit = 50
): Memory[] {
  const query = memoryType
    ? "SELECT * FROM memories WHERE agent_name = ? AND memory_type = ? ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM memories WHERE agent_name = ? ORDER BY created_at DESC LIMIT ?";
  const params = memoryType ? [agentName, memoryType, limit] : [agentName, limit];

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as string,
    agentName: r.agent_name as string,
    content: r.content as string,
    memoryType: r.memory_type as MemoryType,
    importance: r.importance as number,
    createdAt: r.created_at as string,
    lastAccessedAt: r.last_accessed_at as string | null,
  }));
}
