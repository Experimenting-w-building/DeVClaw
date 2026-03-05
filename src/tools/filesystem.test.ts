import { describe, it, expect } from "vitest";
import { posix } from "node:path";

function safePath(userPath: string): string | null {
  const normalized = posix.normalize(userPath);
  if (posix.isAbsolute(normalized) || normalized.startsWith("..")) return null;
  const resolved = posix.resolve("/workspace", normalized);
  if (!resolved.startsWith("/workspace/")) return null;
  return resolved;
}

describe("safePath", () => {
  it("allows simple relative paths", () => {
    expect(safePath("file.txt")).toBe("/workspace/file.txt");
    expect(safePath("dir/file.txt")).toBe("/workspace/dir/file.txt");
  });

  it("allows nested paths", () => {
    expect(safePath("a/b/c/d.json")).toBe("/workspace/a/b/c/d.json");
  });

  it("blocks absolute paths", () => {
    expect(safePath("/etc/passwd")).toBeNull();
    expect(safePath("/workspace/../etc/passwd")).toBeNull();
  });

  it("blocks path traversal with ..", () => {
    expect(safePath("../secret")).toBeNull();
    expect(safePath("../../etc/passwd")).toBeNull();
    expect(safePath("foo/../../etc/passwd")).toBeNull();
  });

  it("blocks traversal disguised in the middle", () => {
    expect(safePath("a/b/../../../etc/passwd")).toBeNull();
  });

  it("normalizes but allows safe internal ..", () => {
    expect(safePath("a/b/../c.txt")).toBe("/workspace/a/c.txt");
  });

  it("blocks bare ..", () => {
    expect(safePath("..")).toBeNull();
  });

  it("handles empty-ish paths", () => {
    expect(safePath(".")).toBeNull();
    expect(safePath("./")).toBeNull();
  });
});
