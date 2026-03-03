import type { ChatMessage } from "../types.js";
import type Database from "better-sqlite3";
import { getRecentMessages, saveMessage } from "../db/index.js";
import { searchMemories, getMemoryCount } from "../memory/store.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MAX_CONTEXT_MESSAGES = 10;

export function buildSystemPrompt(
  agentName: string,
  personality: string,
  agentsDir: string,
  extraContext?: string
): string {
  const parts: string[] = [];

  parts.push(personality);

  const personalityPath = join(agentsDir, agentName, "personality.md");
  if (existsSync(personalityPath)) {
    const override = readFileSync(personalityPath, "utf-8").trim();
    if (override) {
      parts.length = 0;
      parts.push(override);
    }
  }

  const memoryPath = join(agentsDir, agentName, "memory.md");
  if (existsSync(memoryPath)) {
    const memory = readFileSync(memoryPath, "utf-8").trim();
    if (memory) {
      parts.push(`\n## Your Memory\n${memory}`);
    }
  }

  if (extraContext) {
    parts.push(`\n## Additional Context\n${extraContext}`);
  }

  return parts.join("\n\n");
}

export async function buildSystemPromptWithMemory(
  db: Database.Database,
  agentName: string,
  personality: string,
  agentsDir: string,
  userMessage: string
): Promise<string> {
  const base = buildSystemPrompt(agentName, personality, agentsDir);
  const memCount = getMemoryCount(db, agentName);

  if (memCount === 0) return base;

  try {
    const memories = await searchMemories(db, agentName, userMessage, 8);
    if (memories.length === 0) return base;

    const memorySection = memories
      .map((m) => `- [${m.memoryType}] ${m.content}`)
      .join("\n");

    return `${base}\n\n## Recalled Memories\nThe following are relevant memories from past interactions:\n${memorySection}`;
  } catch {
    return base;
  }
}

export function loadConversationHistory(
  db: Database.Database,
  agentName: string
): ChatMessage[] {
  const messages = getRecentMessages(db, agentName, MAX_CONTEXT_MESSAGES);

  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

export function persistMessage(
  db: Database.Database,
  agentName: string,
  role: "user" | "assistant" | "system",
  content: string
): void {
  saveMessage(db, {
    agentName,
    role,
    content,
    timestamp: new Date().toISOString(),
  });
}
