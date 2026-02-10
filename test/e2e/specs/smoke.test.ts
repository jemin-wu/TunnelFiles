describe("Smoke Tests", () => {
  it("should launch the application", async () => {
    // App launched successfully if we get here
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
  });

  it("should show the connections page", async () => {
    // Wait for React to mount and render
    await browser.pause(3000);

    // Capture debug info for CI diagnostics
    const url = await browser.getUrl();
    const title = await browser.getTitle();
    const source = await browser.getPageSource();
    console.log(`[DEBUG] URL: ${url}`);
    console.log(`[DEBUG] Title: ${title}`);
    console.log(`[DEBUG] Page source (first 2000 chars):\n${source.substring(0, 2000)}`);

    // The app starts on /connections by default
    // MainLayout renders "Connections" as the page title in a <span>
    const heading = await $("text=Connections");
    await heading.waitForExist({ timeout: 15000 });
    expect(await heading.isDisplayed()).toBe(true);
  });
});
