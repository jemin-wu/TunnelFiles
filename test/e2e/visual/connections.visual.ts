import {
  waitForStable,
  navigateToConnections,
  checkBothThemes,
  clickWithFallback,
} from "../helpers/visual-helpers";

describe("Connections Page Visual Regression", () => {
  before(async () => {
    await navigateToConnections();
  });

  it("should match empty state", async () => {
    await checkBothThemes("connections-empty-state");
  });

  it("should match add connection sheet", async () => {
    // Open the add connection dialog/sheet
    const addBtn = (await $('[data-testid="add-connection-button"]').isExisting())
      ? await $('[data-testid="add-connection-button"]')
      : await $("//button[contains(., 'Add')]");

    if (await addBtn.isExisting()) {
      await clickWithFallback(addBtn);
      await waitForStable();

      const dialog = await $('[role="dialog"]');
      await dialog.waitForExist({ timeout: 5000 });

      await checkBothThemes("connections-add-sheet");

      // Close the dialog
      const closeBtn = await dialog.$('button[aria-label="Close"]');
      if (await closeBtn.isExisting()) {
        await clickWithFallback(closeBtn);
      } else {
        await browser.keys("Escape");
      }
      await waitForStable();
    }
  });

  it("should match SSH key auth variant in add sheet", async () => {
    const addBtn = (await $('[data-testid="add-connection-button"]').isExisting())
      ? await $('[data-testid="add-connection-button"]')
      : await $("//button[contains(., 'Add')]");

    if (await addBtn.isExisting()) {
      await clickWithFallback(addBtn);
      await waitForStable();

      // Switch auth type to SSH key
      const keyAuthBtn = await $("//button[normalize-space(.)='SSH key']");
      if (await keyAuthBtn.isExisting()) {
        await clickWithFallback(keyAuthBtn);
        await waitForStable();
      }

      await checkBothThemes("connections-ssh-key-auth");

      // Close
      await browser.keys("Escape");
      await waitForStable();
    }
  });
});
