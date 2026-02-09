import type { Options } from "@wdio/types";
import * as path from "path";

// Detect binary path based on platform
function getBinaryPath(): string {
  const platform = process.platform;
  const target = path.resolve(__dirname, "../../src-tauri/target/debug");

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
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./test/e2e/tsconfig.json",
    },
  },
  specs: ["./test/e2e/specs/**/*.test.ts"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: getBinaryPath(),
      },
    } as any,
  ],
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
};
