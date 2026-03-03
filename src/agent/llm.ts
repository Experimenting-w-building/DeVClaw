import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "../util/zod-to-json.js";
import type { ModelConfig, LLMProvider, ToolSet, ChatMessage } from "../types.js";
import { loadConfig } from "../config.js";

export interface LLMCallOptions {
  modelConfig: ModelConfig;
  system: string;
  messages: ChatMessage[];
  tools?: ToolSet;
  maxSteps?: number;
  onToolCall?: (toolName: string, input: unknown) => void;
}

export interface LLMCallResult {
  text: string;
  steps: Array<{
    text: string;
    toolCalls: Array<{ name: string; input: unknown }>;
    toolResults: Array<{ name: string; result: unknown }>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMCallResult> {
  const maxSteps = opts.maxSteps ?? 10;

  switch (opts.modelConfig.provider) {
    case "anthropic":
      return callAnthropic(opts, maxSteps);
    case "openai":
      return callOpenAI(opts, maxSteps);
    case "google":
      return callGoogle(opts, maxSteps);
  }
}

// --------------- Anthropic ---------------

function getAnthropicClient(): Anthropic {
  const config = loadConfig();
  if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: config.anthropicApiKey });
}

function toAnthropicTools(tools: ToolSet): Anthropic.Messages.Tool[] {
  return Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    input_schema: zodToJsonSchema(def.inputSchema) as Anthropic.Messages.Tool.InputSchema,
  }));
}

async function callAnthropic(opts: LLMCallOptions, maxSteps: number): Promise<LLMCallResult> {
  const client = getAnthropicClient();
  const anthropicTools = opts.tools ? toAnthropicTools(opts.tools) : undefined;

  let messages: Anthropic.Messages.MessageParam[] = opts.messages.map((m) => ({
    role: m.role === "system" ? "user" : m.role,
    content: m.content,
  }));

  const steps: LLMCallResult["steps"] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let step = 0; step < maxSteps; step++) {
    const response = await client.messages.create({
      model: opts.modelConfig.model,
      max_tokens: 4096,
      system: opts.system,
      messages,
      tools: anthropicTools,
    });

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    const textParts = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text);

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );

    const stepToolCalls = toolUses.map((t) => ({ name: t.name, input: t.input }));
    const stepToolResults: Array<{ name: string; result: unknown }> = [];

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      steps.push({ text: textParts.join("\n"), toolCalls: stepToolCalls, toolResults: [] });
      return { text: textParts.join("\n"), steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      opts.onToolCall?.(tu.name, tu.input);
      const toolDef = opts.tools?.[tu.name];
      let result: unknown;
      if (toolDef) {
        try {
          const parsed = toolDef.inputSchema.parse(tu.input);
          result = await toolDef.execute(parsed);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
      } else {
        result = { error: `Unknown tool: ${tu.name}` };
      }
      stepToolResults.push({ name: tu.name, result });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });
    steps.push({ text: textParts.join("\n"), toolCalls: stepToolCalls, toolResults: stepToolResults });
  }

  const lastStep = steps[steps.length - 1];
  return { text: lastStep?.text ?? "", steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
}

// --------------- OpenAI ---------------

function getOpenAIClient(): OpenAI {
  const config = loadConfig();
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: config.openaiApiKey });
}

function toOpenAITools(tools: ToolSet): OpenAI.ChatCompletionTool[] {
  return Object.entries(tools).map(([name, def]) => ({
    type: "function" as const,
    function: {
      name,
      description: def.description,
      parameters: zodToJsonSchema(def.inputSchema),
    },
  }));
}

