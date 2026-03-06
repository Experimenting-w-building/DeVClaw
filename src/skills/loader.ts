import { z } from "zod";
import { tool, type ToolSet } from "../types.js";
import type Database from "better-sqlite3";
import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { execInContainer, isDockerAvailable } from "../container/docker.js";
import { listSkills, getSkillDir, verifySkillSignature } from "./manager.js";
import { logAudit } from "../db/index.js";
import { redactForAudit } from "../util/redact.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("skill-loader");

export function loadSkillsAsTools(
  db: Database.Database,
  agentName: string,
  agentsDir: string,
  masterKey?: string
): ToolSet {
  const skills = listSkills(db, agentName);
  const tools: ToolSet = {};

  for (const skill of skills) {
    const skillDir = join(
      getSkillDir(agentsDir, agentName, skill.tier),
      skill.name
    );

    if (!existsSync(join(skillDir, "index.js"))) continue;

    if (skill.tier === "trusted" && masterKey) {
      const codePath = join(skillDir, "index.js");
      const metaPath = join(skillDir, "metadata.json");
      const code = readFileSync(codePath, "utf-8");
      const meta = existsSync(metaPath) ? readFileSync(metaPath, "utf-8") : "";

      if (!skill.signature) {
        log.warn("Trusted skill has no signature, skipping", { agent: agentName, skill: skill.name });
        logAudit(db, agentName, "skill_integrity_fail", `Skill ${skill.name}: missing signature`);
        continue;
      }

      if (!verifySkillSignature(code, meta, masterKey, skill.signature)) {
        log.warn("Trusted skill signature mismatch -- possible tampering", { agent: agentName, skill: skill.name });
        logAudit(db, agentName, "skill_integrity_fail", `Skill ${skill.name}: signature mismatch`);
        continue;
      }
    }

    const zodSchema = z.object({
      input: z.record(z.string(), z.unknown()).describe("Input matching the skill's schema"),
    });

    const tierLabel = skill.tier === "sandbox" ? "[SANDBOX] " : "";

    tools[`skill_${skill.name}`] = tool({
      description: `${tierLabel}${skill.description}`,
      inputSchema: zodSchema,
      execute: async ({ input }) => {
        if (!(await isDockerAvailable())) {
          return { error: "Docker not available" };
        }

        logAudit(
          db,
          agentName,
          `skill_exec_${skill.tier}`,
          `Skill: ${skill.name}, Input: ${redactForAudit(input, 300)}`
        );

        const agentWorkDir = resolve(agentsDir, agentName);
        const result = await execInContainer({
          agentName,
          command: ["node", "/skill/index.js"],
          mounts: [
            { hostPath: skillDir, containerPath: "/skill", readOnly: true },
            { hostPath: agentWorkDir, containerPath: "/workspace", readOnly: false },
          ],
          env: { SKILL_INPUT: JSON.stringify(input) },
          timeoutMs: 30_000,
        });

        db.prepare(
          "UPDATE skills SET last_used_at = datetime('now') WHERE agent_name = ? AND name = ?"
        ).run(agentName, skill.name);

        if (result.timedOut) {
          return { error: "Skill execution timed out" };
        }

        if (result.exitCode !== 0) {
          return { error: result.stderr || "Skill execution failed", exitCode: result.exitCode };
        }

        try {
          return JSON.parse(result.stdout);
        } catch {
          return { output: result.stdout };
        }
      },
    });
  }

  return tools;
}
