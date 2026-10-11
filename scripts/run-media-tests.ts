import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { explainMediaProcess } from "../tests/media-process";

const MEDIA_TOOLS = ["ffmpeg", "ffprobe", "python3"] as const;

export function isDefaultUnitTest(file: string) {
  return /^tests\/[^/]+\.test\.ts$/.test(file.replaceAll("\\", "/"));
}

export function mediaTestFiles(directory = "tests/media") {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".test.ts"))
    .sort()
    .map((file) => path.posix.join(directory.replaceAll("\\", "/"), file));
}

export function mediaToolFailure(command: string) {
  const versionFlag = command === "python3" ? "--version" : "-version";
  const result = spawnSync(command, [versionFlag], { encoding: "utf8" });
  return explainMediaProcess(command, result);
}

function assertNode22() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 22) {
    throw new Error(`Media integration tests require Node 22.x. Current runtime is ${process.version}.`);
  }
}

function main() {
  assertNode22();
  console.log(`Media integration tests · Node ${process.version}`);
  for (const tool of MEDIA_TOOLS) {
    const failure = mediaToolFailure(tool);
    if (failure) {
      console.error(failure);
      console.error("Media integration tests do not skip when FFmpeg or Python is missing.");
      process.exit(1);
    }
  }
  const files = mediaTestFiles();
  if (!files.length) {
    console.error("No media integration tests were found in tests/media. Refusing to pass an empty media suite.");
    process.exit(1);
  }
  if (files.some((file) => isDefaultUnitTest(file))) {
    console.error("Media tests must live below tests/media so Vercel and Studio unit tests do not require FFmpeg.");
    process.exit(1);
  }
  const child = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
  const failure = explainMediaProcess("node --test tests/media", child);
  if (failure) {
    console.error(failure);
    process.exit(child.status && child.status > 0 ? child.status : 1);
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Media integration tests failed.");
    process.exit(1);
  }
}
