import { createLogger } from "./logger.js";

const log = createLogger("validate");

export interface ValidationResult {
  valid: boolean;
  message: string;
  detail?: string;
}

export function validateOwnerChatId(chatId: string): ValidationResult {
  if (!chatId.trim()) return { valid: false, message: "Chat ID is required" };
  if (!/^\d+$/.test(chatId.trim()))
    return { valid: false, message: "Chat ID must be a numeric value (get it from @userinfobot on Telegram)" };
  return { valid: true, message: "Valid chat ID format" };
}

export async function validateTelegramToken(token: string): Promise<ValidationResult> {
  const trimmed = token.trim();
  if (!trimmed) return { valid: false, message: "Bot token is required" };
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(trimmed))
    return { valid: false, message: "Token format looks invalid (expected format: 123456:ABCdef...)" };

  try {
    const resp = await fetch(`https://api.telegram.org/bot${trimmed}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { valid: false, message: "Telegram rejected the token", detail: body };
    }
    const data = (await resp.json()) as { ok: boolean; result?: { username?: string } };
    if (!data.ok) return { valid: false, message: "Telegram API returned an error" };
    const username = data.result?.username ?? "unknown";
    return { valid: true, message: `Verified: @${username}`, detail: username };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Could not reach Telegram API: ${msg}` };
  }
}

export async function validateAnthropicKey(key: string): Promise<ValidationResult> {
  const trimmed = key.trim();
  if (!trimmed) return { valid: false, message: "API key is required" };
  if (!trimmed.startsWith("sk-ant-"))
    return { valid: false, message: "Key should start with sk-ant-" };

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": trimmed,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.status === 401)
      return { valid: false, message: "Invalid API key (authentication failed)" };
    if (resp.status === 403)
      return { valid: false, message: "API key lacks permissions" };
    return { valid: true, message: "Anthropic API key verified" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timeout")) return { valid: false, message: "Anthropic API timed out" };
    return { valid: false, message: `Could not reach Anthropic API: ${msg}` };
  }
}

export async function validateOpenAIKey(key: string): Promise<ValidationResult> {
  const trimmed = key.trim();
  if (!trimmed) return { valid: false, message: "API key is required" };

  try {
    const resp = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${trimmed}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.status === 401)
      return { valid: false, message: "Invalid API key (authentication failed)" };
    if (!resp.ok)
      return { valid: false, message: `OpenAI returned status ${resp.status}` };
    return { valid: true, message: "OpenAI API key verified" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Could not reach OpenAI API: ${msg}` };
  }
}

export async function validateGoogleKey(key: string): Promise<ValidationResult> {
  const trimmed = key.trim();
  if (!trimmed) return { valid: false, message: "API key is required" };

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmed}&pageSize=1`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (resp.status === 400 || resp.status === 403)
      return { valid: false, message: "Invalid or unauthorized API key" };
    if (!resp.ok)
      return { valid: false, message: `Google API returned status ${resp.status}` };
    return { valid: true, message: "Google AI API key verified" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: `Could not reach Google AI API: ${msg}` };
  }
}

export async function validateLLMKey(
  provider: "anthropic" | "openai" | "google",
  key: string
): Promise<ValidationResult> {
  switch (provider) {
    case "anthropic": return validateAnthropicKey(key);
    case "openai": return validateOpenAIKey(key);
    case "google": return validateGoogleKey(key);
  }
}
