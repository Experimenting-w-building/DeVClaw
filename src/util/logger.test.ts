import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger, setLogLevel } from "./logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    setLogLevel("info");
    vi.restoreAllMocks();
  });

  it("logs info messages to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger("test");
    log.info("hello");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[INFO]");
    expect(spy.mock.calls[0][0]).toContain("[test]");
    expect(spy.mock.calls[0][0]).toContain("hello");
  });

  it("logs error messages to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger("db");
    log.error("connection failed");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[ERROR]");
    expect(spy.mock.calls[0][0]).toContain("[db]");
  });

  it("suppresses debug when level is info", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("test");
    log.debug("hidden");
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows debug when level is debug", () => {
    setLogLevel("debug");
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const log = createLogger("test");
    log.debug("visible");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("includes extra data as JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger("test");
    log.info("details", { key: "value" });
    expect(spy.mock.calls[0][0]).toContain('"key":"value"');
  });
});
