import type { ToolSet } from "../types.js";
import type Database from "better-sqlite3";
import type { AgentDefinition } from "../types.js";
import { createDelegateTool, createListAgentsTool } from "./delegate.js";
import { createShellTool } from "./shell.js";
import { createFilesystemReadTool, createFilesystemWriteTool } from "./filesystem.js";
import { createBrowserTool } from "./browser.js";
import { createSkillBuilderTool, createListSkillsTool } from "./skill-builder.js";
import { createSchedulerTool, createListTasksTool, createCancelTaskTool } from "./scheduler.js";
import { createProposeAgentTool } from "./propose-agent.js";
import { loadSkillsAsTools } from "../skills/loader.js";

let _mcpTools: ToolSet = {};
let _mcpPolicies: Record<string, string[] | undefined> = {};

function canUseMCPTools(agentName: string): boolean {
  const allowedAgents = (process.env.MCP_TOOL_AGENTS ?? "main")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowedAgents.includes(agentName);
}

export function setMCPTools(tools: ToolSet): void {
  _mcpTools = tools;
  if (Object.keys(tools).length === 0) {
    _mcpPolicies = {};
  }
}

export function setMCPToolPolicies(policies: Record<string, string[] | undefined>): void {
  _mcpPolicies = policies;
}

export function buildToolset(
  db: Database.Database,
  definition: AgentDefinition,
  agentsDir = "agents"
): ToolSet {
  const tools: ToolSet = {};

  for (const cap of definition.capabilities) {
    switch (cap) {
      case "delegate":
        tools.delegate_to = createDelegateTool(db, definition.name);
        tools.list_agents = createListAgentsTool(definition.name);
        tools.propose_agent = createProposeAgentTool(db, definition.name);
        break;

      case "shell":
        tools.shell = createShellTool(definition.name, agentsDir);
        break;

      case "filesystem":
        tools.read_file = createFilesystemReadTool(definition.name, agentsDir);
        tools.write_file = createFilesystemWriteTool(definition.name, agentsDir);
        break;

      case "browser":
        tools.browse = createBrowserTool(definition.name);
        break;

      case "skill-builder":
        tools.create_skill = createSkillBuilderTool(db, definition.name, agentsDir);
        tools.list_skills = createListSkillsTool(db, definition.name);
        break;

      case "scheduler":
        tools.schedule_task = createSchedulerTool(db, definition.name);
        tools.list_tasks = createListTasksTool(db, definition.name);
        tools.cancel_task = createCancelTaskTool(db, definition.name);
        break;
    }
  }

  // Load any existing skills as additional tools
  const skillTools = loadSkillsAsTools(db, definition.name, agentsDir);
  Object.assign(tools, skillTools);

  // Attach MCP tools only to explicitly allowed agents.
  if (canUseMCPTools(definition.name)) {
    for (const [name, def] of Object.entries(_mcpTools)) {
      const allowed = _mcpPolicies[name];
      if (!allowed || allowed.length === 0 || allowed.includes(definition.name)) {
        tools[name] = def;
      }
    }
  }

  return tools;
}
