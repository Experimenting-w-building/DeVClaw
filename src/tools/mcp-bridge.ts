import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import type { ToolSet, ToolDefinition } from "../types.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("mcp");
const DEFAULT_ENV_ALLOWLIST = ["PATH", "HOME", "SHELL", "TMPDIR", "LANG", "LC_ALL"];

function buildMCPEnv(extraEnv?: Record<string, string>, envAllowlist?: string[]): Record<string, string> {
  const allowlist = envAllowlist && envAllowlist.length > 0
    ? envAllowlist
    : (process.env.MCP_ENV_ALLOWLIST ?? DEFAULT_ENV_ALLOWLIST.join(","))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const env: Record<string, string> = {};
  for (const key of allowlist) {
    const value = process.env[key];
    if (typeof value === "string") env[key] = value;
  }
  return { ...env, ...(extraEnv ?? {}) };
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  allowAgents?: string[];
  allowTools?: string[];
  envAllowlist?: string[];
}

export type MCPToolPolicyMap = Record<string, string[] | undefined>;

export interface MCPToolBundle {
  tools: ToolSet;
  policies: MCPToolPolicyMap;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
}

const connections = new Map<string, MCPConnection>();

export async function connectMCPServer(config: MCPServerConfig): Promise<MCPToolBundle> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: buildMCPEnv(config.env, config.envAllowlist),
  });

  const client = new Client({ name: "devclaw", version: "0.1.0" });
  await client.connect(transport);

  connections.set(config.name, { client, transport, config });

  const { tools: mcpTools } = await client.listTools();
  const toolset: ToolSet = {};
  const policies: MCPToolPolicyMap = {};

  const allowedToolSet = config.allowTools ? new Set(config.allowTools) : null;
  for (const mcpTool of mcpTools) {
    if (allowedToolSet && !allowedToolSet.has(mcpTool.name)) continue;
    const toolName = `mcp_${config.name}_${mcpTool.name}`;

    const inputSchema = z.record(z.string(), z.unknown()).describe(
      JSON.stringify(mcpTool.inputSchema ?? { type: "object" })
    );

    toolset[toolName] = {
      description: `[MCP: ${config.name}] ${mcpTool.description ?? mcpTool.name}`,
      inputSchema,
      execute: createMCPExecutor(config.name, mcpTool.name),
    };
    policies[toolName] = config.allowAgents;
  }

  log.info(`Connected to "${config.name}" -- ${mcpTools.length} tools available`);
  return { tools: toolset, policies };
}

function createMCPExecutor(serverName: string, toolName: string) {
  return async (input: Record<string, unknown>): Promise<unknown> => {
    const conn = connections.get(serverName);
    if (!conn) throw new Error(`MCP server "${serverName}" not connected`);

    const result = await conn.client.callTool({ name: toolName, arguments: input });

    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!);

    if (textParts.length === 1) return textParts[0];
    if (textParts.length > 1) return textParts.join("\n");
    return result.content;
  };
}

export async function connectAllMCPServers(configs: MCPServerConfig[]): Promise<MCPToolBundle> {
  const allTools: ToolSet = {};
  const policies: MCPToolPolicyMap = {};

  for (const config of configs) {
    try {
      const bundle = await connectMCPServer(config);
      Object.assign(allTools, bundle.tools);
      Object.assign(policies, bundle.policies);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to connect to "${config.name}": ${msg}`);
    }
  }

  return { tools: allTools, policies };
}

export async function disconnectAllMCPServers(): Promise<void> {
  for (const [name, conn] of connections) {
    try {
      await conn.client.close();
    } catch {
      log.error(`Error disconnecting "${name}"`);
    }
  }
  connections.clear();
}
