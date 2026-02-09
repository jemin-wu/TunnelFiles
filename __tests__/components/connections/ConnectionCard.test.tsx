import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionItem } from "@/components/connections/ConnectionItem";
import type { Profile } from "@/types/profile";

describe("ConnectionItem", () => {
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

  const mockOnConnect = vi.fn();
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  const defaultProps = {
    profile: mockProfile,
    isConnecting: false,
    animationDelay: 0,
    onConnect: mockOnConnect,
    onEdit: mockOnEdit,
    onDelete: mockOnDelete,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render profile information", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.getByText("Test Server")).toBeInTheDocument();
    expect(screen.getByText("testuser@192.168.1.100:22")).toBeInTheDocument();
  });

  it("should show SSH key badge for key auth type", () => {
    render(<ConnectionItem {...defaultProps} profile={keyProfile} />);

    expect(screen.getByText("key")).toBeInTheDocument();
  });

  it("should not show SSH key badge for password auth type", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.queryByText("key")).not.toBeInTheDocument();
  });

  it("should call onConnect when double-clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    await user.dblClick(screen.getByRole("listitem"));

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should apply connecting styles when isConnecting", () => {
    const { container } = render(<ConnectionItem {...defaultProps} isConnecting={true} />);

    const item = container.querySelector(".opacity-50");
    expect(item).toBeInTheDocument();
  });

  it("should display profile name", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.getByText("Test Server")).toBeInTheDocument();
  });

  it("should show action buttons", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.getByLabelText("Connect to Test Server")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit Test Server")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete Test Server")).toBeInTheDocument();
  });

  it("should call onConnect via connect button", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    await user.click(screen.getByLabelText("Connect to Test Server"));

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should call onEdit via edit button", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    await user.click(screen.getByLabelText("Edit Test Server"));

    expect(mockOnEdit).toHaveBeenCalledWith(mockProfile);
  });

  it("should call onDelete via delete button", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    await user.click(screen.getByLabelText("Delete Test Server"));

    expect(mockOnDelete).toHaveBeenCalledWith(mockProfile);
  });

  it("should show spinner when connecting", () => {
    render(<ConnectionItem {...defaultProps} isConnecting={true} />);

    // The spinner replaces action buttons
    expect(screen.queryByLabelText("Connect to Test Server")).not.toBeInTheDocument();
  });
});
