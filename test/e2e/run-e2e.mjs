import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const isVisual = rawArgs.includes("--visual");
const args = rawArgs.filter((a) => a !== "--visual");
const inCi = ["1", "true"].includes(String(process.env.CI ?? "").toLowerCase());
const forceLocal = process.env.E2E_FORCE === "1";
const confFile = isVisual ? "./test/e2e/wdio.visual.conf.ts" : "./test/e2e/wdio.conf.ts";
const label = isVisual ? "test:visual" : "test:e2e";

function getTauriDriverPath() {
  return process.env.TAURI_DRIVER_PATH ?? path.join(homedir(), ".cargo", "bin", "tauri-driver");
}

function probeDriver(driverPath) {
  if (!existsSync(driverPath)) {
    return {
      supported: false,
      reason: `未找到 tauri-driver: ${driverPath}`,
    };
  }

  const result = spawnSync(driverPath, ["--help"], { encoding: "utf-8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();

  if (result.error) {
    return {
      supported: false,
      reason: `无法执行 tauri-driver: ${result.error.message}`,
    };
  }

  if (output.includes("not supported on this platform")) {
    return {
      supported: false,
      reason: "当前平台不支持 tauri-driver",
    };
  }

  return { supported: true, reason: "" };
}

if (!inCi && !forceLocal) {
  const driverPath = getTauriDriverPath();
  const probe = probeDriver(driverPath);

  if (!probe.supported) {
    console.log(`[${label}] 已跳过: ${probe.reason}`);
    console.log(`[${label}] 当前策略: 本地默认不强制 E2E，CI 强制执行 E2E/Visual。`);
    console.log(`[${label}] 本地建议运行: pnpm run test:local`);
    console.log(`[${label}] 若你已具备环境并希望强制执行: E2E_FORCE=1 pnpm run ${label}`);
    process.exit(0);
  }
}

const run = spawnSync("pnpm", ["exec", "wdio", "run", confFile, ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (run.error) {
  console.error(`[${label}] 执行失败: ${run.error.message}`);
  process.exit(1);
}

process.exit(run.status ?? 1);
