/**
 * Shared E2E helper functions for functional tests.
 * Provides constants, navigation, profile CRUD, connection flow, and file operation helpers.
 *
 * NOTE: WebKitWebDriver (used by tauri-driver) does not support WDIO's
 * `text=` and `button=` selector strategies. Use XPath or CSS selectors instead.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TEST_SERVER = {
  name: "e2e-test-server",
  host: "localhost",
  port: "2222",
  username: "testuser",
  password: "testpass123",
} as const;

/** Default timeout for waiting on elements */
const WAIT_TIMEOUT = 10_000;

/** Longer timeout for connection-related waits */
const CONNECT_TIMEOUT = 30_000;

type ProfileAction = "connect" | "edit" | "delete";

// ---------------------------------------------------------------------------
// Selector helpers (WebKitWebDriver compatible)
// ---------------------------------------------------------------------------

/** Find a button by its visible text content (XPath) */
export function btnByText(text: string): string {
  return `//button[normalize-space(.)='${text}']`;
}

/** Escape string for safe use as an XPath string literal. */
function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  const parts = value.split("'");
  return `concat(${parts.map((part) => `'${part}'`).join(`, "'", `)})`;
}

/** Stable selector for a profile row by exact profile name. */
function profileRowSelector(name: string): string {
  const nameLiteral = xpathLiteral(name);
  return `//div[@role='listitem' and ((@data-testid='connection-row' and @data-profile-name=${nameLiteral}) or .//span[@title=${nameLiteral}] or contains(., ${nameLiteral}))]`;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Pause for the page to stabilise after an action */
export async function waitForStable(ms = 500): Promise<void> {
  await browser.pause(ms);
}

/**
 * Disable all CSS animations and transitions.
 * WebKitWebDriver considers elements mid-animation (opacity < 1) as not interactable,
 * which causes flaky tests. Must be called after each full page navigation since
 * browser.url() reloads the page and loses injected styles.
 */
export async function disableAnimations(): Promise<void> {
  await browser.execute(() => {
    if (document.getElementById("e2e-no-animations")) return;
    const style = document.createElement("style");
    style.id = "e2e-no-animations";
    style.textContent = [
      "*, *::before, *::after {",
      "  animation-duration: 0s !important;",
      "  animation-delay: 0s !important;",
      "  transition-duration: 0s !important;",
      "  transition-delay: 0s !important;",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  });
}

/**
 * Reveal hover-only action buttons on a profile row.
 * WebKitWebDriver's moveTo() does not trigger CSS :hover pseudo-class,
 * so we remove the opacity-0 class via JavaScript to make buttons clickable.
 */
export async function revealRowActions(row: WebdriverIO.Element): Promise<void> {
  await row.waitForDisplayed({ timeout: WAIT_TIMEOUT });
  // Force hidden action containers visible by swapping Tailwind opacity classes
  await browser.execute((el) => {
    el.querySelectorAll(".opacity-0").forEach((child) => {
      child.classList.remove("opacity-0");
      child.classList.add("opacity-100");
    });
  }, row);
  await waitForStable(100);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Navigate to the Connections page and wait for it to render */
export async function navigateToConnections(): Promise<void> {
  // Resolve the root URL from the current origin (works in both local tauri://
  // and CI http:// environments). We navigate to "/" instead of "/connections"
  // because vite preview lacks SPA fallback routing.
  const currentUrl = await browser.getUrl();
  const origin = new URL(currentUrl).origin;
  await browser.url(`${origin}/`);
  await disableAnimations();
  await waitForStable();
  const heading = await $("//span[text()='Connections']");
  await heading.waitForExist({ timeout: WAIT_TIMEOUT });
}

/** Wait until the connections page is visible */
export async function waitForConnectionsPage(): Promise<void> {
  const heading = await $("//span[text()='Connections']");
  await heading.waitForExist({ timeout: WAIT_TIMEOUT });
}

/** Wait until the file browser is visible (breadcrumb nav present) */
export async function waitForFileBrowser(): Promise<void> {
  const nav = await $('nav[aria-label="Breadcrumb navigation"]');
  await nav.waitForExist({ timeout: CONNECT_TIMEOUT });
}

// ---------------------------------------------------------------------------
// Profile CRUD
// ---------------------------------------------------------------------------

/** Click the "+" button in the toolbar (or the empty-state "New connection" button) */
export async function openAddConnectionSheet(): Promise<void> {
  // Try the empty-state button first
  const emptyBtn = await $(btnByText("New connection"));
  if (await emptyBtn.isExisting()) {
    await emptyBtn.click();
  } else {
    // Toolbar "+" button: it's NOT inside a [role="listitem"] (unlike row action buttons).
    // The action buttons inside ConnectionItem rows have "rounded-full" class.
    // The toolbar plus button does not. Find the small icon button without rounded-full.
    const allBtns = await $$("button");
    for (const btn of allBtns) {
      const classes = (await btn.getAttribute("class")) ?? "";
      if (classes.includes("h-6") && classes.includes("w-6") && !classes.includes("rounded-full")) {
        await btn.click();
        break;
      }
    }
  }
  // Wait for the sheet to appear and its animation to complete
  const sheet = await $('[role="dialog"]');
  await sheet.waitForExist({ timeout: WAIT_TIMEOUT });
  await sheet.waitForDisplayed({ timeout: WAIT_TIMEOUT });
  await waitForStable(500);
}

/** Fill in the connection form fields inside the open sheet */
export async function fillConnectionForm(opts: {
  name: string;
  host: string;
  port: string;
  username: string;
}): Promise<void> {
  const nameInput = await $('input[name="name"]');
  // Wait for the sheet animation to complete and inputs to be interactable
  await nameInput.waitForDisplayed({ timeout: WAIT_TIMEOUT });
  await waitForStable(300);
  await nameInput.clearValue();
  await nameInput.setValue(opts.name);

  const hostInput = await $('input[name="host"]');
  await hostInput.clearValue();
  await hostInput.setValue(opts.host);

  const portInput = await $('input[name="port"]');
  await portInput.clearValue();
  await portInput.setValue(opts.port);

  const usernameInput = await $('input[name="username"]');
  await usernameInput.clearValue();
  await usernameInput.setValue(opts.username);
}

/** Click "Create" (or "Save") in the sheet footer */
export async function submitConnectionSheet(): Promise<void> {
  // In add mode the button says "Create", in edit mode "Save"
  const createBtn = await $(btnByText("Create"));
  if (await createBtn.isExisting()) {
    await createBtn.click();
  } else {
    const saveBtn = await $(btnByText("Save"));
    await saveBtn.click();
  }
  await waitForStable(800);
}

/**
 * Full shortcut: open the sheet, fill, and submit.
 * Returns once the sheet has closed.
 */
export async function addConnectionProfile(
  opts: { name: string; host: string; port: string; username: string } = TEST_SERVER
): Promise<void> {
  await openAddConnectionSheet();
  await fillConnectionForm(opts);
  await submitConnectionSheet();
  await browser.waitUntil(() => profileExists(opts.name), {
    timeout: CONNECT_TIMEOUT,
    timeoutMsg: `Profile "${opts.name}" was not visible after creation`,
  });
}

/** Get a profile row (listitem) by profile name */
export async function getProfileRow(name: string): Promise<WebdriverIO.Element> {
  const row = await $(profileRowSelector(name));
  await row.waitForExist({ timeout: WAIT_TIMEOUT });
  return row;
}

/** Check if a profile with the given name exists in the list */
export async function profileExists(name: string): Promise<boolean> {
  try {
    const row = await $(profileRowSelector(name));
    return await row.isExisting();
  } catch {
    // During list re-render WebDriver may surface stale element errors.
    return false;
  }
}

/** Delete a profile by clicking its delete button and confirming */
export async function deleteProfile(name: string): Promise<void> {
  await clickProfileAction(name, "delete");

  // AlertDialog confirmation
  const alertDialog = await $('[role="alertdialog"]');
  await alertDialog.waitForExist({ timeout: WAIT_TIMEOUT });

  const confirmBtn = await alertDialog.$(".//button[normalize-space(.)='Delete']");
  await confirmBtn.click();
  await browser.waitUntil(async () => !(await profileExists(name)), {
    timeout: WAIT_TIMEOUT,
    timeoutMsg: `Profile "${name}" still exists after delete confirmation`,
  });
}

// ---------------------------------------------------------------------------
// Connection flow
// ---------------------------------------------------------------------------

async function isOnFileManagerRoute(): Promise<boolean> {
  const url = await browser.getUrl();
  return /\/files\//.test(url);
}

async function waitForConnectSignal(name: string, timeoutMs = 6000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isOnFileManagerRoute()) return true;

    const fileBrowser = await $('nav[aria-label="Breadcrumb navigation"]');
    if (await fileBrowser.isExisting()) return true;

    const trustBtn = await $(btnByText("Trust"));
    if (await trustBtn.isExisting()) return true;

    const trustAnywayBtn = await $(btnByText("Trust anyway"));
    if (await trustAnywayBtn.isExisting()) return true;

    const credInput = await $("#credential");
    if (await credInput.isExisting()) return true;

    const row = await $(profileRowSelector(name));
    if (await row.isExisting()) {
      const classes = (await row.getAttribute("class")) ?? "";
      if (classes.includes("pointer-events-none") || classes.includes("opacity-50")) {
        return true;
      }
    }

    await browser.pause(150);
  }

  return false;
}

/** Handle the HostKey dialog if it appears (TOFU: click Trust) */
export async function handleHostKeyDialog(): Promise<boolean> {
  try {
    const trustBtn = await $(btnByText("Trust"));
    const exists = await trustBtn.waitForExist({ timeout: 3000 });
    if (exists && (await trustBtn.isDisplayed())) {
      await trustBtn.click();
      await waitForStable(500);
      return true;
    }
  } catch {
    // No host key dialog – already trusted
  }
  return false;
}

/** Handle the Password dialog: type the password and click Connect */
export async function handlePasswordDialog(password = TEST_SERVER.password): Promise<void> {
  const credInput = await $("#credential");
  await credInput.waitForExist({ timeout: WAIT_TIMEOUT });
  await credInput.waitForDisplayed({ timeout: WAIT_TIMEOUT });
  await credInput.clearValue();
  await credInput.setValue(password);

  const connectBtn = await $(btnByText("Connect"));
  await connectBtn.waitForExist({ timeout: WAIT_TIMEOUT });
  await connectBtn.waitForDisplayed({ timeout: WAIT_TIMEOUT });
  await browser.waitUntil(() => connectBtn.isEnabled(), {
    timeout: WAIT_TIMEOUT,
    timeoutMsg: "Password dialog connect button did not become enabled",
  });
  await connectBtn.click();
  await waitForStable(500);
}

/**
 * Handle both dialogs that can appear during connection:
 * 1. HostKey (optional – only first time)
 * 2. Password (always for password-auth profiles)
 */
export async function handleConnectionDialogs(password = TEST_SERVER.password): Promise<void> {
  const deadline = Date.now() + CONNECT_TIMEOUT;
  let submittedCredentials = false;

  while (Date.now() < deadline) {
    if (await isOnFileManagerRoute()) {
      return;
    }

    const fileBrowser = await $('nav[aria-label="Breadcrumb navigation"]');
    if (await fileBrowser.isExisting()) {
      return;
    }

    const trustBtn = await $(btnByText("Trust"));
    if (await trustBtn.isExisting() && (await trustBtn.isDisplayed())) {
      await trustBtn.click();
      await waitForStable(600);
      continue;
    }

    const trustAnywayBtn = await $(btnByText("Trust anyway"));
    if (await trustAnywayBtn.isExisting() && (await trustAnywayBtn.isDisplayed())) {
      await trustAnywayBtn.click();
      await waitForStable(600);
      continue;
    }

    const credInput = await $("#credential");
    if (await credInput.isExisting() && (await credInput.isDisplayed())) {
      await handlePasswordDialog(password);
      submittedCredentials = true;
      continue;
    }

    // Credentials may have just been submitted; give the next dialog/page transition time.
    if (submittedCredentials) {
      await browser.pause(200);
      continue;
    }

    await browser.pause(250);
  }

  const dialog = await $('[role="dialog"]');
  const dialogText =
    (await dialog.isExisting()) && (await dialog.isDisplayed())
      ? (await dialog.getText()).replace(/\s+/g, " ").trim()
      : "none";
  const currentUrl = await browser.getUrl();
  throw new Error(
    `Connection flow timed out after ${CONNECT_TIMEOUT}ms. File browser not visible. Active dialog: ${dialogText}. URL: ${currentUrl}`
  );
}

/** Click the connect button on a profile row */
export async function connectToProfile(name: string): Promise<void> {
  if (await tryClickLegacyActionButton("connect", name)) {
    if (await waitForConnectSignal(name)) return;
  }

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getProfileRow(name);
    await browser.execute((el) => {
      (el as HTMLElement).focus();
    }, row);

    // Keyboard path is the most stable with the current ConnectionItem handlers.
    await browser.keys("Enter");
    if (await waitForConnectSignal(name)) return;

    try {
      await row.waitForClickable({ timeout: 1500 });
      await row.click();
    } catch (error) {
      lastError = String(error);
      try {
        await browser.execute((el) => {
          (el as HTMLElement).click();
        }, row);
      } catch (jsError) {
        lastError = `${lastError}; jsClick=${String(jsError)}`;
      }
    }

    if (await waitForConnectSignal(name)) return;
    await waitForStable(200);
  }

  throw new Error(
    `Could not trigger connect for profile "${name}". Last error: ${lastError || "none"}`
  );
}

