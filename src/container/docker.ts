import Docker from "dockerode";
import { PassThrough } from "node:stream";
import { createLogger } from "../util/logger.js";

const log = createLogger("docker");

const docker = new Docker();

const BASE_IMAGE = "node:22-alpine";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MEMORY = 512 * 1024 * 1024; // 512MB
const DEFAULT_CPU_PERIOD = 100_000;
const DEFAULT_CPU_QUOTA = 100_000; // 1 core
const DEFAULT_PIDS_LIMIT = 256;

export interface ContainerExecOptions {
  agentName: string;
  image?: string;
  command: string[];
  workDir?: string;
  mounts?: Array<{ hostPath: string; containerPath: string; readOnly?: boolean }>;
  env?: Record<string, string>;
  timeoutMs?: number;
  memoryBytes?: number;
  allowNetwork?: boolean;
  readOnlyRootFs?: boolean;
  runAsUser?: string;
  pidsLimit?: number;
}

export interface ContainerExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
}

export async function ensureImage(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
  } catch {
    log.info(`Pulling image: ${image}`);
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    log.info(`Image pulled: ${image}`);
  }
}

export async function execInContainer(
  opts: ContainerExecOptions
): Promise<ContainerExecResult> {
  const image = opts.image ?? BASE_IMAGE;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  await ensureImage(image);

  const binds = (opts.mounts ?? []).map((m) => {
    const ro = m.readOnly ? ":ro" : "";
    return `${m.hostPath}:${m.containerPath}${ro}`;
  });

  const envArr = Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`);

  const container = await docker.createContainer({
    Image: image,
    Cmd: opts.command,
    WorkingDir: opts.workDir ?? "/workspace",
    Env: envArr,
    HostConfig: {
      Binds: binds.length > 0 ? binds : undefined,
      Memory: opts.memoryBytes ?? DEFAULT_MEMORY,
      CpuPeriod: DEFAULT_CPU_PERIOD,
      CpuQuota: DEFAULT_CPU_QUOTA,
      NetworkMode: opts.allowNetwork ? "bridge" : "none",
      ReadonlyRootfs: opts.readOnlyRootFs ?? true,
      SecurityOpt: ["no-new-privileges"],
      CapDrop: ["ALL"],
      PidsLimit: opts.pidsLimit ?? DEFAULT_PIDS_LIMIT,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
    },
    User: opts.runAsUser,
    Labels: {
      "devclaw.agent": opts.agentName,
      "devclaw.managed": "true",
    },
  });

  let timedOut = false;
  const timeoutHandle = setTimeout(async () => {
    timedOut = true;
    try {
      await container.kill();
    } catch {
      // container may already be stopped
    }
  }, timeoutMs);

  try {
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    let stdout = "";
    let stderr = "";

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    stdoutStream.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    stderrStream.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    await container.start();
    const { StatusCode } = await container.wait();

    clearTimeout(timeoutHandle);

    // Give streams a moment to flush
    await new Promise((r) => setTimeout(r, 100));

    const maxOutput = 50_000;

    return {
      stdout: stdout.slice(0, maxOutput),
      stderr: stderr.slice(0, maxOutput),
      exitCode: StatusCode,
      timedOut,
      durationMs: Date.now() - startTime,
    };
  } finally {
    clearTimeout(timeoutHandle);
    try {
      await container.remove({ force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export async function cleanupAgentContainers(agentName: string): Promise<number> {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: [`devclaw.agent=${agentName}`, "devclaw.managed=true"],
    },
  });

  let cleaned = 0;
  for (const info of containers) {
    try {
      const c = docker.getContainer(info.Id);
      await c.remove({ force: true });
      cleaned++;
    } catch {
      // ignore
    }
  }
  return cleaned;
}
