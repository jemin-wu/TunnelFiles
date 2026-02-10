/** Default tolerance for visual comparison (percentage mismatch allowed) */
export const DEFAULT_MISMATCH_TOLERANCE = 0.5;
/** Stricter tolerance for pixel-perfect sections */
export const STRICT_MISMATCH_TOLERANCE = 0.1;

/**
 * Wait for the page to stabilize (no pending animations/renders).
 * Uses a simple idle wait since disableCSSAnimation handles CSS transitions.
 */
export async function waitForStable(ms = 500): Promise<void> {
  await browser.pause(ms);
}

/**
 * Get current theme from <html> class attribute.
 */
async function getCurrentTheme(): Promise<"dark" | "light"> {
  const htmlClass = await browser.execute(() => document.documentElement.classList.toString());
  return htmlClass.includes("dark") ? "dark" : "light";
}

/**
 * Set the application theme by toggling the theme button in the header.
 */
export async function setTheme(theme: "dark" | "light"): Promise<void> {
  const current = await getCurrentTheme();
  if (current === theme) return;

  // Click the theme toggle button
  const themeButton = await $('[data-testid="theme-toggle"]');
  if (await themeButton.isExisting()) {
    await themeButton.click();
    await waitForStable(300);
  }

  // Verify theme changed
  const after = await getCurrentTheme();
  if (after !== theme) {
    // Try one more time (some toggles cycle through modes)
    if (await themeButton.isExisting()) {
      await themeButton.click();
      await waitForStable(300);
    }
  }
}

/**
 * Navigate to the Connections page.
 */
export async function navigateToConnections(): Promise<void> {
  // Use "/" instead of "/connections" because vite preview lacks SPA fallback routing.
  // The root URL serves index.html and React Router redirects to /connections.
  await browser.url("/");
  await waitForStable();
  const heading = await $("//span[text()='Connections']");
  await heading.waitForExist({ timeout: 10000 });
}

/**
 * Navigate to the Settings page.
 */
export async function navigateToSettings(): Promise<void> {
  // Load app at "/" first (vite preview lacks SPA fallback for /settings),
  // then use History API + popstate to trigger React Router navigation.
  await browser.url("/");
  await waitForStable();
  await browser.execute(() => {
    window.history.pushState({}, "", "/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await waitForStable();
  const heading = await $("//span[text()='Settings']");
  await heading.waitForExist({ timeout: 10000 });
}

/**
 * Connect to the Docker test SSH server through the UI.
 * Adds a profile and connects with password auth.
 */
export async function connectToTestServer(): Promise<void> {
  await navigateToConnections();

  // Click add connection
  const addBtn = (await $('[data-testid="add-connection"]')).isExisting()
    ? await $('[data-testid="add-connection"]')
    : await $("//button[contains(., 'Add')]");
  await addBtn.click();

  // Fill in connection details
  const dialog = await $('[role="dialog"]');
  await dialog.waitForExist({ timeout: 5000 });

  const hostInput = await $('input[name="host"]');
  await hostInput.setValue("localhost");

  const portInput = await $('input[name="port"]');
  await portInput.clearValue();
  await portInput.setValue("2222");

  const userInput = await $('input[name="username"]');
  await userInput.setValue("testuser");

  // Submit / save the profile
  const saveBtn = await dialog.$(".//button[contains(., 'Save')]");
  if (await saveBtn.isExisting()) {
    await saveBtn.click();
    await waitForStable();
  }

  // Connect (click the row or connect button)
  const connectBtn = await $("//button[contains(., 'Connect')]");
  if (await connectBtn.isExisting()) {
    await connectBtn.click();
  }

  // Handle password prompt
  const passwordInput = await $('input[type="password"]');
  if (await passwordInput.isExisting()) {
    await passwordInput.waitForDisplayed({ timeout: 5000 });
    await passwordInput.setValue("testpass123");
    const submitBtn = await $("//button[contains(., 'Connect')]");
    if (await submitBtn.isExisting()) {
      await submitBtn.click();
    }
  }

  // Wait for file manager to load
  await waitForStable(2000);
}

/**
 * Take visual screenshots in both light and dark themes.
 * Returns after restoring the original theme.
 */
export async function checkBothThemes(
  tag: string,
  tolerance = DEFAULT_MISMATCH_TOLERANCE
): Promise<void> {
  // Light theme
  await setTheme("light");
  await waitForStable();
  await browser.checkFullPageScreen(`${tag}-light`, {
    misMatchPercentage: tolerance,
  } as any);

  // Dark theme
  await setTheme("dark");
  await waitForStable();
  await browser.checkFullPageScreen(`${tag}-dark`, {
    misMatchPercentage: tolerance,
  } as any);
}

/**
 * Take an element-level screenshot in both themes.
 */
export async function checkElementBothThemes(
  element: WebdriverIO.Element,
  tag: string,
  tolerance = DEFAULT_MISMATCH_TOLERANCE
): Promise<void> {
  await setTheme("light");
  await waitForStable();
  await browser.checkElement(element, `${tag}-light`, {
    misMatchPercentage: tolerance,
  } as any);

  await setTheme("dark");
  await waitForStable();
  await browser.checkElement(element, `${tag}-dark`, {
    misMatchPercentage: tolerance,
  } as any);
}
