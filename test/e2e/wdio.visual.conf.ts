import type { Options } from "@wdio/types";
import * as path from "path";
import { fileURLToPath } from "url";
import { config as baseConfig } from "./wdio.conf";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

export const config: Options.Testrunner = {
  ...baseConfig,
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
  mochaOpts: {
    ui: "bdd",
    timeout: 90000,
  },
};
