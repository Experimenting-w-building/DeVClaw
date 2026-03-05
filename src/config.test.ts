import { describe, expect, it } from "vitest";
import { parseMCPServers, type AppConfig } from "./config.js";

const baseConfig: AppConfig = {
  nodeEnv: "development",
  masterKey: "k",
  ownerChatId: "1",
  dashboardPort: 3000,
  dashboardPassword: "p",
  dashboardAllowedOrigins: undefined,
  anthropicApiKey: "a",
  openaiApiKey: undefined,
  googleApiKey: undefined,
  mainModelProvider: "anthropic",
  mainModelName: "claude-sonnet-4-20250514",
  llmTimeoutMs: 45000,
  llmMaxRetries: 1,
  mainBotToken: "t",
  mcpServers: undefined,
  dbPath: "data.db",
  agentsDir: "agents",
};

describe("parseMCPServers", () => {
  it("parses valid server entries with optional policy fields", () => {
    const cfg: AppConfig = {
      ...baseConfig,
      mcpServers: JSON.stringify([
        {
          name: "filesystem",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          allowAgents: ["main", "research"],
          allowTools: ["read_file"],
          envAllowlist: ["PATH", "HOME"],
        },
      ]),
    };
    const out = parseMCPServers(cfg);
    expect(out).toHaveLength(1);
    expect(out[0].allowAgents).toEqual(["main", "research"]);
    expect(out[0].allowTools).toEqual(["read_file"]);
    expect(out[0].envAllowlist).toEqual(["PATH", "HOME"]);
  });

  it("returns [] on invalid schema payload", () => {
    const cfg: AppConfig = {
      ...baseConfig,
      mcpServers: JSON.stringify([{ bad: "shape" }]),
    };
    expect(parseMCPServers(cfg)).toEqual([]);
  });
});