async function callOpenAI(opts: LLMCallOptions, maxSteps: number): Promise<LLMCallResult> {
  const client = getOpenAIClient();
  const openaiTools = opts.tools ? toOpenAITools(opts.tools) : undefined;

  let messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    ...opts.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const steps: LLMCallResult["steps"] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let step = 0; step < maxSteps; step++) {
    const response = await client.chat.completions.create({
      model: opts.modelConfig.model,
      messages,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    totalInput += response.usage?.prompt_tokens ?? 0;
    totalOutput += response.usage?.completion_tokens ?? 0;

    const text = choice.message.content ?? "";
    const rawToolCalls = choice.message.tool_calls ?? [];
    const fnToolCalls = rawToolCalls.filter(
      (tc): tc is OpenAI.ChatCompletionMessageParam & { type: "function"; id: string; function: { name: string; arguments: string } } =>
        tc.type === "function"
    );

    const stepToolCalls = fnToolCalls.map((tc) => ({
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));
    const stepToolResults: Array<{ name: string; result: unknown }> = [];

    if (fnToolCalls.length === 0 || choice.finish_reason === "stop") {
      steps.push({ text, toolCalls: stepToolCalls, toolResults: [] });
      return { text, steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
    }

    messages.push(choice.message);

    for (const tc of fnToolCalls) {
      const fnName = tc.function.name;
      const fnArgs = JSON.parse(tc.function.arguments);
      opts.onToolCall?.(fnName, fnArgs);
      const toolDef = opts.tools?.[fnName];
      let result: unknown;
      if (toolDef) {
        try {
          const parsed = toolDef.inputSchema.parse(fnArgs);
          result = await toolDef.execute(parsed);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
      } else {
        result = { error: `Unknown tool: ${fnName}` };
      }
      stepToolResults.push({ name: fnName, result });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }

    steps.push({ text, toolCalls: stepToolCalls, toolResults: stepToolResults });
  }

  const lastStep = steps[steps.length - 1];
  return { text: lastStep?.text ?? "", steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
}

// --------------- Google ---------------

function getGoogleClient(): GoogleGenAI {
  const config = loadConfig();
  if (!config.googleApiKey) throw new Error("GOOGLE_API_KEY not set");
  return new GoogleGenAI({ apiKey: config.googleApiKey });
}

function toGoogleTools(tools: ToolSet) {
  const declarations = Object.entries(tools).map(([name, def]) => ({
    name,
    description: def.description,
    parameters: zodToJsonSchema(def.inputSchema),
  }));
  return [{ functionDeclarations: declarations }];
}

async function callGoogle(opts: LLMCallOptions, maxSteps: number): Promise<LLMCallResult> {
  const client = getGoogleClient();
  const googleTools = opts.tools ? toGoogleTools(opts.tools) : undefined;

  type GoogleContent = { role: "user" | "model"; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }> };

  let contents: GoogleContent[] = opts.messages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const steps: LLMCallResult["steps"] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (let step = 0; step < maxSteps; step++) {
    const response = await client.models.generateContent({
      model: opts.modelConfig.model,
      contents,
      config: {
        systemInstruction: opts.system,
        tools: googleTools,
      },
    });

    totalInput += response.usageMetadata?.promptTokenCount ?? 0;
    totalOutput += response.usageMetadata?.candidatesTokenCount ?? 0;

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const textParts = parts.filter((p) => p.text).map((p) => p.text!);
    const fnCalls = response.functionCalls ?? [];

    const stepToolCalls = fnCalls.map((fc) => ({ name: fc.name!, input: fc.args }));
    const stepToolResults: Array<{ name: string; result: unknown }> = [];

    if (fnCalls.length === 0) {
      steps.push({ text: textParts.join("\n"), toolCalls: [], toolResults: [] });
      return { text: textParts.join("\n"), steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
    }

    contents.push({
      role: "model",
      parts: parts.map((p) => {
        if (p.functionCall) return { functionCall: { name: p.functionCall.name!, args: p.functionCall.args ?? {} } };
        return { text: p.text ?? "" };
      }),
    });

    const responseParts: GoogleContent["parts"] = [];
    for (const fc of fnCalls) {
      opts.onToolCall?.(fc.name!, fc.args);
      const toolDef = opts.tools?.[fc.name!];
      let result: unknown;
      if (toolDef) {
        try {
          const parsed = toolDef.inputSchema.parse(fc.args);
          result = await toolDef.execute(parsed);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
      } else {
        result = { error: `Unknown tool: ${fc.name}` };
      }
      stepToolResults.push({ name: fc.name!, result });
      const responseObj: Record<string, unknown> =
        typeof result === "string" ? { result } :
        (result && typeof result === "object") ? result as Record<string, unknown> :
        { result };
      responseParts.push({
        functionResponse: { name: fc.name!, response: responseObj },
      });
    }

    contents.push({ role: "user", parts: responseParts });
    steps.push({ text: textParts.join("\n"), toolCalls: stepToolCalls, toolResults: stepToolResults });
  }

  const lastStep = steps[steps.length - 1];
  return { text: lastStep?.text ?? "", steps, usage: { inputTokens: totalInput, outputTokens: totalOutput } };
}
