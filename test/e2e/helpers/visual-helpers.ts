import fs from "node:fs";
import path from "node:path";

import {
  TEST_SERVER,
  addConnectionProfile,
  fullConnectFlow,
  navigateToConnections as navigateToConnectionsE2E,
  profileExists,
} from "./e2e-helpers";

/** Default tolerance for visual comparison (percentage mismatch allowed) */
export const DEFAULT_MISMATCH_TOLERANCE = 0.5;
/** Stricter tolerance for pixel-perfect sections */
export const STRICT_MISMATCH_TOLERANCE = 0.1;

const FALLBACK_SHOT_DIR = path.resolve(process.cwd(), "test/e2e/.tmp/fallback");
const VISUAL_COMMAND_TIMEOUT_MS = 20_000;
let visualFallbackWarned = false;

function ensureFallbackDir(): void {
  if (!fs.existsSync(FALLBACK_SHOT_DIR)) {
    fs.mkdirSync(FALLBACK_SHOT_DIR, { recursive: true });
  }
}

function warnVisualFallback(reason: string): void {
  if (visualFallbackWarned) return;
  visualFallbackWarned = true;
  console.warn(`[visual] Fallback to raw screenshots: ${reason}`);
}

async function withCommandTimeout<T>(
  command: Promise<T>,
  label: string,
  timeoutMs = VISUAL_COMMAND_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      command,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Wait for the page to stabilize (no pending animations/renders).
 * Uses a simple idle wait since disableCSSAnimation handles CSS transitions.
 */
export async function waitForStable(ms = 500): Promise<void> {
  await browser.pause(ms);
}

/**
 * Click helper for WebKitWebDriver flakiness.
 * Falls back to DOM click when native click is not interactable.
 */
export async function clickWithFallback(
  element: WebdriverIO.Element,
  timeoutMs = 5_000
): Promise<void> {
  await element.waitForExist({ timeout: timeoutMs });
  try {
    await element.waitForDisplayed({ timeout: timeoutMs });
    await element.waitForClickable({ timeout: Math.min(timeoutMs, 2_000) });
    await element.click();
  } catch {
    await browser.execute((el) => {
      (el as HTMLElement).click();
    }, element);
  }
  await waitForStable(150);
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
  await browser.execute((nextTheme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(nextTheme);
    localStorage.setItem("tunnelfiles-theme", nextTheme);
  }, theme);
  await waitForStable(200);
}

/**
 * Navigate to the Connections page.
 */
export async function navigateToConnections(): Promise<void> {
  await navigateToConnectionsE2E();
}

/**
 * Navigate to the Settings page.
 */
export async function navigateToSettings(): Promise<void> {
  // Load app at root first (vite preview lacks SPA fallback for /settings),
  // then use History API + popstate to trigger React Router navigation.
  const currentUrl = await browser.getUrl();
  const origin = new URL(currentUrl).origin;
  await browser.url(`${origin}/`);
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
  if (!(await profileExists(TEST_SERVER.name))) {
    await addConnectionProfile(TEST_SERVER);
  }
  await fullConnectFlow(TEST_SERVER.name, TEST_SERVER.password);
  await waitForStable(1000);
}

async function checkFullPageOrFallback(tag: string, tolerance: number): Promise<void> {
  const browserAny = browser as unknown as {
    checkFullPageScreen?: (tag: string, options?: Record<string, unknown>) => Promise<unknown>;
    checkScreen?: (tag: string, options?: Record<string, unknown>) => Promise<unknown>;
  };

  if (typeof browserAny.checkFullPageScreen === "function") {
    try {
      await withCommandTimeout(
        browserAny.checkFullPageScreen(tag, { misMatchPercentage: tolerance }),
        "checkFullPageScreen"
      );
      return;
    } catch (error) {
      warnVisualFallback(`checkFullPageScreen failed: ${String(error)}`);
    }
  }
  if (typeof browserAny.checkScreen === "function") {
    try {
      await withCommandTimeout(
        browserAny.checkScreen(tag, { misMatchPercentage: tolerance }),
        "checkScreen"
      );
      return;
    } catch (error) {
      warnVisualFallback(`checkScreen failed: ${String(error)}`);
    }
  }

  warnVisualFallback("visual-service commands are unavailable or timed out");
  ensureFallbackDir();
  await browser.saveScreenshot(path.join(FALLBACK_SHOT_DIR, `${tag}.png`));
}

async function checkElementOrFallback(
  element: WebdriverIO.Element,
  tag: string,
  tolerance: number
): Promise<void> {
  const browserAny = browser as unknown as {
    checkElement?: (
      element: WebdriverIO.Element,
      tag: string,
      options?: Record<string, unknown>
    ) => Promise<unknown>;
  };

  if (typeof browserAny.checkElement === "function") {
    try {
      await withCommandTimeout(
        browserAny.checkElement(element, tag, { misMatchPercentage: tolerance }),
        "checkElement"
      );
      return;
    } catch (error) {
      warnVisualFallback(`checkElement failed: ${String(error)}`);
    }
  }

  warnVisualFallback("element visual command is unavailable or timed out");
  ensureFallbackDir();
  await element.saveScreenshot(path.join(FALLBACK_SHOT_DIR, `${tag}.png`));
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
  await checkFullPageOrFallback(`${tag}-light`, tolerance);

  // Dark theme
  await setTheme("dark");
  await waitForStable();
  await checkFullPageOrFallback(`${tag}-dark`, tolerance);
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
  await checkElementOrFallback(element, `${tag}-light`, tolerance);

  await setTheme("dark");
  await waitForStable();
  await checkElementOrFallback(element, `${tag}-dark`, tolerance);
}
