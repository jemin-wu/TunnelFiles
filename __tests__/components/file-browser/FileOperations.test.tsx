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

    expect(screen.getByText("新建文件夹")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入文件夹名称")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();
  });

  it("should disable create button when name is empty", () => {
    render(<CreateFolderDialog {...defaultProps} />);

    expect(screen.getByRole("button", { name: "创建" })).toBeDisabled();
  });

  it("should enable create button when name is entered", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("输入文件夹名称"), "new-folder");

    expect(screen.getByRole("button", { name: "创建" })).toBeEnabled();
  });

  it("should call onSubmit with trimmed name", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("输入文件夹名称"), "  new-folder  ");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith("new-folder");
  });

  it("should disable create button when only whitespace is entered", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("输入文件夹名称"), "   ");

    // Button should remain disabled because trimmed name is empty
    expect(screen.getByRole("button", { name: "创建" })).toBeDisabled();
  });

  it("should show error for name containing /", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("输入文件夹名称"), "folder/name");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(screen.getByText("文件夹名称不能包含 /")).toBeInTheDocument();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("should show error for . or .. name", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.type(screen.getByPlaceholderText("输入文件夹名称"), ".");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(screen.getByText("文件夹名称不能是 . 或 ..")).toBeInTheDocument();
  });

  it("should call onOpenChange(false) when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<CreateFolderDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should disable inputs when isPending", () => {
    render(<CreateFolderDialog {...defaultProps} isPending={true} />);

    expect(screen.getByPlaceholderText("输入文件夹名称")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  });

  it("should reset state when reopened", async () => {
    const { rerender } = render(
      <CreateFolderDialog {...defaultProps} open={false} />
    );

    rerender(<CreateFolderDialog {...defaultProps} open={true} />);

    expect(screen.getByPlaceholderText("输入文件夹名称")).toHaveValue("");
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

    expect(screen.getByText("重命名")).toBeInTheDocument();
    expect(screen.getByDisplayValue("old-name.txt")).toBeInTheDocument();
  });

  it("should call onSubmit with new name", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "new-name.txt");
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(defaultProps.onSubmit).toHaveBeenCalledWith("new-name.txt");
  });

  it("should show error if new name is same as original", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByText("新名称与原名称相同")).toBeInTheDocument();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("should disable confirm button when name is only whitespace", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "   "); // Type only spaces

    // Button should be disabled because trimmed name is empty
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确定" })).toBeDisabled();
    });
  });

  it("should show error for name containing /", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    await user.clear(input);
    await user.type(input, "path/name.txt");
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByText("名称不能包含 /")).toBeInTheDocument();
  });

  it("should disable confirm button when name is cleared", async () => {
    const user = userEvent.setup();
    render(<RenameDialog {...defaultProps} />);

    const input = screen.getByDisplayValue("old-name.txt");
    // Use keyboard to clear the input properly
    await user.tripleClick(input);
    await user.keyboard("{Backspace}");

    // Wait for state to update and check button is disabled
    await waitFor(
      () => {
        const button = screen.getByRole("button", { name: "确定" });
        expect(button).toHaveAttribute("disabled");
      },
      { timeout: 2000 }
    );
  });

  it("should disable inputs when isPending", () => {
    render(<RenameDialog {...defaultProps} isPending={true} />);

    expect(screen.getByDisplayValue("old-name.txt")).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
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

    expect(screen.getByText("确认删除")).toBeInTheDocument();
    expect(screen.getByText(/test-file.txt/)).toBeInTheDocument();
    expect(screen.getByText("此操作无法撤销。")).toBeInTheDocument();
  });

  it("should render dialog for folder with warning", () => {
    render(<DeleteConfirmDialog {...defaultProps} file={mockFolder} />);

    expect(screen.getByText(/test-folder/)).toBeInTheDocument();
    expect(screen.getByText("注意：仅支持删除空文件夹")).toBeInTheDocument();
  });

  it("should call onConfirm when delete clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "删除" }));

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it("should call onOpenChange(false) when cancel clicked", async () => {
    const user = userEvent.setup();
    render(<DeleteConfirmDialog {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should disable buttons when isPending", () => {
    render(<DeleteConfirmDialog {...defaultProps} isPending={true} />);

    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it("should render nothing when file is null", () => {
    const { container } = render(
      <DeleteConfirmDialog {...defaultProps} file={null} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("should show folder type label for directory", () => {
    render(<DeleteConfirmDialog {...defaultProps} file={mockFolder} />);

    expect(screen.getByText(/确定要删除文件夹/)).toBeInTheDocument();
  });

  it("should show file type label for file", () => {
    render(<DeleteConfirmDialog {...defaultProps} file={mockFile} />);

    expect(screen.getByText(/确定要删除文件/)).toBeInTheDocument();
  });
});
