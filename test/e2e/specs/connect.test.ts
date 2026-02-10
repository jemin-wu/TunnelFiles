/**
 * E2E tests for the connection lifecycle.
 * Requires Docker SSH server running on localhost:2222.
 */

import {
  TEST_SERVER,
  waitForStable,
  navigateToConnections,
  openAddConnectionSheet,
  addConnectionProfile,
  profileExists,
  deleteProfile,
  fullConnectFlow,
  disconnect,
  btnByText,
  clickProfileAction,
} from "../helpers/e2e-helpers";

describe("Connection Flow", () => {
  // Clean up any leftover test profiles before we start
  before(async () => {
    await navigateToConnections();
  });

  // -----------------------------------------------------------------------
  // Add Connection Profile
  // -----------------------------------------------------------------------

  describe("Add Connection Profile", () => {
    after(async () => {
      // Clean up: delete the profile we created
      await navigateToConnections();
      if (await profileExists(TEST_SERVER.name)) {
        await deleteProfile(TEST_SERVER.name);
      }
    });

    it("should open the connection sheet from empty state", async () => {
      await navigateToConnections();

      // If no profiles exist, the empty state "New connection" button should be visible
      // Otherwise, the "+" button in the toolbar
      await openAddConnectionSheet();

      // Verify the sheet is open with "New connection" title
      const title = await $("//span[text()='New connection']");
      expect(await title.isDisplayed()).toBe(true);

      // Close it
      const cancelBtn = await $(btnByText("Cancel"));
      await cancelBtn.click();
      await waitForStable(300);
    });

    it("should create a new connection profile", async () => {
      await addConnectionProfile();

      // Verify the profile appears in the list
      const exists = await profileExists(TEST_SERVER.name);
      expect(exists).toBe(true);
    });

    it("should validate required fields", async () => {
      await openAddConnectionSheet();

      // Try to submit with empty fields
      const createBtn = await $(btnByText("Create"));
      await createBtn.click();
      await waitForStable(300);

      // Validation messages should appear
      const sheet = await $('[role="dialog"]');
      const sheetText = await sheet.getText();
      expect(sheetText).toContain("required");

      // Close the sheet
      const cancelBtn = await $(btnByText("Cancel"));
      await cancelBtn.click();
      await waitForStable(300);
    });
  });

  // -----------------------------------------------------------------------
  // Connect with Password
  // -----------------------------------------------------------------------

  describe("Connect with Password", () => {
    before(async () => {
      await navigateToConnections();
      if (!(await profileExists(TEST_SERVER.name))) {
        await addConnectionProfile();
      }
    });

    after(async () => {
      // Make sure we're back on connections page
      try {
        await disconnect();
      } catch {
        await navigateToConnections();
      }
      if (await profileExists(TEST_SERVER.name)) {
        await deleteProfile(TEST_SERVER.name);
      }
    });

    it("should connect to Docker server and show file browser", async () => {
      await fullConnectFlow();

      // Verify file browser is displayed
      const nav = await $('nav[aria-label="Breadcrumb navigation"]');
      expect(await nav.isDisplayed()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Disconnect
  // -----------------------------------------------------------------------

  describe("Disconnect", () => {
    before(async () => {
      await navigateToConnections();
      if (!(await profileExists(TEST_SERVER.name))) {
        await addConnectionProfile();
      }
      await fullConnectFlow();
    });

    after(async () => {
      await navigateToConnections();
      if (await profileExists(TEST_SERVER.name)) {
        await deleteProfile(TEST_SERVER.name);
      }
    });

    it("should return to connections page when clicking Back", async () => {
      await disconnect();

      // Verify we're on the connections page
      const heading = await $("//span[text()='Connections']");
      expect(await heading.isDisplayed()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edit Connection Profile
  // -----------------------------------------------------------------------

  describe("Edit Connection Profile", () => {
    const ORIGINAL_NAME = "edit-test-server";
    const UPDATED_NAME = "edit-test-updated";

    before(async () => {
      await navigateToConnections();
      await addConnectionProfile({ ...TEST_SERVER, name: ORIGINAL_NAME });
    });

    after(async () => {
      await navigateToConnections();
      // Clean up whichever name the profile ended up with
      for (const name of [UPDATED_NAME, ORIGINAL_NAME]) {
        if (await profileExists(name)) {
          await deleteProfile(name);
        }
      }
    });

    it("should open edit sheet with pre-filled values", async () => {
      await clickProfileAction(ORIGINAL_NAME, "edit");

      // Verify "Edit connection" title
      const title = await $("//span[text()='Edit connection']");
      await title.waitForExist({ timeout: 10_000 });
      expect(await title.isDisplayed()).toBe(true);

      // Verify pre-filled host
      const hostInput = await $('input[name="host"]');
      const hostValue = await hostInput.getValue();
      expect(hostValue).toBe(TEST_SERVER.host);

      // Close
      const cancelBtn = await $(btnByText("Cancel"));
      await cancelBtn.click();
      await waitForStable(300);
    });

    it("should update profile name and save", async () => {
      await clickProfileAction(ORIGINAL_NAME, "edit");

      const sheet = await $('[role="dialog"]');
      await sheet.waitForExist({ timeout: 10_000 });

      // Wait for sheet animation to complete
      const nameInput = await $('input[name="name"]');
      await nameInput.waitForDisplayed({ timeout: 10_000 });
      await waitForStable(300);

      // Update the name field
      await nameInput.clearValue();
      await nameInput.setValue(UPDATED_NAME);

      // Save
      const saveBtn = await $(btnByText("Save"));
      await saveBtn.click();
      await waitForStable(800);

      // Verify the updated name appears in the list
      const exists = await profileExists(UPDATED_NAME);
      expect(exists).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Delete Connection Profile
  // -----------------------------------------------------------------------

  describe("Delete Connection Profile", () => {
    it("should cancel deletion", async () => {
      await navigateToConnections();
      const profileName = "delete-cancel-test";
      await addConnectionProfile({ ...TEST_SERVER, name: profileName });

      // Trigger delete from profile actions
      await clickProfileAction(profileName, "delete");

      // AlertDialog should appear
      const alertDialog = await $('[role="alertdialog"]');
      await alertDialog.waitForExist({ timeout: 10_000 });

      // Click Cancel
      const cancelBtn = await alertDialog.$(".//button[normalize-space(.)='Cancel']");
      await cancelBtn.click();
      await waitForStable(300);

      // Profile should still exist
      const exists = await profileExists(profileName);
      expect(exists).toBe(true);

      // Clean up
      await deleteProfile(profileName);
    });

    it("should confirm and delete profile", async () => {
      await navigateToConnections();
      const profileName = "delete-confirm-test";
      await addConnectionProfile({ ...TEST_SERVER, name: profileName });

      // Delete via helper
      await deleteProfile(profileName);

      // Verify profile is gone
      const exists = await profileExists(profileName);
      expect(exists).toBe(false);
    });
  });
});
