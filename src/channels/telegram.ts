import { Bot, type Context } from "grammy";
import type Database from "better-sqlite3";
import { resolveEnvRef, loadConfig } from "../config.js";
import {
  getRuntime,
  getAllRuntimes,
  registerAgentDynamic,
} from "../agent/registry.js";
import { runAgent, type AgentRuntime } from "../agent/runtime.js";
import {
  logAudit,
  getAgentEncryptedToken,
  getPendingAgent,
  deletePendingAgent,
  listPendingAgents,
  listAgents,
} from "../db/index.js";
import { decrypt } from "../security/crypto.js";
import { registerChannel } from "./router.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("telegram");

interface ManagedBot {
  bot: Bot;
  agentName: string;
  running: boolean;
}

const bots = new Map<string, ManagedBot>();

function isOwner(ctx: Context): boolean {
  const config = loadConfig();
  return String(ctx.from?.id) === config.ownerChatId;
}

function resolveToken(agentName: string, tokenRef: string): string | null {
  if (tokenRef.startsWith("env:")) {
    try {
      return resolveEnvRef(tokenRef);
    } catch {
      return null;
    }
  }

  if (tokenRef.startsWith("db:")) {
    const config = loadConfig();
    const runtime = getRuntime(agentName);
    const db = runtime?.db;
    if (!db) return null;
    const encrypted = getAgentEncryptedToken(db, agentName);
    if (!encrypted) return null;
    try {
      return decrypt(encrypted, config.masterKey);
    } catch {
      return null;
    }
  }

  // Raw token (for backwards compatibility)
  return tokenRef;
}

// --- Command Handlers (main bot only) ---

