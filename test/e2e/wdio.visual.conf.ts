import type { Options } from "@wdio/types";
import * as path from "path";
import { config as baseConfig } from "./wdio.conf";

export const config: Options.Testrunner = {
  ...baseConfig,
  specs: ["./test/e2e/visual/**/*.visual.ts"],
  services: [
    [
      "visual",
      {
        baselineFolder: path.resolve(__dirname, "visual-baselines"),
        formatImageName: "{tag}-{logName}-{width}x{height}",
        screenshotPath: path.resolve(__dirname, ".tmp"),
        autoSaveBaseline: true,
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
