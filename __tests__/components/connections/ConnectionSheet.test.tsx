import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionSheet } from "@/components/connections/ConnectionSheet";
import type { Profile } from "@/types/profile";

// Polyfill ResizeObserver for Radix UI ScrollArea / Sheet
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }
});

// Mock useUpsertProfile hook
const mockMutateAsync = vi.fn().mockResolvedValue("profile-id");

vi.mock("@/hooks/useProfiles", () => ({
  useUpsertProfile: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock tauri dialog
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// Mock sonner toast (used by lib/error)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockOnOpenChange = vi.fn();

const editProfile: Profile = {
  id: "edit-1",
  name: "My Server",
  host: "10.0.0.1",
  port: 2222,
  username: "admin",
  authType: "password",
  passwordRef: "keychain-ref-1",
  createdAt: 1704067200000,
  updatedAt: 1704067200000,
};

const keyProfile: Profile = {
  ...editProfile,
  id: "key-1",
  authType: "key",
  privateKeyPath: "/home/user/.ssh/id_rsa",
  passwordRef: undefined,
  passphraseRef: "keychain-passphrase-ref",
};

describe("ConnectionSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not render content when open=false", () => {
    renderWithProviders(<ConnectionSheet open={false} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByText("New connection")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit connection")).not.toBeInTheDocument();
  });

  it("should render 'New connection' title when open with no editProfile", () => {
    renderWithProviders(<ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("New connection")).toBeInTheDocument();
    expect(screen.getByText("Add a new remote server connection")).toBeInTheDocument();
  });

  it("should render form fields when open", () => {
    renderWithProviders(<ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("Auth method")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("Port")).toBeInTheDocument();
    expect(screen.getByText("Username")).toBeInTheDocument();
  });

  it("should render 'Edit connection' title when editProfile is provided", () => {
    renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} editProfile={editProfile} />
    );

    expect(screen.getByText("Edit connection")).toBeInTheDocument();
    expect(screen.getByText("Update your server connection settings")).toBeInTheDocument();
  });

  it("should populate form fields with editProfile data", () => {
    renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} editProfile={editProfile} />
    );

    expect(screen.getByDisplayValue("My Server")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2222")).toBeInTheDocument();
    expect(screen.getByDisplayValue("admin")).toBeInTheDocument();
  });

  it("should show private key field when SSH key auth type is selected", async () => {
    const user = userEvent.setup();

    renderWithProviders(<ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />);

    // Initially Password is selected, no private key field
    expect(screen.queryByText("Private key")).not.toBeInTheDocument();

    // Click the "SSH key" radio to switch auth type
    const sshKeyButton = screen.getByRole("radio", { name: /SSH key/i });
    await user.click(sshKeyButton);

    expect(screen.getByText("Private key")).toBeInTheDocument();
  });

  it("should show Save button in edit mode and Create button in new mode", () => {
    const { unmount } = renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("Create")).toBeInTheDocument();
    unmount();

    renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} editProfile={editProfile} />
    );

    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("should call mutateAsync on form submit", async () => {
    const user = userEvent.setup();

    renderWithProviders(<ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />);

    // Fill required fields
    await user.type(screen.getByPlaceholderText("production-server"), "Test Server");
    await user.type(screen.getByPlaceholderText("192.168.1.100"), "10.0.0.1");
    await user.type(screen.getByPlaceholderText("root"), "testuser");

    // Submit form
    const createButton = screen.getByText("Create");
    await user.click(createButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    // Verify the call includes the form values
    const callArgs = mockMutateAsync.mock.calls[0][0];
    expect(callArgs.name).toBe("Test Server");
    expect(callArgs.host).toBe("10.0.0.1");
    expect(callArgs.username).toBe("testuser");
    expect(callArgs.authType).toBe("password");
  });

  it("should render Cancel button that calls onOpenChange(false)", async () => {
    const user = userEvent.setup();

    renderWithProviders(<ConnectionSheet open={true} onOpenChange={mockOnOpenChange} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show keychain indicator in edit mode when passwordRef exists", () => {
    renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} editProfile={editProfile} />
    );

    expect(screen.getByText("(saved in keychain)")).toBeInTheDocument();
  });

  it("should show passphrase field with keychain indicator for key auth edit", () => {
    renderWithProviders(
      <ConnectionSheet open={true} onOpenChange={mockOnOpenChange} editProfile={keyProfile} />
    );

    expect(screen.getByText("Private key")).toBeInTheDocument();
    // Passphrase label with keychain indicator
    expect(screen.getAllByText("(saved in keychain)").length).toBeGreaterThanOrEqual(1);
  });
});
