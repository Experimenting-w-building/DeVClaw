import { tool } from "../types.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { delegate } from "../bus/message-bus.js";
import { getAllRuntimes } from "../agent/registry.js";

export function createDelegateTool(db: Database.Database, ownerAgentName: string) {
  return tool({
    description:
      "Delegate a task to a specialist sub-agent and get a result. " +
      "Use this when a task falls within another agent's expertise. " +
      "Call with agent name and task description. The list of available agents is checked at call time.",
    inputSchema: z.object({
      agent: z.string().describe(
        "Name of the sub-agent to delegate to. Use list_agents first if unsure which agents are available."
      ),
      task: z.string().describe("Clear description of what the sub-agent should do"),
    }),
    execute: async ({ agent, task }) => {
      // Dynamic lookup at call time so newly created agents are discoverable
      const available = getAllRuntimes()
        .filter((r) => r.definition.name !== ownerAgentName)
        .map((r) => r.definition.name);

      if (!available.includes(agent)) {
        return (
          `Agent "${agent}" not found. Available agents: ` +
          (available.length > 0 ? available.join(", ") : "(none)")
        );
      }

      const result = await delegate(db, ownerAgentName, agent, task);
      if (result.success) {
        return `[${agent} responded in ${result.durationMs}ms]:\n${result.result}`;
      }
      return `[Delegation to ${agent} failed]: ${result.result}`;
    },
  });
}

export function createListAgentsTool(ownerAgentName: string) {
  return tool({
    description: "List all currently active agents in the team.",
    inputSchema: z.object({}),
    execute: async () => {
      const runtimes = getAllRuntimes();
      return {
        agents: runtimes.map((r) => ({
          name: r.definition.name,
          displayName: r.definition.displayName,
          model: `${r.definition.model.provider}/${r.definition.model.model}`,
          capabilities: r.definition.capabilities,
          isYou: r.definition.name === ownerAgentName,
        })),
      };
    },
  });
}
