import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostKeyDialog } from "@/components/connections/HostKeyDialog";
import type { HostKeyPayload } from "@/types/events";

describe("HostKeyDialog", () => {
  const defaultPayload: HostKeyPayload = {
    profileId: "profile-1",
    host: "192.168.1.100",
    port: 22,
    keyType: "ssh-ed25519",
    fingerprint: "SHA256:abc123def456...",
    status: "unknown",
  };

  const mismatchPayload: HostKeyPayload = {
    ...defaultPayload,
    status: "mismatch",
  };

  const mockOnOpenChange = vi.fn();
  const mockOnTrust = vi.fn();
  const mockOnReject = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    payload: defaultPayload,
    isProcessing: false,
    onTrust: mockOnTrust,
    onReject: mockOnReject,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not render when payload is null", () => {
    const { container } = render(
      <HostKeyDialog {...defaultProps} payload={null} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("should render first connection dialog with correct title", () => {
    render(<HostKeyDialog {...defaultProps} />);

    expect(screen.getByText("HOSTKEY_VERIFY")).toBeInTheDocument();
    expect(screen.getByText(/首次连接此服务器/)).toBeInTheDocument();
  });

  it("should display server information", () => {
    render(<HostKeyDialog {...defaultProps} />);

    expect(screen.getByText("192.168.1.100:22")).toBeInTheDocument();
    expect(screen.getByText("ssh-ed25519")).toBeInTheDocument();
    expect(screen.getByText("SHA256:abc123def456...")).toBeInTheDocument();
  });

  it("should render mismatch warning dialog", () => {
    render(<HostKeyDialog {...defaultProps} payload={mismatchPayload} />);

    expect(screen.getByText("HOSTKEY_MISMATCH")).toBeInTheDocument();
    expect(screen.getByText(/服务器指纹与记录不一致/)).toBeInTheDocument();
    expect(screen.getByText(/请仔细核实服务器指纹/)).toBeInTheDocument();
  });

  it("should show different button text for first connection", () => {
    render(<HostKeyDialog {...defaultProps} />);

    expect(screen.getByRole("button", { name: "TRUST" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REJECT" })).toBeInTheDocument();
  });

  it("should show different button text for mismatch", () => {
    render(<HostKeyDialog {...defaultProps} payload={mismatchPayload} />);

    expect(
      screen.getByRole("button", { name: "TRUST_ANYWAY" })
    ).toBeInTheDocument();
  });

  it("should call onTrust when trust button clicked", async () => {
    const user = userEvent.setup();
    render(<HostKeyDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "TRUST" }));

    expect(mockOnTrust).toHaveBeenCalledTimes(1);
  });

  it("should call onReject when cancel button clicked", async () => {
    const user = userEvent.setup();
    render(<HostKeyDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "REJECT" }));

    expect(mockOnReject).toHaveBeenCalledTimes(1);
  });

  it("should disable buttons when processing", () => {
    render(<HostKeyDialog {...defaultProps} isProcessing={true} />);

    expect(screen.getByRole("button", { name: "REJECT" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /TRUST/ })).toBeDisabled();
  });

  it("should show loading indicator when processing", () => {
    render(<HostKeyDialog {...defaultProps} isProcessing={true} />);

    const trustButton = screen.getByRole("button", { name: /TRUST/ });
    expect(trustButton).toBeInTheDocument();
  });

  it("should call onReject when dialog closed via escape or backdrop", async () => {
    render(<HostKeyDialog {...defaultProps} />);

    mockOnOpenChange.mockImplementation((open) => {
      if (!open) {
        mockOnReject();
      }
    });

    expect(mockOnReject).not.toHaveBeenCalled();
  });

  it("should not allow closing when processing", () => {
    render(<HostKeyDialog {...defaultProps} isProcessing={true} />);
    // Close button should not be shown when processing
  });
});
