import {
  waitForStable,
  connectToTestServer,
  checkBothThemes,
  checkElementBothThemes,
  clickWithFallback,
} from "../helpers/visual-helpers";

describe("File Manager Visual Regression", () => {
  before(async () => {
    // This suite requires Docker SSH server
    await connectToTestServer();
  });

  it("should match file list view", async () => {
    await checkBothThemes("file-manager-list");
  });

  it("should match toolbar area", async () => {
    const toolbar = await $('[data-testid="toolbar"], [role="toolbar"]');
    if (await toolbar.isExisting()) {
      await checkElementBothThemes(toolbar, "file-manager-toolbar");
    }
  });

  it("should match sidebar collapsed state", async () => {
    // Collapse the sidebar
    const collapseBtn = await $(
      '[data-testid="collapse-sidebar"], [aria-label="Collapse sidebar"]'
    );
    if (await collapseBtn.isExisting()) {
      await clickWithFallback(collapseBtn);
      await waitForStable();
    }

    await checkBothThemes("file-manager-sidebar-collapsed");

    // Restore sidebar
    const expandBtn = await $('[data-testid="expand-sidebar"], [aria-label="Expand sidebar"]');
    if (await expandBtn.isExisting()) {
      await clickWithFallback(expandBtn);
      await waitForStable();
    }
  });
});
