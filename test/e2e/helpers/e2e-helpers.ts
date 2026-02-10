/**
 * Shared E2E helper functions for functional tests.
 * Provides constants, navigation, profile CRUD, connection flow, and file operation helpers.
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
const CONNECT_TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Pause for the page to stabilise after an action */
export async function waitForStable(ms = 500): Promise<void> {
  await browser.pause(ms);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Navigate to the Connections page and wait for it to render */
export async function navigateToConnections(): Promise<void> {
  await browser.url("/connections");
  await waitForStable();
  const heading = await $("text=SSH hosts");
  await heading.waitForExist({ timeout: WAIT_TIMEOUT });
}

/** Wait until the connections page is visible */
export async function waitForConnectionsPage(): Promise<void> {
  const heading = await $("text=SSH hosts");
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
  const emptyBtn = await $("button=New connection");
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
  // Wait for the sheet to appear
  const sheet = await $('[role="dialog"]');
  await sheet.waitForExist({ timeout: WAIT_TIMEOUT });
}

/** Fill in the connection form fields inside the open sheet */
export async function fillConnectionForm(opts: {
  name: string;
  host: string;
  port: string;
  username: string;
}): Promise<void> {
  const nameInput = await $('input[name="name"]');
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
  const createBtn = await $("button=Create");
  if (await createBtn.isExisting()) {
    await createBtn.click();
  } else {
    const saveBtn = await $("button=Save");
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
}

/** Get a profile row (listitem) by profile name text (partial match) */
export async function getProfileRow(name: string): Promise<WebdriverIO.Element> {
  // Each ConnectionItem is role="listitem" containing name + username@host:port
  // Use *= (partial text match) since the div contains concatenated text
  const row = await $(`[role="listitem"]*=${name}`);
  return row;
}

/** Check if a profile with the given name exists in the list */
export async function profileExists(name: string): Promise<boolean> {
  const items = await $$('[role="listitem"]');
  for (const item of items) {
    const text = await item.getText();
    if (text.includes(name)) return true;
  }
  return false;
}

/** Delete a profile by clicking its delete button and confirming */
export async function deleteProfile(name: string): Promise<void> {
  // Hover over the row to reveal action buttons
  const row = await getProfileRow(name);
  await row.moveTo();
  await waitForStable(300);

  const deleteBtn = await $(`button[aria-label="Delete ${name}"]`);
  await deleteBtn.waitForClickable({ timeout: WAIT_TIMEOUT });
  await deleteBtn.click();

  // AlertDialog confirmation
  const alertDialog = await $('[role="alertdialog"]');
  await alertDialog.waitForExist({ timeout: WAIT_TIMEOUT });

  const confirmBtn = await alertDialog.$("button=Delete");
  await confirmBtn.click();
  await waitForStable(500);
}

// ---------------------------------------------------------------------------
// Connection flow
// ---------------------------------------------------------------------------

/** Handle the HostKey dialog if it appears (TOFU: click Trust) */
export async function handleHostKeyDialog(): Promise<boolean> {
  try {
    const trustBtn = await $("button=Trust");
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
  await credInput.setValue(password);

  const connectBtn = await $("button=Connect");
  await connectBtn.click();
  await waitForStable(500);
}

/**
 * Handle both dialogs that can appear during connection:
 * 1. HostKey (optional – only first time)
 * 2. Password (always for password-auth profiles)
 */
export async function handleConnectionDialogs(password = TEST_SERVER.password): Promise<void> {
  // Wait a moment for either dialog to appear
  await waitForStable(1000);

  // Check which dialog appeared – HostKey or Password
  const trustBtn = await $("button=Trust");
  const credInput = await $("#credential");

  const hasTrust = await trustBtn.isExisting();
  const hasCred = await credInput.isExisting();

  if (hasTrust) {
    await trustBtn.click();
    await waitForStable(1000);
    // After trusting, the password dialog should appear
    await handlePasswordDialog(password);
  } else if (hasCred) {
    await handlePasswordDialog(password);
  }
}

/** Click the connect button on a profile row */
export async function connectToProfile(name: string): Promise<void> {
  const row = await getProfileRow(name);
  await row.moveTo();
  await waitForStable(300);

  const connectBtn = await $(`button[aria-label="Connect to ${name}"]`);
  await connectBtn.waitForClickable({ timeout: WAIT_TIMEOUT });
  await connectBtn.click();
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
  const backBtn = await $("button=Back");
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

/** Click an item in the currently-open context menu (partial match to handle shortcut text) */
export async function clickContextMenuItem(label: string): Promise<void> {
  // Use *= because menu items contain both the label and keyboard shortcut hints
  // e.g. "Delete ⌘⌫", "Rename ⌘R", "New folder ⌘N"
  const item = await $(`[role="menuitem"]*=${label}`);
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

  const createBtn = await $("button=Create");
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

  const confirmBtn = await $("button=Confirm");
  await confirmBtn.click();
  await waitForStable(800);
}

/** Delete a file/folder via context menu */
export async function deleteFileViaContextMenu(name: string): Promise<void> {
  await openContextMenu(name);
  await clickContextMenuItem("Delete");
  await waitForStable(800);
}
