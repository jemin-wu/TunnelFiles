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

      // Check if JS executes at all
      const jsWorks = await browser.execute(() => 1 + 1);
      console.error(`[E2E DEBUG] JS execution: ${jsWorks}`);

      // Check root div content
      const rootHTML = await browser.execute(
        () => document.getElementById("root")?.innerHTML || "(empty)"
      );
      console.error(`[E2E DEBUG] #root innerHTML: ${rootHTML}`);

      // Check for JS errors
      const errors = await browser.execute(() => {
        return (window as any).__E2E_ERRORS || [];
      });
      console.error(`[E2E DEBUG] Captured errors: ${JSON.stringify(errors)}`);

      // Check if Tauri API is available
      const hasTauri = await browser.execute(() => {
        return typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
      });
      console.error(`[E2E DEBUG] Tauri API available: ${hasTauri}`);

      console.error(`[E2E DEBUG] Page source (first 1500): ${source.substring(0, 1500)}`);

      throw new Error(
        `"Connections" heading not found after 15s. URL=${url}, rootHTML=${rootHTML}, jsWorks=${jsWorks}, hasTauri=${hasTauri}`
      );
    }
    expect(await heading.isDisplayed()).toBe(true);
  });
});