function registerCommands(bot: Bot, runtime: AgentRuntime): void {
  const db = runtime.db;
  const config = loadConfig();

  bot.command("approve", async (ctx) => {
    if (!isOwner(ctx)) return;
    const args = ctx.match?.split(/\s+/) ?? [];
    if (args.length < 1 || !args[0]) {
      await ctx.reply("Usage: /approve <agent_name> [bot_token]\nBot token is optional -- omit for delegation-only agents.");
      return;
    }

    const name = args[0];
    const rawToken = args.length >= 2 ? args.slice(1).join("") : undefined;
    const pending = getPendingAgent(db, name);
    if (!pending) {
      await ctx.reply(`No pending proposal found for "${name}".`);
      return;
    }

    if (rawToken) {
      try {
        await ctx.deleteMessage();
      } catch {
        // may not have delete permissions
      }
    }

    try {
      const newRuntime = registerAgentDynamic(db, config.agentsDir, {
        name: pending.name,
        displayName: pending.displayName,
        personality: pending.personality,
        modelProvider: pending.modelProvider,
        modelName: pending.modelName,
        capabilities: pending.capabilities,
        rawBotToken: rawToken,
      });

      deletePendingAgent(db, name);

      let statusMsg: string;
      if (rawToken) {
        const newBot = startBot(name);
        statusMsg = newBot
          ? "Telegram bot starting..."
          : "Bot token may be invalid -- agent available via delegation only.";
      } else {
        statusMsg = "No bot token provided -- agent available via delegation only.";
      }

      logAudit(db, "main", "agent_approved", `Agent: ${name}`);

      await ctx.reply(
        `Agent "${pending.displayName}" is live! ${statusMsg}\n\n` +
        `Ask me to delegate tasks to it.\n` +
        `Capabilities: ${pending.capabilities.join(", ")}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Failed to create agent: ${msg}`);
    }
  });

  bot.command("reject", async (ctx) => {
    if (!isOwner(ctx)) return;
    const name = ctx.match?.trim();
    if (!name) {
      await ctx.reply("Usage: /reject <agent_name>");
      return;
    }

    if (deletePendingAgent(db, name)) {
      logAudit(db, "main", "agent_rejected", `Agent: ${name}`);
      await ctx.reply(`Proposal for "${name}" rejected.`);
    } else {
      await ctx.reply(`No pending proposal found for "${name}".`);
    }
  });

  bot.command("agents", async (ctx) => {
    if (!isOwner(ctx)) return;

    const active = listAgents(db);
    const pending = listPendingAgents(db);

    const lines: string[] = ["*Active Agents:*"];
    if (active.length === 0) {
      lines.push("  (none)");
    } else {
      for (const a of active) {
        const botRunning = bots.get(a.name)?.running ? "running" : "stopped";
        lines.push(`  • *${a.displayName}* (${a.name}) — ${botRunning}`);
      }
    }

    lines.push("");
    lines.push("*Pending Proposals:*");
    if (pending.length === 0) {
      lines.push("  (none)");
    } else {
      for (const p of pending) {
        lines.push(`  • *${p.displayName}* (${p.name}) — /approve ${p.name} <token>`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" }).catch(() =>
      ctx.reply(lines.join("\n"))
    );
  });

  bot.command("stop", async (ctx) => {
    if (!isOwner(ctx)) return;
    const name = ctx.match?.trim();
    if (!name || name === "main") {
      await ctx.reply("Usage: /stop <agent_name> (cannot stop main)");
      return;
    }
    stopBot(name);
    await ctx.reply(`Bot for "${name}" stopped.`);
  });

  bot.command("restart", async (ctx) => {
    if (!isOwner(ctx)) return;
    const name = ctx.match?.trim();
    if (!name) {
      await ctx.reply("Usage: /restart <agent_name>");
      return;
    }
    stopBot(name);
    const result = startBot(name);
    await ctx.reply(result ? `Bot for "${name}" restarted.` : `Failed to restart bot for "${name}".`);
  });
}

// --- Message Handling ---

async function handleMessage(ctx: Context, runtime: AgentRuntime): Promise<void> {
  if (!isOwner(ctx)) return;
  const text = ctx.message?.text;
  if (!text) return;

  // Skip commands (they're handled by command handlers)
  if (text.startsWith("/")) return;

  const db = runtime.db;
  logAudit(db, runtime.definition.name, "telegram_message", `From: ${ctx.from?.id}`);

  await ctx.replyWithChatAction("typing");

  try {
    const result = await runAgent(runtime, text);

    const maxLen = 4096;
    if (result.response.length <= maxLen) {
      await ctx.reply(result.response, { parse_mode: "Markdown" }).catch(() =>
        ctx.reply(result.response)
      );
    } else {
      const chunks = splitMessage(result.response, maxLen);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(() =>
          ctx.reply(chunk)
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Agent error", { agent: runtime.definition.name, error: message });
    await ctx.reply(`Error: ${message.slice(0, 500)}`);
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) {
      splitAt = maxLen;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// --- Bot Lifecycle ---

export function startBot(agentName: string): Bot | null {
  const runtime = getRuntime(agentName);
  if (!runtime) {
    log.error(`No runtime found for agent: ${agentName}`);
    return null;
  }

  const existing = bots.get(agentName);
  if (existing?.running) {
    log.info(`Bot for ${agentName} already running`);
    return existing.bot;
  }

  if (!runtime.definition.telegramBotToken) {
    log.info(`No Telegram token for ${agentName}, skipping bot start`);
    return null;
  }

  const token = resolveToken(agentName, runtime.definition.telegramBotToken);
  if (!token) {
    log.error(`Cannot resolve bot token for ${agentName}`);
    return null;
  }

  const bot = new Bot(token);

  // Only the main agent gets admin commands
  if (agentName === "main") {
    registerCommands(bot, runtime);
  }

  bot.on("message:text", (ctx) => handleMessage(ctx, runtime));

  bot.catch((err) => {
    log.error("Bot error", { agent: agentName, error: err.message });
  });

  bot.start({
    onStart: (botInfo) => {
      log.info(`${agentName} bot started as @${botInfo.username}`);
      logAudit(runtime.db, agentName, "bot_started", `@${botInfo.username}`);
    },
  });

  bots.set(agentName, { bot, agentName, running: true });
  return bot;
}

export function stopBot(agentName: string): void {
  const managed = bots.get(agentName);
  if (!managed) return;

  managed.bot.stop();
  managed.running = false;
  log.info(`${agentName} bot stopped`);
}

export function startAllBots(): void {
  const config = loadConfig();
  if (!config.mainBotToken || !config.ownerChatId) {
    log.info("Telegram not configured, skipping bot startup");
    return;
  }

  const runtimes = getAllRuntimes();
  for (const runtime of runtimes) {
    if (runtime.definition.telegramBotToken) {
      startBot(runtime.definition.name);
    }
  }

  registerChannel({
    type: "telegram",
    sendMessage: async (recipientId, text) => {
      await sendMessage("main", recipientId, text);
    },
  });
}

export function stopAllBots(): void {
  for (const [name] of bots) {
    stopBot(name);
  }
}

export function sendMessage(agentName: string, chatId: string, text: string): Promise<void> {
  const managed = bots.get(agentName);
  if (!managed?.running) {
    throw new Error(`Bot for ${agentName} is not running`);
  }
  return managed.bot.api.sendMessage(Number(chatId), text).then(() => {});
}
