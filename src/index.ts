import { loadConfig, parseMCPServers, isConfigValid } from "./config.js";
import { getDb, closeDb } from "./db/index.js";
import { registerAgent } from "./agent/registry.js";
import { runAgent } from "./agent/runtime.js";
import { buildToolset, setMCPToolPolicies, setMCPTools } from "./tools/registry.js";
import { MAIN_AGENT_PERSONALITY } from "./agent/prompts.js";
import { startAllBots, stopAllBots } from "./channels/telegram.js";
import { startWhatsApp, stopWhatsApp } from "./channels/whatsapp.js";
import { loadAndScheduleAllTasks, stopAllTasks } from "./tools/scheduler.js";
import { startDashboard } from "./web/server.js";
import { warmup as warmupEmbedder } from "./memory/embedder.js";
import { connectAllMCPServers, disconnectAllMCPServers } from "./tools/mcp-bridge.js";
import { startSetupWizard, isConfigured } from "./web/setup.js";
import * as readline from "node:readline";
import { createLogger } from "./util/logger.js";

const log = createLogger("main");

async function main() {
  // Bootstrap mode: if .env is missing or incomplete, start the setup wizard
  if (!isConfigured() || !isConfigValid()) {
    const port = Number(process.env.DASHBOARD_PORT ?? 3000);
    log.info("Configuration incomplete -- starting setup wizard");
    log.info(`Open http://localhost:${port}/setup in your browser`);
    startSetupWizard(port);
    return;
  }

  const config = loadConfig();
  const db = getDb(config.dbPath);

  log.info("DeVClaw Agent Framework");
  log.info("by Automated Engineering");
  log.info("========================");

  // Register main agent (tools added after registration so delegation can discover peers)
  const mainDef = {
    name: "main",
    displayName: "Main Agent",
    personality: MAIN_AGENT_PERSONALITY,
    model: { provider: config.mainModelProvider, model: config.mainModelName },
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
    log.info(`Connecting to ${mcpConfigs.length} MCP server(s)...`);
    const mcpBundle = await connectAllMCPServers(mcpConfigs);
    setMCPTools(mcpBundle.tools);
    setMCPToolPolicies(mcpBundle.policies);
  }

  const mainRuntime = registerAgent(db, config.agentsDir, mainDef);
  mainRuntime.tools = buildToolset(db, mainDef, config.agentsDir, config.masterKey);

  log.info(`Main agent registered: ${mainRuntime.definition.displayName}`);
  log.info(`Model: ${mainRuntime.definition.model.provider}/${mainRuntime.definition.model.model}`);

  // Check Docker availability
  const { isDockerAvailable } = await import("./container/docker.js");
  const dockerOk = await isDockerAvailable();
  log.info(`Docker: ${dockerOk ? "available" : "NOT AVAILABLE (tool execution disabled)"}`);

  // Load scheduled tasks from DB
  loadAndScheduleAllTasks(db);

  // Start web dashboard
  startDashboard(db, config.dashboardPort);

  // Start Telegram bots for all registered agents
  const useTelegram = process.argv.includes("--telegram");
  if (useTelegram) {
    log.info("Starting Telegram bots...");
    startAllBots();
  }

  // Start WhatsApp connection (if configured)
  const useWhatsApp = process.argv.includes("--whatsapp");
  if (useWhatsApp) {
    log.info("Starting WhatsApp connection...");
    await startWhatsApp();
  }

  // Warm model in background so startup stays responsive.
  log.info("Warming embedding model in background...");
  warmupEmbedder().catch((err) => {
    log.warn("Embedding warmup failed", { error: String(err) });
  });

  // Interactive REPL for local testing
  if (!useTelegram || process.argv.includes("--repl")) {
    log.info("Type a message to chat (Ctrl+C to quit):");

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
          log.info("Agent: thinking...");
          const result = await runAgent(mainRuntime, trimmed);
          log.info(`Agent: ${result.response}`);
          log.info(`[${result.steps} steps, ${result.tokensUsed} tokens]`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log.error(`Error: ${message}`);
        }

        prompt();
      });
    };

    prompt();

    rl.on("close", () => {
      shutdown();
    });
  }

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down...");
    stopAllTasks();
    stopAllBots();
    stopWhatsApp();
    await Promise.race([
      disconnectAllMCPServers(),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]).catch((err) => {
      log.error("MCP disconnect error", { error: String(err) });
    });
    closeDb();
    process.exit(0);
  }

  process.on("SIGINT", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
}

main().catch((err) => {
  log.error("Fatal error", { error: String(err) });
  process.exit(1);
});
