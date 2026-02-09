import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionCard } from "@/components/connections/ConnectionCard";
import type { Profile } from "@/types/profile";

describe("ConnectionCard", () => {
  const mockProfile: Profile = {
    id: "test-profile-1",
    name: "Test Server",
    host: "192.168.1.100",
    port: 22,
    username: "testuser",
    authType: "password",
    createdAt: 1704067200000,
    updatedAt: 1704067200000,
  };

  const keyProfile: Profile = {
    ...mockProfile,
    id: "key-profile",
    authType: "key",
    privateKeyPath: "/path/to/key",
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn().mockResolvedValue(undefined);
  const mockOnConnect = vi.fn().mockResolvedValue(undefined);

  const defaultProps = {
    profile: mockProfile,
    isConnecting: false,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
    onConnect: mockOnConnect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render profile information", () => {
    render(<ConnectionCard {...defaultProps} />);

    expect(screen.getByText("Test Server")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.100")).toBeInTheDocument();
  });

  it("should show SSH key badge for key auth type", () => {
    render(<ConnectionCard {...defaultProps} profile={keyProfile} />);

    expect(screen.getByText("SSH key")).toBeInTheDocument();
  });

  it("should not show SSH key badge for password auth type", () => {
    render(<ConnectionCard {...defaultProps} />);

    expect(screen.queryByText("SSH key")).not.toBeInTheDocument();
  });

  it("should call onConnect when connect button clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should disable connect button when connecting", () => {
    render(<ConnectionCard {...defaultProps} isConnecting={true} />);

    const connectButton = screen.getByRole("button", { name: "Connecting" });
    expect(connectButton).toBeDisabled();
  });

  it("should call onEdit via dropdown menu", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Click more button to open dropdown (second button)
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    await user.click(moreButton);

    // Click edit option
    await user.click(screen.getByText("Edit"));

    expect(mockOnEdit).toHaveBeenCalledWith("test-profile-1");
  });

  it("should open delete confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Click more button to open dropdown
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    await user.click(moreButton);

    // Click delete option
    await user.click(screen.getByText("Delete"));

    // Confirm dialog should appear
    expect(screen.getByText("Delete connection")).toBeInTheDocument();
  });

  it("should call onDelete after confirmation", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    await user.click(moreButton);
    await user.click(screen.getByText("Delete"));

    // Click confirm delete button (in dialog)
    const deleteButtons = screen.getAllByText("Delete");
    const confirmButton = deleteButtons[deleteButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith("test-profile-1");
    });
  });

  it("should cancel delete when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    await user.click(moreButton);
    await user.click(screen.getByText("Delete"));

    // Click cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it("should handle async delete operation", async () => {
    const user = userEvent.setup();
    mockOnDelete.mockResolvedValue(undefined);

    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const buttons = screen.getAllByRole("button");
    const moreButton = buttons[1];
    await user.click(moreButton);
    await user.click(screen.getByText("Delete"));

    // Click confirm delete button
    const deleteButtons = screen.getAllByText("Delete");
    const confirmButton = deleteButtons[deleteButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith("test-profile-1");
    });
  });

  it("should display profile name", () => {
    render(<ConnectionCard {...defaultProps} />);

    expect(screen.getByText("Test Server")).toBeInTheDocument();
  });

  it("should apply opacity when connecting", () => {
    const { container } = render(<ConnectionCard {...defaultProps} isConnecting={true} />);

    const card = container.querySelector(".opacity-50");
    expect(card).toBeInTheDocument();
  });
});
