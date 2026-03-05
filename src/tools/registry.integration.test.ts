import Database from "better-sqlite3";
import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { MIGRATIONS } from "../db/schema.js";
import type { AgentDefinition, ToolSet } from "../types.js";
import { buildToolset, setMCPTools } from "./registry.js";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  for (const migration of MIGRATIONS) {
    try {
      db.exec(migration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw err;
    }
  }
  return db;
}

function makeAgent(name: string): AgentDefinition {
  return {
    name,
    displayName: name,
    personality: "test",
    model: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    telegramBotToken: "env:MAIN_BOT_TOKEN",
    secrets: [],
    capabilities: [],
  };
}

afterEach(() => {
  setMCPTools({});
  delete process.env.MCP_TOOL_AGENTS;
});

describe("MCP tool exposure policy", () => {
  it("attaches MCP tools only to allowlisted agents", () => {
    const db = createTestDb();
    const mockMcpTools: ToolSet = {
      mcp_demo_ping: {
        description: "demo",
        inputSchema: z.object({}),
        execute: async () => "pong",
      },
    };
    setMCPTools(mockMcpTools);
    process.env.MCP_TOOL_AGENTS = "main,ops";

    const mainTools = buildToolset(db, makeAgent("main"));
    const workerTools = buildToolset(db, makeAgent("worker"));

    expect(mainTools.mcp_demo_ping).toBeDefined();
    expect(workerTools.mcp_demo_ping).toBeUndefined();

    db.close();
  });

  it("defaults MCP access to main agent only", () => {
    const db = createTestDb();
    const mockMcpTools: ToolSet = {
      mcp_demo_ping: {
        description: "demo",
        inputSchema: z.object({}),
        execute: async () => "pong",
      },
    };
    setMCPTools(mockMcpTools);

    const mainTools = buildToolset(db, makeAgent("main"));
    const opsTools = buildToolset(db, makeAgent("ops"));

    expect(mainTools.mcp_demo_ping).toBeDefined();
    expect(opsTools.mcp_demo_ping).toBeUndefined();

    db.close();
  });
});
