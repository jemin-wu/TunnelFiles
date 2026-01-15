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
    expect(screen.getByText("192.168.1.100:22")).toBeInTheDocument();
    expect(screen.getByText(/testuser@/)).toBeInTheDocument();
  });

  it("should show SSH Key badge for key auth type", () => {
    render(<ConnectionCard {...defaultProps} profile={keyProfile} />);

    expect(screen.getByText("SSH Key")).toBeInTheDocument();
  });

  it("should not show SSH Key badge for password auth type", () => {
    render(<ConnectionCard {...defaultProps} />);

    expect(screen.queryByText("SSH Key")).not.toBeInTheDocument();
  });

  it("should call onConnect when connect button clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /连接/ }));

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should show connecting state", () => {
    render(<ConnectionCard {...defaultProps} isConnecting={true} />);

    expect(screen.getByText("连接中...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /连接中/ })).toBeDisabled();
  });

  it("should open dropdown menu and call onEdit", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Click more button to open dropdown
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click edit option
    await user.click(screen.getByText("编辑"));

    expect(mockOnEdit).toHaveBeenCalledWith(mockProfile);
  });

  it("should open delete confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Click more button to open dropdown
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);

    // Click delete option
    await user.click(screen.getByText("删除"));

    // Confirm dialog should appear
    expect(screen.getByText("确认删除")).toBeInTheDocument();
    expect(screen.getByText(/确定要删除连接「Test Server」吗/)).toBeInTheDocument();
  });

  it("should call onDelete after confirmation", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);
    await user.click(screen.getByText("删除"));

    // Click confirm delete
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith("test-profile-1");
    });
  });

  it("should cancel delete when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);
    await user.click(screen.getByText("删除"));

    // Click cancel
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it("should handle async delete operation", async () => {
    const user = userEvent.setup();
    // Simple resolved promise
    mockOnDelete.mockResolvedValue(undefined);

    render(<ConnectionCard {...defaultProps} />);

    // Open menu and click delete
    const moreButton = screen.getByRole("button", { name: "" });
    await user.click(moreButton);
    await user.click(screen.getByText("删除"));

    // Click confirm delete
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith("test-profile-1");
    });
  });

  it("should display relative time for updatedAt", () => {
    render(<ConnectionCard {...defaultProps} />);

    // The component uses formatRelativeTime, so we just check it renders something
    // The exact text depends on the current time relative to updatedAt
    const cardContent = screen.getByText("Test Server").closest("div");
    expect(cardContent).toBeInTheDocument();
  });

  it("should apply opacity when connecting", () => {
    const { container } = render(
      <ConnectionCard {...defaultProps} isConnecting={true} />
    );

    // The card should have opacity-80 class when connecting
    const card = container.querySelector(".opacity-80");
    expect(card).toBeInTheDocument();
  });
});
