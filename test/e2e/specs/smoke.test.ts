describe("Smoke Tests", () => {
  it("should launch the application", async () => {
    const title = await browser.getTitle();
    expect(title).toBeTruthy();
  });

  it("should show the connections page", async () => {
    // MainLayout renders "Connections" as the page title in a <span>
    // Use XPath instead of text= selector (not supported by WebKitWebDriver)
    const heading = await $("//span[text()='Connections']");
    await heading.waitForExist({ timeout: 15000 });
    expect(await heading.isDisplayed()).toBe(true);
  });
});
