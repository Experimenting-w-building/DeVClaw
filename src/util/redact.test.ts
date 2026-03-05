import { describe, it, expect } from "vitest";
import { redactForAudit, redactSensitive } from "./redact.js";

describe("redactSensitive", () => {
  it("redacts sensitive keys recursively", () => {
    const input = {
      token: "abc",
      nested: {
        apiKey: "xyz",
        value: "keep",
      },
    };
    const out = redactSensitive(input) as Record<string, unknown>;
    expect(out.token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).value).toBe("keep");
  });

  it("redacts jwt and bearer-like strings", () => {
    expect(redactSensitive("Bearer abcdef")).toBe("[REDACTED]");
    expect(redactSensitive("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb")).toBe("[REDACTED]");
  });

  it("truncates large audit payloads", () => {
    const str = redactForAudit({ message: "hello ".repeat(300) }, 100);
    expect(str.length).toBeGreaterThan(100);
    expect(str.endsWith("...")).toBe(true);
  });
});
