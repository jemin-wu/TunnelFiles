describe("Smoke Tests", () => {
  it("should launch the application", async () => {
    // App launched successfully if we get here
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
  });

  it("should show the connections page", async () => {
    // The app starts on /connections by default
    // Look for text that indicates the connections page is rendered
    const heading = await $("text=Connections");
    await heading.waitForExist({ timeout: 10000 });
    expect(await heading.isDisplayed()).toBe(true);
  });
});
