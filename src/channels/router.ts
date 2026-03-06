import { createLogger } from "../util/logger.js";

const log = createLogger("channels");

export type ChannelType = "telegram" | "whatsapp";

interface ChannelAdapter {
  type: ChannelType;
  sendMessage(recipientId: string, text: string): Promise<void>;
}

const adapters = new Map<ChannelType, ChannelAdapter>();
let primaryChannel: ChannelType | null = null;

export function registerChannel(adapter: ChannelAdapter): void {
  adapters.set(adapter.type, adapter);
  if (!primaryChannel) primaryChannel = adapter.type;
  log.info(`Channel registered: ${adapter.type}`);
}

export function unregisterChannel(type: ChannelType): void {
  adapters.delete(type);
  if (primaryChannel === type) {
    primaryChannel = adapters.size > 0 ? adapters.keys().next().value! : null;
  }
}

export function getActiveChannels(): ChannelType[] {
  return Array.from(adapters.keys());
}

export function hasChannel(type: ChannelType): boolean {
  return adapters.has(type);
}

export function getPrimaryChannel(): ChannelType | null {
  return primaryChannel;
}

/**
 * Send a message to the owner via the best available channel.
 * Tries the primary channel first, falls back to any other registered channel.
 */
export async function sendToOwner(
  ownerId: string,
  text: string,
  preferredChannel?: ChannelType
): Promise<void> {
  const target = preferredChannel && adapters.has(preferredChannel)
    ? preferredChannel
    : primaryChannel;

  if (!target) {
    log.warn("No messaging channels available -- cannot send message");
    return;
  }

  const adapter = adapters.get(target);
  if (!adapter) {
    log.warn(`Channel ${target} not found`);
    return;
  }

  try {
    await adapter.sendMessage(ownerId, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`Failed to send via ${target}`, { error: msg });

    for (const [type, fallback] of adapters) {
      if (type === target) continue;
      try {
        log.info(`Falling back to ${type}`);
        await fallback.sendMessage(ownerId, text);
        return;
      } catch {
        // continue to next fallback
      }
    }
    log.error("All channels failed to deliver message");
  }
}

/**
 * Send a message via a specific agent's channel.
 * For Telegram sub-agents, uses their dedicated bot.
 * Falls back to sendToOwner for WhatsApp-only setups.
 */
export async function sendAgentMessage(
  agentName: string,
  recipientId: string,
  text: string
): Promise<void> {
  const telegramAdapter = adapters.get("telegram");
  if (telegramAdapter) {
    const { sendMessage } = await import("./telegram.js");
    try {
      await sendMessage(agentName, recipientId, text);
      return;
    } catch {
      // fall through
    }
  }

  await sendToOwner(recipientId, `[${agentName}] ${text}`);
}
