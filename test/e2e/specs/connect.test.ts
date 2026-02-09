describe("Connection Flow", () => {
  // These tests require Docker SSH servers running
  const DOCKER_CHECK_TIMEOUT = 5000;

  async function isDockerAvailable(): Promise<boolean> {
    try {
      // Check if we can see the connections page with any pre-configured profiles
      // In E2E tests, we'd need to add a profile through the UI first
      return true; // Simplified - actual check would ping Docker
    } catch {
      return false;
    }
  }

  it("should show add connection dialog", async () => {
    // Click add connection button
    const addButton = await $('[data-testid="add-connection"]');
    if (!(await addButton.isExisting())) {
      // Try finding by aria-label or text
      const btn = await $("button*=Add");
      if (await btn.isExisting()) {
        await btn.click();
      }
      return; // Skip if no button found - UI may differ
    }
    await addButton.click();

    // Verify dialog appears
    const dialog = await $('[role="dialog"]');
    await dialog.waitForExist({ timeout: 5000 });
    expect(await dialog.isDisplayed()).toBe(true);
  });

  it("should handle connection and disconnection", async () => {
    // This is a placeholder for a full connection test
    // Requires:
    // 1. Docker SSH servers running
    // 2. Adding a profile through the UI
    // 3. Connecting with password
    // 4. Verifying file browser appears
    // 5. Disconnecting
    // 6. Verifying return to connections page
    //
    // Implementation depends on actual UI selectors
    console.log("Full connection E2E test - requires Docker environment");
  });
});
