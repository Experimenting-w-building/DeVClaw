import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATIONS } from "../db/schema.js";
import { getMessageCount, getRecentMessages, saveMessage } from "../db/index.js";

vi.mock("../agent/llm.js", () => ({
  callLLM: vi.fn(async () => ({
    text: "User and assistant discussed roadmap priorities.",
    steps: [],
    usage: { inputTokens: 1, outputTokens: 1 },
  })),
}));

vi.mock("./store.js", () => ({
  addMemory: vi.fn(async () => {}),
}));

import { callLLM } from "../agent/llm.js";
import { addMemory } from "./store.js";
import { maybeSummarize } from "./summarizer.js";

function createDb(): Database.Database {
  const db = new Database(":memory:");
  for (const migration of MIGRATIONS) {
    try {
      db.exec(migration);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("duplicate column") && !msg.includes("already exists")) throw err;
    }
  }
  db.prepare(
    "INSERT INTO agents (name, display_name, personality, model_provider, model_name, telegram_bot_token, secrets, capabilities) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("main", "Main", "test", "anthropic", "claude-sonnet-4-20250514", "env:MAIN_BOT_TOKEN", "[]", "[]");
  return db;
}

describe("maybeSummarize", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
    vi.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  it("summarizes older persisted messages and prunes to recent window", async () => {
    for (let i = 0; i < 25; i++) {
      saveMessage(db, {
        agentName: "main",
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg-${i}`,
        timestamp: new Date(Date.now() + i).toISOString(),
      });
    }

    const recent = getRecentMessages(db, "main", 10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const out = await maybeSummarize(
      db,
      "main",
      { provider: "anthropic", model: "claude-sonnet-4-20250514" },
      recent
    );

    expect(out).toEqual(recent);
    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(addMemory).toHaveBeenCalledTimes(1);
    expect(getMessageCount(db, "main")).toBe(10);
  });

  it("does not summarize when history is below threshold", async () => {
    for (let i = 0; i < 8; i++) {
      saveMessage(db, {
        agentName: "main",
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg-${i}`,
        timestamp: new Date(Date.now() + i).toISOString(),
      });
    }

    const recent = getRecentMessages(db, "main", 10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const out = await maybeSummarize(
      db,
      "main",
      { provider: "anthropic", model: "claude-sonnet-4-20250514" },
      recent
    );

    expect(out).toEqual(recent);
    expect(callLLM).not.toHaveBeenCalled();
    expect(addMemory).not.toHaveBeenCalled();
  });
});
