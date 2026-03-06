import { tool } from "../types.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { createPendingAgent, getPendingAgent, getAgent } from "../db/index.js";
import { logAudit } from "../db/index.js";
import { hasChannel } from "../channels/router.js";

export function createProposeAgentTool(db: Database.Database, ownerAgentName: string) {
  return tool({
    description:
      "Propose creating a new specialist sub-agent. The agent won't be created immediately -- " +
      "the owner must approve it via messaging or the web dashboard. " +
      "Use this when a task would benefit from a dedicated specialist with its own personality, skills, and memory.",
    inputSchema: z.object({
      name: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .describe("Short lowercase name for the agent (e.g., 'trader', 'researcher', 'devops')"),
      displayName: z.string().describe("Human-friendly display name (e.g., 'Trading Agent')"),
      personality: z
        .string()
        .min(50)
        .describe("Detailed personality and instructions for the agent. Be specific about its expertise, tone, and operating rules."),
      modelProvider: z
        .enum(["anthropic", "openai", "google"])
        .default("anthropic")
        .describe("LLM provider for this agent"),
      modelName: z
        .string()
        .default("claude-sonnet-4-20250514")
        .describe("Model name to use"),
      capabilities: z
        .array(z.enum(["shell", "browser", "filesystem", "scheduler", "skill-builder"]))
        .default(["shell", "browser", "filesystem", "scheduler", "skill-builder"])
        .describe("Which tools the agent should have access to"),
    }),
    execute: async ({ name, displayName, personality, modelProvider, modelName, capabilities }) => {
      const existingAgent = getAgent(db, name);
      if (existingAgent) {
        return {
          error: `An agent named "${name}" already exists.`,
          suggestion: "Choose a different name.",
        };
      }

      const existingPending = getPendingAgent(db, name);
      if (existingPending) {
        const hint = hasChannel("telegram")
          ? `Reply with: /approve ${name} <bot_token>`
          : `Approve via dashboard: /dashboard > Agents`;
        return {
          message: `A proposal for "${name}" already exists and is awaiting approval.`,
          instructions: hint,
        };
      }

      createPendingAgent(db, {
        name,
        displayName,
        personality,
        modelProvider,
        modelName,
        capabilities,
        proposedBy: ownerAgentName,
      });

      logAudit(db, ownerAgentName, "agent_proposed", `Name: ${name}, Display: ${displayName}`);

      const instructions: string[] = [];
      if (hasChannel("telegram")) {
        instructions.push(
          `1. Create a Telegram bot via @BotFather`,
          `2. Copy the bot token`,
          `3. Reply here with: /approve ${name} <bot_token>`,
          `Or to reject: /reject ${name}`,
        );
      } else {
        instructions.push(
          `1. Go to the web dashboard`,
          `2. Navigate to the Agents section`,
          `3. Approve "${name}" from the pending list`,
          `(Optional: provide a Telegram bot token to give the agent its own Telegram bot)`,
        );
      }

      return {
        message: `Agent "${displayName}" proposed successfully. Awaiting owner approval.`,
        name,
        instructions,
        personality: personality.slice(0, 200) + "...",
        capabilities,
      };
    },
  });
}
