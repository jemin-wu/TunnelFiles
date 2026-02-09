import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateFolderDialog } from "@/components/file-browser/CreateFolderDialog";
import { RenameDialog } from "@/components/file-browser/RenameDialog";
import { DeleteConfirmDialog } from "@/components/file-browser/DeleteConfirmDialog";
import type { FileEntry } from "@/types";

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

describe("DeleteConfirmDialog", () => {
  const mockFile: FileEntry = {
    name: "test-file.txt",
    path: "/home/user/test-file.txt",
    isDir: false,
    size: 1024,
    mtime: 1704067200,
    mode: 0o644,
  };

  const mockFolder: FileEntry = {
    name: "test-folder",
    path: "/home/user/test-folder",
    isDir: true,
    size: 4096,
    mtime: 1704067200,
    mode: 0o755,
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    file: mockFile,
    onConfirm: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render dialog for file", () => {
    render(<DeleteConfirmDialog {...defaultProps} />);

    expect(screen.getByText("Confirm delete")).toBeInTheDocument();
    expect(screen.getByText(/test-file.txt/)).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
  });

  it("should render dialog for folder (empty directory)", () => {
    render(<DeleteConfirmDialog {...defaultProps} file={mockFolder} />);

    expect(screen.getByText(/test-folder/)).toBeInTheDocument();
    expect(screen.getByText(/Empty directory/)).toBeInTheDocument();
  });

  it("should render dialog for non-empty directory with stats", () => {
    const stats = { fileCount: 10, dirCount: 3, totalSize: 1024 * 1024 };
    render(<DeleteConfirmDialog {...defaultProps} file={mockFolder} stats={stats} />);

    expect(screen.getByText(/test-folder/)).toBeInTheDocument();
    expect(screen.getByText(/Warning: this directory contains/)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeInTheDocument();
  });

  it("should show loading indicator when loading stats", () => {
    render(<DeleteConfirmDialog {...defaultProps} file={mockFolder} isLoadingStats={true} />);

    expect(screen.getByText(/Scanning directory/)).toBeInTheDocument();
  });

  it("should show progress during deletion", () => {
    const progress = {
      path: mockFolder.path,
      deletedCount: 5,
      totalCount: 13,
      currentPath: "/home/user/test-folder/subdir/file.txt",
    };
    render(
      <DeleteConfirmDialog
        {...defaultProps}
        file={mockFolder}
        isPending={true}
        progress={progress}
      />
    );

    expect(screen.getByText("Deleting...")).toBeInTheDocument();
    expect(screen.getByText("5 / 13")).toBeInTheDocument();
  });

  it("should call onConfirm when delete clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it("should call onOpenChange(false) when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should disable buttons when isPending", () => {
    render(<DeleteConfirmDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("should render nothing when file is null", () => {
    const { container } = render(<DeleteConfirmDialog {...defaultProps} file={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
