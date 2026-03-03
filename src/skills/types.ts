import { z } from "zod";

export const SkillMetadataSchema = z.object({
  name: z.string().regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric, underscores, and hyphens only"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  inputSchema: z.record(z.string(), z.unknown()).describe("JSON Schema for the tool input"),
  version: z.string().default("1.0.0"),
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

/**
 * A skill file is a TypeScript file in the agent's skills directory with this structure:
 *
 * // metadata.json (sibling file)
 * { "name": "fetch-price", "description": "...", "inputSchema": { ... } }
 *
 * // index.ts (the skill code, executed in a container)
 * const input = JSON.parse(process.env.SKILL_INPUT || '{}');
 * // ... skill logic ...
 * console.log(JSON.stringify({ result: "..." }));
 */
