import { tool } from "../types.js";
import { z } from "zod";
import { execInContainer, isDockerAvailable } from "../container/docker.js";

const BROWSER_IMAGE = "mcr.microsoft.com/playwright:v1.50.0-noble";

export function createBrowserTool(agentName: string) {
  return tool({
    description:
      "Browse a web page and extract content. Runs a headless browser in a secure container. " +
      "Use 'extract_text' to get page text, 'extract_links' to get all links, or 'screenshot' to capture the page. " +
      "Content is sanitized and truncated for safety.",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to visit"),
      action: z
        .enum(["extract_text", "extract_links", "screenshot"])
        .default("extract_text")
        .describe("What to extract from the page"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to target specific content (for extract_text)"),
      waitMs: z
        .number()
        .optional()
        .describe("Milliseconds to wait after page load (default: 3000)"),
    }),
    execute: async ({ url, action, selector, waitMs }) => {
      if (!(await isDockerAvailable())) {
        return { error: "Docker is not available. Cannot browse without container isolation." };
      }

      const browserArgs = JSON.stringify({ url, action, selector, waitMs });

      const result = await execInContainer({
        agentName,
        image: BROWSER_IMAGE,
        command: ["node", "/opt/browser-script.js"],
        env: { BROWSER_ARGS: browserArgs },
        timeoutMs: 45_000,
        memoryBytes: 1024 * 1024 * 1024, // 1GB for browser
      });

      if (result.timedOut) {
        return { error: "Browser operation timed out after 45 seconds." };
      }

      if (result.exitCode !== 0) {
        try {
          return JSON.parse(result.stderr);
        } catch {
          return { error: result.stderr || "Browser operation failed" };
        }
      }

      try {
        const parsed = JSON.parse(result.stdout);
        if (parsed.text) {
          parsed.text = sanitizeWebContent(parsed.text);
        }
        return parsed;
      } catch {
        return { error: "Failed to parse browser output" };
      }
    },
  });
}

function sanitizeWebContent(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);
}
