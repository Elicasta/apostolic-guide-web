import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { SolTool } from "../types";

function runtimeRoot(runId: string) {
  return path.join("/tmp", "sol-runtime", runId);
}

function safePath(runId: string, relativePath: string) {
  const root = runtimeRoot(runId);
  const resolved = path.resolve(root, relativePath.replace(/^\/+/, ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Filesystem path escapes the SOL runtime workspace.");
  return resolved;
}

const readInput = z.object({ path: z.string().min(1).max(500), encoding: z.literal("utf8").default("utf8") });
const readOutput = z.object({ path: z.string(), content: z.string(), bytes: z.number().int().nonnegative() });
export const solFilesystemReadTool: SolTool<z.infer<typeof readInput>, z.infer<typeof readOutput>> = {
  name: "filesystem.read",
  description: "Read a UTF-8 file from the run-scoped SOL temporary workspace.",
  inputSchema: readInput,
  outputSchema: readOutput,
  permissions: ["read"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "not_required",
  async execute(input, context) {
    try {
      const target = safePath(context.runId, input.path);
      const content = await readFile(target, "utf8");
      return { ok: true, data: { path: input.path, content, bytes: Buffer.byteLength(content) } };
    } catch (error) {
      return { ok: false, error: { code: "FILESYSTEM_READ_FAILED", message: error instanceof Error ? error.message : "Unable to read file.", retryable: false } };
    }
  }
};

const writeInput = z.object({ path: z.string().min(1).max(500), content: z.string().max(5_000_000) });
const writeOutput = z.object({ path: z.string(), bytes: z.number().int().nonnegative(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("file"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending", "passed", "failed"]) })) });
export const solFilesystemWriteTool: SolTool<z.infer<typeof writeInput>, z.infer<typeof writeOutput>> = {
  name: "filesystem.write",
  description: "Write a UTF-8 file into the run-scoped SOL temporary workspace.",
  inputSchema: writeInput,
  outputSchema: writeOutput,
  permissions: ["write"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "supported",
  async execute(input, context) {
    try {
      const target = safePath(context.runId, input.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, input.content, "utf8");
      const bytes = Buffer.byteLength(input.content);
      return { ok: true, data: { path: input.path, bytes, artifacts: [{ type: "runtime_file", title: path.basename(input.path), storageType: "file", location: target, metadata: { relativePath: input.path, ephemeral: true, bytes }, verificationStatus: "passed" }] } };
    } catch (error) {
      return { ok: false, error: { code: "FILESYSTEM_WRITE_FAILED", message: error instanceof Error ? error.message : "Unable to write file.", retryable: false } };
    }
  }
};

const moveInput = z.object({ from: z.string().min(1).max(500), to: z.string().min(1).max(500) });
const moveOutput = z.object({ from: z.string(), to: z.string() });
export const solFilesystemMoveTool: SolTool<z.infer<typeof moveInput>, z.infer<typeof moveOutput>> = {
  name: "filesystem.move",
  description: "Move a file inside the same run-scoped SOL temporary workspace.",
  inputSchema: moveInput,
  outputSchema: moveOutput,
  permissions: ["write"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "supported",
  async execute(input, context) {
    try {
      const from = safePath(context.runId, input.from);
      const to = safePath(context.runId, input.to);
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
      return { ok: true, data: input };
    } catch (error) {
      return { ok: false, error: { code: "FILESYSTEM_MOVE_FAILED", message: error instanceof Error ? error.message : "Unable to move file.", retryable: false } };
    }
  }
};

const existsInput = z.object({ path: z.string().min(1).max(500) });
const existsOutput = z.object({ path: z.string(), exists: z.boolean(), type: z.enum(["file", "directory", "other"]).nullable(), bytes: z.number().int().nonnegative().nullable() });
export const solFilesystemExistsTool: SolTool<z.infer<typeof existsInput>, z.infer<typeof existsOutput>> = {
  name: "filesystem.exists",
  description: "Check whether a run-scoped runtime file exists.",
  inputSchema: existsInput,
  outputSchema: existsOutput,
  permissions: ["read"],
  supportedEnvironments: ["local", "development", "preview", "production"],
  idempotency: "not_required",
  async execute(input, context) {
    try {
      const info = await stat(safePath(context.runId, input.path));
      return { ok: true, data: { path: input.path, exists: true, type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other", bytes: info.isFile() ? info.size : null } };
    } catch (error) {
      const code = objectCode(error);
      if (code === "ENOENT") return { ok: true, data: { path: input.path, exists: false, type: null, bytes: null } };
      return { ok: false, error: { code: "FILESYSTEM_STAT_FAILED", message: error instanceof Error ? error.message : "Unable to inspect file.", retryable: false } };
    }
  }
};

function objectCode(error: unknown) {
  return error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}
