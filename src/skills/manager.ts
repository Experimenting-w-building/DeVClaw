import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { SkillTier, SkillDefinition } from "../types.js";
import { SkillMetadataSchema } from "./types.js";

export function getSkillDir(agentsDir: string, agentName: string, tier: SkillTier): string {
  return join(agentsDir, agentName, "skills", tier);
}

export function createSkill(
  db: Database.Database,
  agentsDir: string,
  agentName: string,
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  code: string
): SkillDefinition {
  const metadata = SkillMetadataSchema.parse({ name, description, inputSchema });
  const codeHash = createHash("sha256").update(code).digest("hex").slice(0, 16);

  const skillDir = join(getSkillDir(agentsDir, agentName, "sandbox"), name);
  mkdirSync(skillDir, { recursive: true });

  writeFileSync(join(skillDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  writeFileSync(join(skillDir, "index.js"), code);

  const id = randomUUID();
  const skill: SkillDefinition = {
    id,
    agentName,
    name,
    description,
    inputSchema,
    codeHash,
    tier: "sandbox",
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  db.prepare(`
    INSERT INTO skills (id, agent_name, name, description, input_schema, code_hash, tier)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_name, name) DO UPDATE SET
      description = excluded.description,
      input_schema = excluded.input_schema,
      code_hash = excluded.code_hash,
      tier = 'sandbox'
  `).run(id, agentName, name, description, JSON.stringify(inputSchema), codeHash, "sandbox");

  return skill;
}

export function promoteSkill(
  db: Database.Database,
  agentsDir: string,
  agentName: string,
  skillName: string
): boolean {
  const sandboxDir = join(getSkillDir(agentsDir, agentName, "sandbox"), skillName);
  const trustedDir = join(getSkillDir(agentsDir, agentName, "trusted"), skillName);

  if (!existsSync(sandboxDir)) return false;

  mkdirSync(trustedDir, { recursive: true });

  for (const file of readdirSync(sandboxDir)) {
    const content = readFileSync(join(sandboxDir, file));
    writeFileSync(join(trustedDir, file), content);
  }

  db.prepare("UPDATE skills SET tier = 'trusted' WHERE agent_name = ? AND name = ?").run(
    agentName,
    skillName
  );

  return true;
}

export function demoteSkill(
  db: Database.Database,
  agentName: string,
  skillName: string
): boolean {
  const result = db
    .prepare("UPDATE skills SET tier = 'sandbox' WHERE agent_name = ? AND name = ?")
    .run(agentName, skillName);
  return result.changes > 0;
}

export function deleteSkill(
  db: Database.Database,
  agentName: string,
  skillName: string
): boolean {
  const result = db
    .prepare("DELETE FROM skills WHERE agent_name = ? AND name = ?")
    .run(agentName, skillName);
  return result.changes > 0;
}

export function listSkills(
  db: Database.Database,
  agentName: string,
  tier?: SkillTier
): SkillDefinition[] {
  const query = tier
    ? "SELECT * FROM skills WHERE agent_name = ? AND tier = ? ORDER BY created_at"
    : "SELECT * FROM skills WHERE agent_name = ? ORDER BY created_at";
  const params = tier ? [agentName, tier] : [agentName];
  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    agentName: row.agent_name as string,
    name: row.name as string,
    description: row.description as string,
    inputSchema: JSON.parse(row.input_schema as string),
    codeHash: row.code_hash as string,
    tier: row.tier as SkillTier,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string | null,
  }));
}

export function getSkill(
  db: Database.Database,
  agentName: string,
  skillName: string
): SkillDefinition | null {
  const row = db
    .prepare("SELECT * FROM skills WHERE agent_name = ? AND name = ?")
    .get(agentName, skillName) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    agentName: row.agent_name as string,
    name: row.name as string,
    description: row.description as string,
    inputSchema: JSON.parse(row.input_schema as string),
    codeHash: row.code_hash as string,
    tier: row.tier as SkillTier,
    createdAt: row.created_at as string,
    lastUsedAt: row.last_used_at as string | null,
  };
}
