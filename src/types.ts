import { z } from "zod";

// --- Tool system (replaces Vercel AI SDK tool types) ---

export interface ToolDefinition<T = any> {
  description: string;
  inputSchema: z.ZodType<T>;
  execute: (input: T) => Promise<unknown>;
}

export type ToolSet = Record<string, ToolDefinition>;

export function tool(def: ToolDefinition): ToolDefinition {
  return def;
}

// --- Chat message types ---

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// --- LLM config ---

export const LLMProviderSchema = z.enum([
  "anthropic",
  "openai",
  "google",
]);

export const ModelConfigSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string(),
});

export const AgentCapability = z.enum([
  "shell",
  "browser",
  "filesystem",
  "scheduler",
  "skill-builder",
  "delegate",
]);

export const AgentDefinitionSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, "Lowercase alphanumeric and hyphens only"),
  displayName: z.string(),
  personality: z.string(),
  model: ModelConfigSchema,
  telegramBotToken: z.string().describe("Env var reference like 'env:MAIN_BOT_TOKEN' or raw token"),
  secrets: z.array(z.string()).default([]),
  capabilities: z.array(AgentCapability).default(["shell", "filesystem"]),
});

export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const SkillTier = z.enum(["sandbox", "trusted"]);
export type SkillTier = z.infer<typeof SkillTier>;

export interface SkillDefinition {
  id: string;
  agentName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  codeHash: string;
  tier: SkillTier;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ScheduledTask {
  id: string;
  agentName: string;
  description: string;
  cronExpression: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface AgentMessage {
  id: string;
  agentName: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface DelegationRequest {
  id: string;
  fromAgent: string;
  toAgent: string;
  task: string;
  waitForResult: boolean;
}

export interface DelegationResponse {
  requestId: string;
  fromAgent: string;
  result: string;
  success: boolean;
  durationMs: number;
}

export interface AuditLogEntry {
  id: string;
  agentName: string;
  action: string;
  detail: string;
  timestamp: string;
}
