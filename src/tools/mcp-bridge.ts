import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import type { ToolSet, ToolDefinition } from "../types.js";

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  config: MCPServerConfig;
}

const connections = new Map<string, MCPConnection>();

export async function connectMCPServer(config: MCPServerConfig): Promise<ToolSet> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...config.env } as Record<string, string>,
  });

  const client = new Client({ name: "devclaw", version: "0.1.0" });
  await client.connect(transport);

  connections.set(config.name, { client, transport, config });

  const { tools: mcpTools } = await client.listTools();
  const toolset: ToolSet = {};

  for (const mcpTool of mcpTools) {
    const toolName = `mcp_${config.name}_${mcpTool.name}`;

    const inputSchema = z.record(z.string(), z.unknown()).describe(
      JSON.stringify(mcpTool.inputSchema ?? { type: "object" })
    );

    toolset[toolName] = {
      description: `[MCP: ${config.name}] ${mcpTool.description ?? mcpTool.name}`,
      inputSchema,
      execute: createMCPExecutor(config.name, mcpTool.name),
    };
  }

  console.log(`[mcp] Connected to "${config.name}" -- ${mcpTools.length} tools available`);
  return toolset;
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

export async function connectAllMCPServers(configs: MCPServerConfig[]): Promise<ToolSet> {
  const allTools: ToolSet = {};

  for (const config of configs) {
    try {
      const tools = await connectMCPServer(config);
      Object.assign(allTools, tools);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] Failed to connect to "${config.name}": ${msg}`);
    }
  }

  return allTools;
}

export async function disconnectAllMCPServers(): Promise<void> {
  for (const [name, conn] of connections) {
    try {
      await conn.client.close();
    } catch {
      console.error(`[mcp] Error disconnecting "${name}"`);
    }
  }
  connections.clear();
}
