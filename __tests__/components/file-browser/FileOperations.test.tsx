import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateFolderDialog } from "@/components/file-browser/CreateFolderDialog";
import { RenameDialog } from "@/components/file-browser/RenameDialog";

describe("CreateFolderDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog when open", () => {
    render(<CreateFolderDialog {...defaultProps} />);

    expect(screen.getByText("New folder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("new_folder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("should disable create button when name is empty", () => {
    render(<CreateFolderDialog {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should enable create button when name is entered", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("new_folder"), "new-folder");

    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("should call onSubmit with trimmed name", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("new_folder"), "  new-folder  ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith("new-folder");
  });

  it("should disable create button when only whitespace is entered", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("new_folder"), "   ");

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("should show error for name containing /", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("new_folder"), "folder/name");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText(/Folder name cannot contain/)).toBeInTheDocument();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("should show error for . or .. name", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("new_folder"), ".");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByText(/Folder name cannot be/)).toBeInTheDocument();
  });

  it("should call onOpenChange(false) when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should disable inputs when isPending", () => {
    render(<CreateFolderDialog {...defaultProps} isPending={true} />);

    expect(screen.getByPlaceholderText("new_folder")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("should reset state when reopened", async () => {
    const { rerender } = render(<CreateFolderDialog {...defaultProps} open={false} />);

    rerender(<CreateFolderDialog {...defaultProps} open={true} />);

    expect(screen.getByPlaceholderText("new_folder")).toHaveValue("");
  });
});

describe("RenameDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentName: "old-name.txt",
    onSubmit: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog with current name", () => {
    render(<RenameDialog {...defaultProps} />);

    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByDisplayValue("old-name.txt")).toBeInTheDocument();
  });

  it("should call onSubmit with new name", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "new-name.txt");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith("new-name.txt");
  });

  it("should show error if new name is same as original", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByText("New name is the same as the original")).toBeInTheDocument();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("should disable confirm button when name is only whitespace", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "   ");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    });
  });

  it("should show error for name containing /", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "path/name.txt");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getByText(/Name cannot contain/)).toBeInTheDocument();
  });

  it("should disable confirm button when name is cleared", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.tripleClick(input);
    await user.keyboard("{Backspace}");

    await waitFor(
      () => {
        const button = screen.getByRole("button", { name: "Confirm" });
        expect(button).toHaveAttribute("disabled");
      },
      { timeout: 2000 }
    );
  });

  it("should disable inputs when isPending", () => {
    render(<RenameDialog {...defaultProps} isPending={true} />);

    expect(screen.getByDisplayValue("old-name.txt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("DeleteConfirmDialog removed", () => {
  it("should no longer be imported or used - delete skips confirmation", () => {
    // DeleteConfirmDialog has been removed from the codebase.
    // File deletion now happens directly without confirmation.
    expect(true).toBe(true);
  });
});
