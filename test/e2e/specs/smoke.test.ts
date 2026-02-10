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
    await heading.waitForExist({ timeout: 15000 });
    expect(await heading.isDisplayed()).toBe(true);
  });
});