function legacyActionLabel(action: ProfileAction, name: string): string {
  if (action === "connect") return `Connect to ${name}`;
  if (action === "edit") return `Edit ${name}`;
  return `Delete ${name}`;
}

async function tryClickLegacyActionButton(action: ProfileAction, name: string): Promise<boolean> {
  const expectedLabel = legacyActionLabel(action, name);
  const legacyBtns = await $$(`button[aria-label="${expectedLabel}"]`);
  if (legacyBtns.length === 0) return false;

  for (const legacyBtn of legacyBtns) {
    try {
      if (!(await legacyBtn.isDisplayed())) continue;
      if ((await legacyBtn.getAttribute("aria-label")) !== expectedLabel) continue;
      await legacyBtn.waitForClickable({ timeout: 1200 });
      await legacyBtn.click();
      return true;
    } catch {
      // Fall through to modern action paths if legacy click is not usable.
    }
  }

  return false;
}

async function openProfileActionsMenu(name: string): Promise<void> {
  const row = await getProfileRow(name);
  await revealRowActions(row);
  let trigger = await row.$('[data-testid="connection-actions-trigger"]');
  if (!(await trigger.isExisting())) {
    trigger = await row.$(`button[aria-label="Actions for ${name}"]`);
  }
  await trigger.waitForExist({ timeout: WAIT_TIMEOUT });
  try {
    await trigger.waitForClickable({ timeout: WAIT_TIMEOUT });
    await trigger.click();
  } catch {
    await browser.execute((el) => {
      (el as HTMLElement).click();
    }, trigger);
  }
}

