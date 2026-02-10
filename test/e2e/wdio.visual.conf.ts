import type { Options } from "@wdio/types";
import * as path from "path";
import { fileURLToPath } from "url";
import { config as baseConfig } from "./wdio.conf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

export const config: Options.Testrunner = {
  ...baseConfig,
  maxInstances: 1,
  specs: [path.resolve(projectRoot, "test/e2e/visual/**/*.visual.ts")],
  services: [
    [
      "visual",
      {
        baselineFolder: path.resolve(__dirname, "visual-baselines"),
        formatImageName: "{tag}-{logName}-{width}x{height}",
        screenshotPath: path.resolve(__dirname, ".tmp"),
        autoSaveBaseline: process.env.CI !== "true",
        disableCSSAnimation: true,
        hideScrollBars: true,
      },
    ],
  ],
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 5,
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },
};
