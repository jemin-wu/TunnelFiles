/**
 * E2E tests for file browser operations.
 * Requires Docker SSH server running on localhost:2222.
 * Test directories pre-created: test-files/, empty-dir/, uploads/, readonly-dir/
 */

import {
  TEST_SERVER,
  waitForStable,
  navigateToConnections,
  waitForFileBrowser,
  addConnectionProfile,
  profileExists,
  deleteProfile,
  fullConnectFlow,
  disconnect,
  findFileRow,
  waitForFileRow,
  navigateToHomeDirectory,
  doubleClickFile,
  getCurrentBreadcrumb,
  createFolder,
  renameFile,
  deleteFileViaContextMenu,
  btnByText,
} from "../helpers/e2e-helpers";

describe("File Operations", () => {
  // Setup: create profile and connect
  before(async () => {
    await navigateToConnections();
    if (!(await profileExists(TEST_SERVER.name))) {
      await addConnectionProfile();
    }
    await fullConnectFlow();
  });

  // Cleanup: disconnect and delete profile
  after(async () => {
    try {
      await disconnect();
    } catch {
      await navigateToConnections();
    }
    if (await profileExists(TEST_SERVER.name)) {
      await deleteProfile(TEST_SERVER.name);
    }
  });

  // -----------------------------------------------------------------------
  // Directory Navigation
  // -----------------------------------------------------------------------

  describe("Directory Navigation", () => {
    it("should display home directory contents", async () => {
      // After connecting, we should see the home directory
      await waitForFileBrowser();

      // The Docker server pre-creates these directories
      expect(await waitForFileRow("test-files")).toBeDefined();
      expect(await waitForFileRow("empty-dir")).toBeDefined();
      expect(await waitForFileRow("uploads")).toBeDefined();
    });

    it("should navigate into test-files directory", async () => {
      await doubleClickFile("test-files");

      // Verify breadcrumb shows test-files
      const breadcrumb = await getCurrentBreadcrumb();
      expect(breadcrumb).toBe("test-files");

      // Verify files are listed
      expect(await waitForFileRow("hello.txt")).toBeDefined();
      expect(await waitForFileRow("test.txt")).toBeDefined();
      expect(await waitForFileRow("random.bin")).toBeDefined();
    });

    it("should navigate back via breadcrumb", async () => {
      await navigateToHomeDirectory();

      // We should be back at home, seeing top-level dirs
      expect(await waitForFileRow("test-files")).toBeDefined();
    });

    it("should display file metadata columns", async () => {
      // Verify column headers are visible
      const grid = await $('[role="grid"]');
      const gridText = await grid.getText();

      // Column headers: NAME, SIZE, PERMS, MODIFIED
      expect(gridText.toUpperCase()).toContain("NAME");
      expect(gridText.toUpperCase()).toContain("SIZE");
    });
  });

  // -----------------------------------------------------------------------
  // Create Folder
  // -----------------------------------------------------------------------

  describe("Create Folder", () => {
    const TEST_FOLDER = `e2e-folder-${Date.now()}`;

    before(async () => {
      // Navigate to the uploads directory (writable)
      await doubleClickFile("uploads");
      await waitForStable(500);
    });

    after(async () => {
      // Navigate back to home
      await navigateToHomeDirectory();
    });

    it("should create a new folder", async () => {
      await createFolder(TEST_FOLDER);

      // Verify the folder appears
      expect(await waitForFileRow(TEST_FOLDER)).toBeDefined();
    });

    it("should reject empty folder name", async () => {
      // Open create folder dialog
      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await browser.keys([modifier, "n"]);
      await waitForStable(500);

      const input = await $("#folder-name");
      await input.waitForExist({ timeout: 10_000 });

      // Leave the name empty and try to submit
      const createBtn = await $(btnByText("Create"));

      // Create button should be disabled when input is empty
      const isDisabled = await createBtn.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();

      // Close the dialog
      const cancelBtn = await $(btnByText("Cancel"));
      await cancelBtn.click();
      await waitForStable(300);
    });

    // Clean up the test folder
    it("should delete the created folder", async () => {
      await deleteFileViaContextMenu(TEST_FOLDER);
      await waitForStable(500);

      // Verify folder is gone
      const row = await findFileRow(TEST_FOLDER);
      expect(row).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Rename
  // -----------------------------------------------------------------------

  describe("Rename", () => {
    const ORIGINAL_FOLDER = `rename-src-${Date.now()}`;
    const RENAMED_FOLDER = `rename-dst-${Date.now()}`;

    before(async () => {
      // Navigate to uploads (writable)
      await doubleClickFile("uploads");
      await waitForStable(500);

      // Create a folder to rename
      await createFolder(ORIGINAL_FOLDER);
    });

    after(async () => {
      // Clean up: delete the renamed folder if it exists
      const renamedRow = await findFileRow(RENAMED_FOLDER);
      if (renamedRow) {
        await deleteFileViaContextMenu(RENAMED_FOLDER);
      }
      const origRow = await findFileRow(ORIGINAL_FOLDER);
      if (origRow) {
        await deleteFileViaContextMenu(ORIGINAL_FOLDER);
      }

      // Navigate back to home
      await navigateToHomeDirectory();
    });

    it("should rename a folder via context menu", async () => {
      await renameFile(ORIGINAL_FOLDER, RENAMED_FOLDER);

      // Verify renamed folder appears
      const renamedRow = await findFileRow(RENAMED_FOLDER);
      expect(renamedRow).not.toBeNull();

      // Verify original is gone
      const origRow = await findFileRow(ORIGINAL_FOLDER);
      expect(origRow).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  describe("Delete", () => {
    before(async () => {
      // Navigate to uploads (writable)
      await doubleClickFile("uploads");
      await waitForStable(500);
    });

    after(async () => {
      // Navigate back to home
      await navigateToHomeDirectory();
    });

    it("should delete a folder via context menu", async () => {
      const folderName = `del-test-${Date.now()}`;
      await createFolder(folderName);

      // Verify it exists
      let row = await findFileRow(folderName);
      expect(row).not.toBeNull();

      // Delete it
      await deleteFileViaContextMenu(folderName);
      await waitForStable(500);

      // Verify it's gone
      row = await findFileRow(folderName);
      expect(row).toBeNull();
    });

    it("should handle create-then-delete cycle", async () => {
      const folderName = `cycle-test-${Date.now()}`;

      // Create
      await createFolder(folderName);
      let row = await findFileRow(folderName);
      expect(row).not.toBeNull();

      // Delete
      await deleteFileViaContextMenu(folderName);
      await waitForStable(500);

      // Confirm gone
      row = await findFileRow(folderName);
      expect(row).toBeNull();

      // Re-create to verify the path is truly freed
      await createFolder(folderName);
      row = await findFileRow(folderName);
      expect(row).not.toBeNull();

      // Final cleanup
      await deleteFileViaContextMenu(folderName);
    });
  });

  // -----------------------------------------------------------------------
  // File List Updates
  // -----------------------------------------------------------------------

  describe("File List Updates", () => {
    it("should show consistent state after refresh", async () => {
      // Navigate away and back to force a refresh of the file list
      // (no dedicated refresh keyboard shortcut exists)
      await doubleClickFile("test-files");
      await waitForStable(500);

      // Navigate back to home via breadcrumb
      await navigateToHomeDirectory();

      // After returning home, directory contents should still be present
      expect(await waitForFileRow("test-files")).toBeDefined();
      expect(await waitForFileRow("uploads")).toBeDefined();
    });
  });
});
