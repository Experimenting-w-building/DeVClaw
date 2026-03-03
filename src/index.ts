import { loadConfig, parseMCPServers } from "./config.js";
import { getDb, closeDb } from "./db/index.js";
import { registerAgent, getRuntime } from "./agent/registry.js";
import { runAgent } from "./agent/runtime.js";
import { buildToolset, setMCPTools } from "./tools/registry.js";
import { MAIN_AGENT_PERSONALITY } from "./agent/prompts.js";
import { startAllBots, stopAllBots } from "./channels/telegram.js";
import { loadAndScheduleAllTasks, stopAllTasks } from "./tools/scheduler.js";
import { startDashboard } from "./web/server.js";
import { warmup as warmupEmbedder } from "./memory/embedder.js";
import { connectAllMCPServers, disconnectAllMCPServers } from "./tools/mcp-bridge.js";
import * as readline from "node:readline";

async function main() {
  const config = loadConfig();
  const db = getDb(config.dbPath);

  console.log("DeVClaw Agent Framework");
  console.log("by Automated Engineering");
  console.log("========================\n");

  // Register main agent (tools added after registration so delegation can discover peers)
  const mainDef = {
    name: "main",
    displayName: "Main Agent",
    personality: MAIN_AGENT_PERSONALITY,
    model: { provider: "anthropic" as const, model: "claude-sonnet-4-20250514" },
    telegramBotToken: "env:MAIN_BOT_TOKEN",
    secrets: [] as string[],
    capabilities: [
      "shell" as const,
      "browser" as const,
      "filesystem" as const,
      "scheduler" as const,
      "skill-builder" as const,
      "delegate" as const,
    ],
  };

  // Connect MCP servers (if configured) before building toolset
  const mcpConfigs = parseMCPServers(config);
  if (mcpConfigs.length > 0) {
    console.log(`Connecting to ${mcpConfigs.length} MCP server(s)...`);
    const mcpTools = await connectAllMCPServers(mcpConfigs);
    setMCPTools(mcpTools);
  }

  const mainRuntime = registerAgent(db, config.agentsDir, mainDef);
  mainRuntime.tools = buildToolset(db, mainDef, config.agentsDir);

  console.log(`Main agent registered: ${mainRuntime.definition.displayName}`);
  console.log(`Model: ${mainRuntime.definition.model.provider}/${mainRuntime.definition.model.model}`);

  // Check Docker availability
  const { isDockerAvailable } = await import("./container/docker.js");
  const dockerOk = await isDockerAvailable();
  console.log(`Docker: ${dockerOk ? "available" : "NOT AVAILABLE (tool execution disabled)"}`);

  // Warm up the local embedding model (downloads ~80MB on first run)
  console.log("Loading embedding model...");
  await warmupEmbedder();

  // Load scheduled tasks from DB
  loadAndScheduleAllTasks(db);

  // Start web dashboard
  startDashboard(db, config.dashboardPort);

  // Start Telegram bots for all registered agents
  const useTelegram = process.argv.includes("--telegram");
  if (useTelegram) {
    console.log("\nStarting Telegram bots...");
    startAllBots();
  }

  // Interactive REPL for local testing
  if (!useTelegram || process.argv.includes("--repl")) {
    console.log(`\nType a message to chat (Ctrl+C to quit):\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => {
      rl.question("You: ", async (input) => {
        const trimmed = input.trim();
        if (!trimmed) {
          prompt();
          return;
        }

        try {
          console.log("\nAgent: thinking...");
          const result = await runAgent(mainRuntime, trimmed);
          console.log(`\nAgent: ${result.response}`);
          console.log(`  [${result.steps} steps, ${result.tokensUsed} tokens]\n`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`\nError: ${message}\n`);
        }

        prompt();
      });
    };

    prompt();

    rl.on("close", () => {
      shutdown();
    });
  }

  function shutdown() {
    console.log("\nShutting down...");
    stopAllTasks();
    stopAllBots();
    disconnectAllMCPServers().catch(() => {});
    closeDb();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
