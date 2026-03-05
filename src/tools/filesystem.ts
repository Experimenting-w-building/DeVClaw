import { tool } from "../types.js";
import { z } from "zod";
import { resolve, posix } from "node:path";
import { execInContainer, isDockerAvailable } from "../container/docker.js";

function safePath(userPath: string): string | null {
  const normalized = posix.normalize(userPath);
  if (posix.isAbsolute(normalized) || normalized.startsWith("..")) return null;
  const resolved = posix.resolve("/workspace", normalized);
  if (!resolved.startsWith("/workspace/")) return null;
  return resolved;
}

export function createFilesystemReadTool(agentName: string, agentsDir: string) {
  const agentWorkDir = resolve(agentsDir, agentName);

  return tool({
    description:
      "Read a file from this agent's workspace. Path is relative to the agent's directory.",
    inputSchema: z.object({
      path: z.string().describe("Relative path to the file to read"),
      maxLines: z.number().optional().describe("Maximum number of lines to return (default: all)"),
    }),
    execute: async ({ path, maxLines }) => {
      if (!(await isDockerAvailable())) {
        return { error: "Docker is not available." };
      }

      const resolved = safePath(path);
      if (!resolved) {
        return { error: "Invalid path: must be relative and within the workspace." };
      }

      const command = maxLines
        ? ["head", "-n", String(maxLines), resolved]
        : ["cat", resolved];

      const result = await execInContainer({
        agentName,
        command,
        mounts: [
          { hostPath: agentWorkDir, containerPath: "/workspace", readOnly: true },
        ],
        timeoutMs: 10_000,
      });

      if (result.exitCode !== 0) {
        return `Error reading file: ${result.stderr || "file not found"}`;
      }
      return result.stdout;
    },
  });
}

export function createFilesystemWriteTool(agentName: string, agentsDir: string) {
  const agentWorkDir = resolve(agentsDir, agentName);

  return tool({
    description:
      "Write content to a file in this agent's workspace. Creates parent directories if needed. Path is relative to the agent's directory.",
    inputSchema: z.object({
      path: z.string().describe("Relative path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    }),
    execute: async ({ path, content }) => {
      if (!(await isDockerAvailable())) {
        return { error: "Docker is not available." };
      }

      const resolved = safePath(path);
      if (!resolved) {
        return { error: "Invalid path: must be relative and within the workspace." };
      }

      const dir = posix.dirname(resolved);

      const result = await execInContainer({
        agentName,
        command: ["sh", "-c", `mkdir -p "$1" && printf '%s' "$FILE_CONTENT" > "$2"`, "--", dir, resolved],
        mounts: [
          { hostPath: agentWorkDir, containerPath: "/workspace", readOnly: false },
        ],
        env: { FILE_CONTENT: content },
        timeoutMs: 10_000,
      });

      if (result.exitCode !== 0) {
        return `Error writing file: ${result.stderr}`;
      }
      return `File written: ${path}`;
    },
  });
}
