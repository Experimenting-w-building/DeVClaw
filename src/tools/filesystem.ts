import { tool } from "../types.js";
import { z } from "zod";
import { resolve } from "node:path";
import { execInContainer, isDockerAvailable } from "../container/docker.js";

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

      const cmd = maxLines
        ? `head -n ${maxLines} "/workspace/${path}"`
        : `cat "/workspace/${path}"`;

      const result = await execInContainer({
        agentName,
        command: ["sh", "-c", cmd],
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

      const escapedContent = content.replace(/'/g, "'\\''");
      const cmd = `mkdir -p "$(dirname "/workspace/${path}")" && printf '%s' '${escapedContent}' > "/workspace/${path}"`;

      const result = await execInContainer({
        agentName,
        command: ["sh", "-c", cmd],
        mounts: [
          { hostPath: agentWorkDir, containerPath: "/workspace", readOnly: false },
        ],
        timeoutMs: 10_000,
      });

      if (result.exitCode !== 0) {
        return `Error writing file: ${result.stderr}`;
      }
      return `File written: ${path}`;
    },
  });
}
