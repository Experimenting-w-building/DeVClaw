import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  type WASocket,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { getRuntime, getAllRuntimes } from "../agent/registry.js";
import { runAgent, type AgentRuntime } from "../agent/runtime.js";
import { logAudit } from "../db/index.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("whatsapp");

let sock: WASocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isOwner(jid: string): boolean {
  const config = loadConfig();
  const ownerJid = config.whatsappOwnerJid;
  if (!ownerJid) return false;
  const normalized = ownerJid.includes("@") ? ownerJid : `${ownerJid}@s.whatsapp.net`;
  return jid === normalized;
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
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

async function handleMessage(
  msg: proto.IWebMessageInfo,
  runtime: AgentRuntime
): Promise<void> {
  const jid = msg.key?.remoteJid;
  if (!jid || !isOwner(jid)) return;
  if (msg.key?.fromMe) return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text;
  if (!text) return;

  const db = runtime.db;
  logAudit(db, runtime.definition.name, "whatsapp_message", `From: ${jid}`);

  try {
    await sock?.presenceSubscribe(jid);
    await sock?.sendPresenceUpdate("composing", jid);

    const result = await runAgent(runtime, text);

    await sock?.sendPresenceUpdate("paused", jid);

    const maxLen = 4096;
    if (result.response.length <= maxLen) {
      await sock?.sendMessage(jid, { text: result.response });
    } else {
      const chunks = splitMessage(result.response, maxLen);
      for (const chunk of chunks) {
        await sock?.sendMessage(jid, { text: chunk });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Agent error", { agent: runtime.definition.name, error: message });
    await sock?.sendMessage(jid, { text: `Error: ${message.slice(0, 500)}` });
  }
}

export async function startWhatsApp(): Promise<void> {
  const config = loadConfig();
  if (!config.whatsappOwnerJid) {
    log.error("WHATSAPP_OWNER_JID is required for WhatsApp channel");
    return;
  }

  const mainRuntime = getRuntime("main");
  if (!mainRuntime) {
    log.error("Main agent runtime not found");
    return;
  }

  const authDir = join(config.agentsDir, "main", "whatsapp-auth");
  mkdirSync(authDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const connectSocket = async () => {
    sock = makeWASocket({
      auth: state,
      browser: Browsers.macOS("Desktop"),
      markOnlineOnConnect: false,
      logger: {
        level: "silent",
        fatal: () => {},
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
        trace: () => {},
        child: () => ({ level: "silent", fatal: () => {}, error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}, child: () => ({} as any) } as any),
      } as any,
      getMessage: async () => undefined,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log.info("WhatsApp QR code generated -- scan with your phone:");
        log.info(`QR: ${qr}`);
        log.info("Tip: Use a QR terminal renderer or visit the dashboard to scan.");
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          log.warn("WhatsApp connection closed, reconnecting in 5s...", { statusCode });
          reconnectTimer = setTimeout(() => void connectSocket(), 5_000);
        } else {
          log.info("WhatsApp logged out. Delete the auth folder and restart to re-pair.");
          sock = null;
        }
      }

      if (connection === "open") {
        log.info("WhatsApp connected successfully");
        logAudit(mainRuntime.db, "main", "whatsapp_connected", "WhatsApp session active");
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        await handleMessage(msg, mainRuntime);
      }
    });
  };

  await connectSocket();
}

export function stopWhatsApp(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    sock.end(undefined);
    sock = null;
    log.info("WhatsApp disconnected");
  }
}

export async function sendWhatsAppMessage(jid: string, text: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp is not connected");
  const normalized = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
  await sock.sendMessage(normalized, { text });
}
