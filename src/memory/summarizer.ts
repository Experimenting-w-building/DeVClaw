import type Database from "better-sqlite3";
import type { ModelConfig, ChatMessage } from "../types.js";
import { callLLM } from "../agent/llm.js";
import { addMemory } from "./store.js";
import { logAudit } from "../db/index.js";

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Compress the following conversation history into a concise summary that captures all key information, decisions, and context that would be needed to continue the conversation later.

Rules:
- Keep it factual and information-dense
- Include specific details (names, numbers, decisions) -- don't be vague
- Aim for 2-4 sentences
- Write in third person ("The user asked about...", "It was decided that...")

Return ONLY the summary text, nothing else.`;

const SUMMARIZE_THRESHOLD = 20;
const KEEP_RECENT = 10;

/**
 * If conversation history exceeds the threshold, summarize older messages
 * and store the summary as a long-term memory. Returns messages to keep
 * in the context window (the recent ones).
 */
export async function maybeSummarize(
  db: Database.Database,
  agentName: string,
  modelConfig: ModelConfig,
  messages: ChatMessage[]
): Promise<ChatMessage[]> {
  if (messages.length <= SUMMARIZE_THRESHOLD) {
    return messages;
  }

  const olderMessages = messages.slice(0, messages.length - KEEP_RECENT);
  const recentMessages = messages.slice(messages.length - KEEP_RECENT);

  const conversationText = olderMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  try {
    const result = await callLLM({
      modelConfig,
      system: SUMMARIZE_PROMPT,
      messages: [{ role: "user", content: conversationText }],
      maxSteps: 1,
    });

    const summary = result.text.trim();
    if (summary) {
      await addMemory(db, agentName, summary, "summary", 0.7);
      logAudit(db, agentName, "conversation_summarized", `Compressed ${olderMessages.length} messages into summary`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAudit(db, agentName, "summarization_failed", msg);
  }

  return recentMessages;
}