async function clickProfileMenuItem(label: "Edit" | "Delete"): Promise<void> {
  const testId =
    label === "Edit" ? '[data-testid="connection-action-edit"]' : '[data-testid="connection-action-delete"]';
  let actionItem = await $(testId);
  if (!(await actionItem.isExisting())) {
    actionItem = await $(`//div[@role='menuitem'][contains(normalize-space(.), '${label}')]`);
  }
  await actionItem.waitForExist({ timeout: WAIT_TIMEOUT });
  try {
    await actionItem.waitForClickable({ timeout: WAIT_TIMEOUT });
    await actionItem.click();
  } catch {
    await browser.execute((el) => {
      (el as HTMLElement).click();
    }, actionItem);
  }
}

async function focusProfileRow(name: string): Promise<WebdriverIO.Element> {
  const row = await getProfileRow(name);
  await browser.execute((el) => {
    (el as HTMLElement).focus();
  }, row);
  return row;
}

async function tryClickProfileMenuAction(name: string, label: "Edit" | "Delete"): Promise<boolean> {
  try {
    await openProfileActionsMenu(name);
    await clickProfileMenuItem(label);
    return true;
  } catch {
    return false;
  }
}

async function waitForEditSheetOpen(timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const title = await $("//span[text()='Edit connection']");
    if (await title.isExisting()) return true;
    await browser.pause(120);
  }
  return false;
}

