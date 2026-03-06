import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runAudit, type AuditReport } from "./audit.js";

describe("security audit", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal("process", {
      ...process,
      env: { ...origEnv },
      exit: vi.fn(),
    });
  });

  afterEach(() => {
    process.env = origEnv;
  });

  function setMinimalEnv() {
    process.env.MASTER_KEY = "a".repeat(64);
    process.env.DASHBOARD_PASSWORD = "strongpassword123!";
    process.env.OWNER_CHAT_ID = "123456789";
    process.env.MAIN_BOT_TOKEN = "123456:ABCdef";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.NODE_ENV = "production";
  }

  it("flags missing MASTER_KEY", async () => {
    delete process.env.MASTER_KEY;
    const report = await runAudit();
    const mkCheck = report.checks.find((c) => c.name === "MASTER_KEY");
    expect(mkCheck?.severity).toBe("fail");
  });

  it("passes with strong MASTER_KEY", async () => {
    setMinimalEnv();
    const report = await runAudit();
    const mkCheck = report.checks.find((c) => c.name === "MASTER_KEY");
    expect(mkCheck?.severity).toBe("pass");
  });

  it("flags weak DASHBOARD_PASSWORD", async () => {
    setMinimalEnv();
    process.env.DASHBOARD_PASSWORD = "password";
    const report = await runAudit();
    const pwCheck = report.checks.find((c) => c.name === "DASHBOARD_PASSWORD");
    expect(pwCheck?.severity).toBe("fail");
  });

  it("flags DASHBOARD_SKIP_AUTH in production", async () => {
    setMinimalEnv();
    process.env.DASHBOARD_SKIP_AUTH = "true";
    const report = await runAudit();
    const skipCheck = report.checks.find((c) => c.name === "DASHBOARD_SKIP_AUTH");
    expect(skipCheck?.severity).toBe("fail");
  });

  it("flags secrets in MCP_ENV_ALLOWLIST", async () => {
    setMinimalEnv();
    process.env.MCP_ENV_ALLOWLIST = "PATH,MASTER_KEY,HOME";
    const report = await runAudit();
    const envCheck = report.checks.find((c) => c.name === "MCP_ENV_ALLOWLIST");
    expect(envCheck?.severity).toBe("fail");
  });

  it("flags missing messaging channels", async () => {
    setMinimalEnv();
    delete process.env.OWNER_CHAT_ID;
    delete process.env.MAIN_BOT_TOKEN;
    delete process.env.WHATSAPP_OWNER_JID;
    const report = await runAudit();
    const channelCheck = report.checks.find((c) => c.name === "CHANNELS");
    expect(channelCheck?.severity).toBe("fail");
  });

  it("passes with WhatsApp-only config", async () => {
    setMinimalEnv();
    delete process.env.OWNER_CHAT_ID;
    delete process.env.MAIN_BOT_TOKEN;
    process.env.WHATSAPP_OWNER_JID = "14155551234@s.whatsapp.net";
    const report = await runAudit();
    const channelCheck = report.checks.find((c) => c.name === "CHANNELS");
    expect(channelCheck).toBeUndefined();
    const waCheck = report.checks.find((c) => c.name === "WHATSAPP_OWNER_JID");
    expect(waCheck?.severity).toBe("pass");
  });

  it("returns correct summary counts", async () => {
    setMinimalEnv();
    const report = await runAudit();
    const total = report.summary.pass + report.summary.info + report.summary.warn + report.summary.fail;
    expect(total).toBe(report.checks.length);
  });
});
