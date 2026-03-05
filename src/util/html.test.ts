import { describe, it, expect } from "vitest";
import { escapeHtml } from "./html.js";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('value="injected"')).toBe("value=&quot;injected&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("handles strings with no special characters", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("handles empty strings", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes multiple special characters together", () => {
    expect(escapeHtml('<div class="a & b">')).toBe(
      "&lt;div class=&quot;a &amp; b&quot;&gt;"
    );
  });
});