async function waitForDeleteDialogOpen(timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const dialog = await $('[role="alertdialog"]');
    if (await dialog.isExisting()) return true;
    await browser.pause(120);
  }
  return false;
}

/**
 * Click a profile action while supporting both legacy (dedicated buttons)
 * and current UI (row connect + dropdown actions).
 */
export async function clickProfileAction(name: string, action: ProfileAction): Promise<void> {
  if (action === "connect") {
    await connectToProfile(name);
    return;
  }

  if (await tryClickLegacyActionButton(action, name)) return;

  const row = await focusProfileRow(name);
  if (action === "edit") {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await browser.keys([modifier, "e"]);
    if (await waitForEditSheetOpen()) return;
  } else {
    await browser.keys("Delete");
    if (await waitForDeleteDialogOpen()) return;
  }

  const itemLabel = action === "edit" ? "Edit" : "Delete";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await tryClickProfileMenuAction(name, itemLabel)) return;
    await waitForStable(150);
  }

  if (action === "edit") {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await browser.keys([modifier, "e"]);
  } else {
    await row.click();
    await browser.keys("Delete");
  }
}

/**
 * Full connect flow: click Connect on profile → handle dialogs → wait for file browser
 */
export async function fullConnectFlow(
  name = TEST_SERVER.name,
  password = TEST_SERVER.password
): Promise<void> {
  await connectToProfile(name);
  await handleConnectionDialogs(password);
  await waitForFileBrowser();
}

