import { toJSONSchema } from "zod";
import type { z } from "zod";

/**
 * Convert a Zod schema to JSON Schema using Zod v4's built-in converter.
 * Strips the ~standard property that Zod attaches.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const result = toJSONSchema(schema, { target: "draft-07" });
  const { "~standard": _, ...jsonSchema } = result as Record<string, unknown>;
  return jsonSchema;
}
