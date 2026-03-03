import { tool } from "../types.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { createSkill, listSkills, getSkill } from "../skills/manager.js";
import { logAudit } from "../db/index.js";

export function createSkillBuilderTool(
  db: Database.Database,
  agentName: string,
  agentsDir: string
) {
  return tool({
    description:
      "Create a new skill (tool) that you can use later. " +
      "Write JavaScript code that reads input from process.env.SKILL_INPUT (JSON) " +
      "and outputs results via console.log(JSON.stringify(result)). " +
      "The skill runs in a container with Node.js 22. " +
      "New skills start in sandbox mode and require human approval to become trusted.",
    inputSchema: z.object({
      name: z
        .string()
        .regex(/^[a-z0-9_-]+$/)
        .describe("Unique skill name (lowercase, hyphens/underscores)"),
      description: z
        .string()
        .min(10)
        .describe("Clear description of what this skill does"),
      inputSchema: z
        .record(z.string(), z.unknown())
        .describe("JSON Schema describing the expected input"),
      code: z
        .string()
        .describe(
          "JavaScript code for the skill. Read input with JSON.parse(process.env.SKILL_INPUT). " +
          "Output with console.log(JSON.stringify(result))."
        ),
    }),
    execute: async ({ name, description, inputSchema, code }) => {
      const existing = getSkill(db, agentName, name);
      const isUpdate = !!existing;

      const skill = createSkill(db, agentsDir, agentName, name, description, inputSchema, code);

      logAudit(
        db,
        agentName,
        isUpdate ? "skill_updated" : "skill_created",
        `Skill: ${name}, Tier: sandbox`
      );

      return {
        message: isUpdate
          ? `Skill "${name}" updated (reset to sandbox for re-approval)`
          : `Skill "${name}" created in sandbox mode`,
        skillId: skill.id,
        tier: "sandbox",
        note: "The skill is active but the owner will need to approve it to promote to trusted tier.",
      };
    },
  });
}

export function createListSkillsTool(db: Database.Database, agentName: string) {
  return tool({
    description: "List all skills available to this agent, showing their tier (sandbox/trusted) and usage.",
    inputSchema: z.object({
      tier: z.enum(["sandbox", "trusted"]).optional().describe("Filter by tier"),
    }),
    execute: async ({ tier }) => {
      const skills = listSkills(db, agentName, tier);

      if (skills.length === 0) {
        return { message: "No skills found.", skills: [] };
      }

      return {
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
          tier: s.tier,
          lastUsed: s.lastUsedAt,
          codeHash: s.codeHash,
        })),
      };
    },
  });
}
