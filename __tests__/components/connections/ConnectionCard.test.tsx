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

  const nonStandardPortProfile: Profile = {
    ...mockProfile,
    id: "custom-port-profile",
    port: 2222,
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

  it("should render profile name and host info", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.getByText("Test Server")).toBeInTheDocument();
    expect(screen.getByText("testuser@192.168.1.100")).toBeInTheDocument();
  });

  it("should hide port 22 in host info", () => {
    render(<ConnectionItem {...defaultProps} />);

    // Port 22 is default, should not show :22
    expect(screen.queryByText(/.*:22$/)).not.toBeInTheDocument();
  });

  it("should show non-standard port in host info", () => {
    render(<ConnectionItem {...defaultProps} profile={nonStandardPortProfile} />);

    expect(screen.getByText(/testuser@192\.168\.1\.100:2222/)).toBeInTheDocument();
  });

  it("should show SSH key icon for key auth type", () => {
    const { container } = render(<ConnectionItem {...defaultProps} profile={keyProfile} />);

    // Key icon is rendered for key auth type
    const keyIcon = container.querySelector(".lucide-key");
    expect(keyIcon).toBeInTheDocument();
  });

  it("should call onConnect when clicked", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    await user.click(screen.getByRole("listitem"));

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should call onConnect on Enter key", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    const item = screen.getByRole("listitem");
    item.focus();
    await user.keyboard("{Enter}");

    expect(mockOnConnect).toHaveBeenCalledWith("test-profile-1");
  });

  it("should call onDelete on Delete key", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    const item = screen.getByRole("listitem");
    item.focus();
    await user.keyboard("{Delete}");

    expect(mockOnDelete).toHaveBeenCalledWith(mockProfile);
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

  it("should have accessible aria-label on actions menu button", () => {
    render(<ConnectionItem {...defaultProps} />);

    expect(screen.getByLabelText("Actions for Test Server")).toBeInTheDocument();
  });

  it("should have accessible label on SSH key indicator", () => {
    render(<ConnectionItem {...defaultProps} profile={keyProfile} />);

    expect(screen.getByLabelText("SSH key authentication")).toBeInTheDocument();
  });

  it("should not trigger delete on Backspace key", async () => {
    const user = userEvent.setup();
    render(<ConnectionItem {...defaultProps} />);

    const item = screen.getByRole("listitem");
    item.focus();
    await user.keyboard("{Backspace}");

    expect(mockOnDelete).not.toHaveBeenCalled();
  });
});
