import { tool } from "../types.js";
import { z } from "zod";
import { resolve } from "node:path";
import { execInContainer, isDockerAvailable } from "../container/docker.js";

export function createShellTool(agentName: string, agentsDir: string) {
  const agentWorkDir = resolve(agentsDir, agentName);

  return tool({
    description:
      "Execute a shell command inside a secure container. " +
      "The command runs in an isolated Docker container with access only to this agent's workspace. " +
      "Use for running scripts, installing packages, processing data, etc.",
    inputSchema: z.object({
      command: z.string().describe("The shell command to execute"),
      timeoutMs: z
        .number()
        .optional()
        .describe("Timeout in milliseconds (default: 60000)"),
    }),
    execute: async ({ command, timeoutMs }) => {
      if (!(await isDockerAvailable())) {
        return {
          error: "Docker is not available. Cannot execute commands without container isolation.",
        };
      }

      const result = await execInContainer({
        agentName,
        command: ["sh", "-c", command],
        mounts: [
          { hostPath: agentWorkDir, containerPath: "/workspace", readOnly: false },
        ],
        allowNetwork: true,
        readOnlyRootFs: false,
        timeoutMs,
      });

      const parts: string[] = [];
      if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
      if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
      if (result.timedOut) parts.push("(command timed out)");
      parts.push(`exit code: ${result.exitCode} (${result.durationMs}ms)`);

      return parts.join("\n\n");
    },
  });
}
