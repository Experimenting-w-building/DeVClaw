const SENSITIVE_KEY_RE =
  /(token|secret|password|passwd|api[_-]?key|authorization|auth|cookie|session|private[_-]?key|access[_-]?key|client[_-]?secret)/i;

const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const BEARER_RE = /^Bearer\s+/i;
const LONG_SECRETISH_RE = /^[A-Za-z0-9_\-.]{40,}$/;

function redactString(value: string): string {
  if (JWT_RE.test(value)) return "[REDACTED]";
  if (BEARER_RE.test(value)) return "[REDACTED]";
  if (LONG_SECRETISH_RE.test(value)) return "[REDACTED]";
  return value;
}

export function redactSensitive(input: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (input === null || input === undefined) return input;

  if (typeof input === "string") return redactString(input);
  if (typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map((v) => redactSensitive(v, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = redactSensitive(value, depth + 1);
  }
  return result;
}

export function redactForAudit(input: unknown, maxLength = 500): string {
  let out: string;
  try {
    out = JSON.stringify(redactSensitive(input));
  } catch {
    out = String(input);
  }
  return out.length > maxLength ? `${out.slice(0, maxLength)}...` : out;
}
