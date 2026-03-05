import type Database from "better-sqlite3";
import type { ModelConfig } from "../types.js";
import { callLLM } from "../agent/llm.js";
import { addMemory, type MemoryType } from "./store.js";
import { logAudit } from "../db/index.js";

const EXTRACTION_PROMPT = `You are a memory extraction system. Analyze the conversation exchange below and extract any facts, preferences, decisions, or important information worth remembering long-term.

Rules:
- Only extract genuinely useful information (skip pleasantries, filler, obvious context)
- Each memory should be a self-contained statement that makes sense without the original conversation
- Classify each memory: "fact" (objective info), "preference" (user likes/dislikes), "event" (something that happened), "summary" (conversation summary)
- Rate importance 0.0-1.0 (0.3 = minor detail, 0.5 = moderately useful, 0.8 = very important, 1.0 = critical)
- Return valid JSON array, or empty array if nothing worth remembering

Return ONLY a JSON array like:
[{"content": "...", "type": "fact|preference|event|summary", "importance": 0.5}]`;

interface ExtractedMemory {
  content: string;
  type: MemoryType;
  importance: number;
}

export async function extractAndStoreMemories(
  db: Database.Database,
  agentName: string,
  modelConfig: ModelConfig,
  userMessage: string,
  assistantResponse: string
): Promise<number> {
  const exchange = `User: ${userMessage}\n\nAssistant: ${assistantResponse}`;

  try {
    const result = await callLLM({
      modelConfig,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: exchange }],
      maxSteps: 1,
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return 0;

    let memories: ExtractedMemory[];
    try {
      memories = JSON.parse(jsonMatch[0]);
    } catch {
      logAudit(db, agentName, "memory_extraction_failed", "LLM returned malformed JSON");
      return 0;
    }
    if (!Array.isArray(memories) || memories.length === 0) return 0;

    let stored = 0;
    for (const mem of memories) {
      if (!mem.content || !mem.type || typeof mem.importance !== "number") continue;
      const validTypes: MemoryType[] = ["fact", "summary", "preference", "event"];
      if (!validTypes.includes(mem.type)) continue;

      await addMemory(db, agentName, mem.content, mem.type, Math.max(0, Math.min(1, mem.importance)));
      stored++;
    }

    if (stored > 0) {
      logAudit(db, agentName, "memories_extracted", `Stored ${stored} new memories`);
    }

    return stored;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAudit(db, agentName, "memory_extraction_failed", msg);
    return 0;
  }
}
