import {
  waitForStable,
  navigateToSettings,
  checkBothThemes,
  checkElementBothThemes,
} from "../helpers/visual-helpers";

describe("Settings Page Visual Regression", () => {
  before(async () => {
    await navigateToSettings();
  });

  it("should match full settings page", async () => {
    await checkBothThemes("settings-full-page");
  });

  it("should match transfer settings section", async () => {
    const section = await $('[data-testid="transfer-settings"]');
    if (await section.isExisting()) {
      await checkElementBothThemes(section, "settings-transfer");
    }
  });

  it("should match connection settings section", async () => {
    const section = await $('[data-testid="connection-settings"]');
    if (await section.isExisting()) {
      await checkElementBothThemes(section, "settings-connection");
    }
  });

  it("should match logging settings section", async () => {
    const section = await $('[data-testid="logging-settings"]');
    if (await section.isExisting()) {
      await checkElementBothThemes(section, "settings-logging");
    }
  });
});
