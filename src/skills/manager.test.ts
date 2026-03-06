import { describe, it, expect } from "vitest";
import { signSkillContent, verifySkillSignature } from "./manager.js";

describe("skill signing", () => {
  const masterKey = "a".repeat(64);
  const code = 'console.log("hello");';
  const metadata = '{"name":"test","description":"A test skill"}';

  it("produces a hex signature", () => {
    const sig = signSkillContent(code, metadata, masterKey);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies correct signature", () => {
    const sig = signSkillContent(code, metadata, masterKey);
    expect(verifySkillSignature(code, metadata, masterKey, sig)).toBe(true);
  });

  it("rejects tampered code", () => {
    const sig = signSkillContent(code, metadata, masterKey);
    expect(verifySkillSignature(code + "// tampered", metadata, masterKey, sig)).toBe(false);
  });

  it("rejects tampered metadata", () => {
    const sig = signSkillContent(code, metadata, masterKey);
    expect(verifySkillSignature(code, '{"name":"evil"}', masterKey, sig)).toBe(false);
  });

  it("rejects wrong key", () => {
    const sig = signSkillContent(code, metadata, masterKey);
    expect(verifySkillSignature(code, metadata, "b".repeat(64), sig)).toBe(false);
  });

  it("produces different signatures for different keys", () => {
    const sigA = signSkillContent(code, metadata, "a".repeat(64));
    const sigB = signSkillContent(code, metadata, "b".repeat(64));
    expect(sigA).not.toBe(sigB);
  });
});
