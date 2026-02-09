import { waitForStable, checkBothThemes, checkElementBothThemes } from "../helpers/visual-helpers";

describe("Layout Visual Regression", () => {
  before(async () => {
    // Ensure app is loaded
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
    await waitForStable(1000);
  });

  it("should match full page layout", async () => {
    await checkBothThemes("layout-full-page");
  });

  it("should match header area", async () => {
    const header = await $("header");
    if (await header.isExisting()) {
      await checkElementBothThemes(header, "layout-header");
    }
  });

  it("should match sidebar area", async () => {
    const sidebar = await $('[data-testid="sidebar"], nav, aside');
    if (await sidebar.isExisting()) {
      await checkElementBothThemes(sidebar, "layout-sidebar");
    }
  });
});
