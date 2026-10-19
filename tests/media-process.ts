import { spawnSync } from "node:child_process";

export type MediaProcessResult = {
  error?: Error | null;
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr?: string | Buffer | null;
  stdout?: string | Buffer | null;
};

function outputText(value: string | Buffer | null | undefined) {
  if (!value) return "";
  const text = (Buffer.isBuffer(value) ? value.toString("utf8") : value).trim();
  return text.slice(-2000);
}

export function explainMediaProcess(command: string, result: MediaProcessResult) {
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return `Missing media executable: ${command} is not on PATH. Install FFmpeg before running media integration tests.`;
    }
    return `Could not start ${command}: ${result.error.message}`;
  }
  if (result.signal) {
    const detail = outputText(result.stderr) || outputText(result.stdout);
    return `${command} was killed by signal ${result.signal} before it exited.${detail ? ` ${detail}` : ""}`;
  }
  if (result.status === null) {
    const detail = outputText(result.stderr) || outputText(result.stdout);
    return `${command} ended without an exit code or signal.${detail ? ` ${detail}` : ""}`;
  }
  if (result.status !== 0) {
    const detail = outputText(result.stderr) || outputText(result.stdout);
    return `${command} exited ${result.status}.${detail ? ` ${detail}` : ""}`;
  }
  return null;
}

export function assertMediaProcess(command: string, result: MediaProcessResult) {
  const failure = explainMediaProcess(command, result);
  if (failure) throw new Error(failure);
}

export function runMediaProcess(command: string, args: string[], options: { cwd?: string; encoding?: "utf8" | "buffer" } = {}) {
  const encoding = options.encoding ?? "utf8";
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: encoding === "buffer" ? undefined : "utf8"
  });
  assertMediaProcess(command, result);
  return result;
}
