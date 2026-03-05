export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[minLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: LogLevel, tag: string, msg: string, extra?: Record<string, unknown>): string {
  const base = `${timestamp()} [${level.toUpperCase()}] [${tag}] ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    return `${base} ${JSON.stringify(extra)}`;
  }
  return base;
}

export interface Logger {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
}

export function createLogger(tag: string): Logger {
  return {
    debug(msg, extra) {
      if (shouldLog("debug")) console.debug(format("debug", tag, msg, extra));
    },
    info(msg, extra) {
      if (shouldLog("info")) console.log(format("info", tag, msg, extra));
    },
    warn(msg, extra) {
      if (shouldLog("warn")) console.warn(format("warn", tag, msg, extra));
    },
    error(msg, extra) {
      if (shouldLog("error")) console.error(format("error", tag, msg, extra));
    },
  };
}