/** Navigate back to connections via the Back button */
export async function disconnect(): Promise<void> {
  const backBtn = await $(btnByText("Back"));
  if (await backBtn.isExisting()) {
    await backBtn.click();
    await waitForConnectionsPage();
  } else {
    await navigateToConnections();
  }
}

// ---------------------------------------------------------------------------
// File browser helpers
// ---------------------------------------------------------------------------

/** Find a file/folder row by its name inside the file list grid */
export async function findFileRow(name: string): Promise<WebdriverIO.Element | null> {
  // File rows are role="row" inside the virtual list
  const rows = await $$('[role="row"]');
  for (const row of rows) {
    const text = await row.getText();
    if (text.includes(name)) return row;
  }
  return null;
}

/** Wait for a file/folder row to appear in the list */
export async function waitForFileRow(
  name: string,
  timeout = WAIT_TIMEOUT
): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const row = await findFileRow(name);
      return row !== null;
    },
    { timeout, timeoutMsg: `File row "${name}" not found within ${timeout}ms` }
  );
  return (await findFileRow(name))!;
}

/** Double-click a file/folder row to enter it */
export async function doubleClickFile(name: string): Promise<void> {
  const row = await waitForFileRow(name);
  await row.doubleClick();
  await waitForStable(800);
}

/** Right-click a file row to open the context menu */
export async function openContextMenu(name: string): Promise<void> {
  const row = await waitForFileRow(name);
  await row.click({ button: "right" });
  await waitForStable(300);
}

/** Click an item in the currently-open context menu */
export async function clickContextMenuItem(label: string): Promise<void> {
  // Use XPath contains for partial match (menu items may include shortcut hints)
  const item = await $(`//div[@role='menuitem'][contains(., '${label}')]`);
  await item.waitForExist({ timeout: WAIT_TIMEOUT });
  await item.click();
  await waitForStable(300);
}

/** Get the current breadcrumb path text (the last active segment) */
export async function getCurrentBreadcrumb(): Promise<string> {
  const nav = await $('nav[aria-label="Breadcrumb navigation"]');
  const active = await nav.$('[aria-current="location"]');
  return active.getText();
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

/** Create a new folder via the keyboard shortcut or toolbar button */
export async function createFolder(folderName: string): Promise<void> {
  // Use Cmd+N (macOS) or Ctrl+N (Linux/Windows) keyboard shortcut
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await browser.keys([modifier, "n"]);
  await waitForStable(500);

  const input = await $("#folder-name");
  await input.waitForExist({ timeout: WAIT_TIMEOUT });
  await input.setValue(folderName);

  const createBtn = await $(btnByText("Create"));
  await createBtn.click();
  await waitForStable(800);
}

/** Rename a file via context menu */
export async function renameFile(currentName: string, newName: string): Promise<void> {
  await openContextMenu(currentName);
  await clickContextMenuItem("Rename");

  const input = await $("#new-name");
  await input.waitForExist({ timeout: WAIT_TIMEOUT });
  // Clear and type the new name
  // Triple-click to select all, then type
  await input.click({ clickCount: 3 });
  await input.setValue(newName);

  const confirmBtn = await $(btnByText("Confirm"));
  await confirmBtn.click();
  await waitForStable(800);
}

/** Delete a file/folder via context menu */
export async function deleteFileViaContextMenu(name: string): Promise<void> {
  await openContextMenu(name);
  await clickContextMenuItem("Delete");
  await waitForStable(800);
}
