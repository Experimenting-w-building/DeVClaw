import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "./zod-to-json.js";

describe("zodToJsonSchema", () => {
  it("converts a simple object schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("object");
    expect(result.properties).toBeDefined();
  });

  it("converts a string schema", () => {
    const schema = z.string();
    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("string");
  });

  it("strips the ~standard property", () => {
    const schema = z.object({ x: z.number() });
    const result = zodToJsonSchema(schema);
    expect(result).not.toHaveProperty("~standard");
  });
});
