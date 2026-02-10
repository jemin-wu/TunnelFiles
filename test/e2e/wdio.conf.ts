import type { Options } from "@wdio/types";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import { spawn, type ChildProcess } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

let tauriDriver: ChildProcess | undefined;

// Skip spawning tauri-driver when it's already running (e.g. in Docker entrypoint)
const externalDriver = process.env.TAURI_DRIVER_EXTERNAL === "1";

// Detect binary path based on platform
function getBinaryPath(): string {
  const platform = process.platform;
  const target = path.resolve(projectRoot, "src-tauri/target/debug");

  if (platform === "darwin") {
    return path.join(target, "bundle/macos/TunnelFiles.app/Contents/MacOS/TunnelFiles");
  } else if (platform === "win32") {
    return path.join(target, "tunnelfiles.exe");
  }
  // Linux
  return path.join(target, "tunnelfiles");
}

export const config: Options.Testrunner = {
  runner: "local",
  specs: [path.resolve(projectRoot, "test/e2e/specs/**/*.test.ts")],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: getBinaryPath(),
      },
    } as any,
  ],
  host: "127.0.0.1",
  port: 4444,
  logLevel: "warn",
  waitforTimeout: 10000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 3,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  // Spawn tauri-driver before each session (unless externally managed)
  beforeSession() {
    if (externalDriver) return;
    const driverPath = path.resolve(os.homedir(), ".cargo", "bin", "tauri-driver");
    tauriDriver = spawn(driverPath, [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Promise((resolve) => setTimeout(resolve, 500));
  },

  // Kill tauri-driver after each session
  afterSession() {
    if (tauriDriver) {
      tauriDriver.kill();
      tauriDriver = undefined;
    }
  },
};
