import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

describe("dashboard production guard", () => {
  it("throws when DASHBOARD_SKIP_AUTH is enabled in production", async () => {
    const oldEnv = { ...process.env };
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.DASHBOARD_SKIP_AUTH = "true";
    process.env.MASTER_KEY = "test-master-key";
    process.env.OWNER_CHAT_ID = "1";
    process.env.DASHBOARD_PASSWORD = "password";
    process.env.MAIN_BOT_TOKEN = "token";
    process.env.ANTHROPIC_API_KEY = "dummy";
    process.env.MAIN_MODEL_PROVIDER = "anthropic";
    process.env.MAIN_MODEL_NAME = "claude-sonnet-4-20250514";

    const { startDashboard } = await import("./server.js");
    const db = new Database(":memory:");

    expect(() => startDashboard(db, 3999)).toThrow(
      "Refusing to start with DASHBOARD_SKIP_AUTH=true in production"
    );

    db.close();
    process.env = oldEnv;
  });
});
