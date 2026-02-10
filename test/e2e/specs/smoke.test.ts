describe("Smoke Tests", () => {
  it("should launch the application", async () => {
    // App launched successfully if we get here
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
  });

  it("should show the connections page", async () => {
    // The app starts on /connections by default
    // MainLayout renders "Connections" as the page title in a <span>
    const heading = await $("text=Connections");
    try {
      await heading.waitForExist({ timeout: 15000 });
    } catch {
      // Dump diagnostics on failure
      const url = await browser.getUrl();
      const source = await browser.getPageSource();
      console.error(`[E2E DEBUG] URL: ${url}`);
      console.error(`[E2E DEBUG] Page source: ${source.substring(0, 2000)}`);
      throw new Error(
        `"Connections" heading not found after 15s. URL=${url}, root content length=${source.length}`
      );
    }
    expect(await heading.isDisplayed()).toBe(true);
  });
});
