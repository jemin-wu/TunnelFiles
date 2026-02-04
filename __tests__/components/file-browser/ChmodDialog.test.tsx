/**
 * ChmodDialog 组件测试
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChmodDialog } from "@/components/file-browser/ChmodDialog";
import type { FileEntry } from "@/types/file";

describe("ChmodDialog", () => {
  const mockFiles: FileEntry[] = [
    { name: "test.txt", path: "/test.txt", isDir: false, mode: 0o644 },
    { name: "script.sh", path: "/script.sh", isDir: false, mode: 0o755 },
  ];

  const singleFile: FileEntry[] = [
    { name: "config.json", path: "/config.json", isDir: false, mode: 0o644 },
  ];

  it("should render when open", () => {
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={singleFile}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByText("CHMOD_PERMISSIONS")).toBeInTheDocument();
  });

  it("should not render when closed", () => {
    render(
      <ChmodDialog
        open={false}
        onOpenChange={vi.fn()}
        files={singleFile}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.queryByText("CHMOD_PERMISSIONS")).not.toBeInTheDocument();
  });

  it("should display selected file count", () => {
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={mockFiles}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("should display file names", () => {
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={mockFiles}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    expect(screen.getByText("test.txt")).toBeInTheDocument();
    expect(screen.getByText("script.sh")).toBeInTheDocument();
  });

  it("should call onSubmit with mode when APPLY is clicked", async () => {
    const onSubmit = vi.fn();
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={singleFile}
        onSubmit={onSubmit}
        isPending={false}
      />
    );

    const applyButton = screen.getByRole("button", { name: /APPLY/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(0o644); // initial mode from file
    });
  });

  it("should call onOpenChange when CANCEL is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ChmodDialog
        open={true}
        onOpenChange={onOpenChange}
        files={singleFile}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    const cancelButton = screen.getByRole("button", { name: /CANCEL/i });
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should disable buttons when isPending", () => {
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={singleFile}
        onSubmit={vi.fn()}
        isPending={true}
      />
    );

    const applyButton = screen.getByRole("button", { name: /APPLY/i });
    expect(applyButton).toBeDisabled();
  });

  it("should show permission matrix", () => {
    render(
      <ChmodDialog
        open={true}
        onOpenChange={vi.fn()}
        files={singleFile}
        onSubmit={vi.fn()}
        isPending={false}
      />
    );

    // PermissionMatrix 应该渲染
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("GROUP")).toBeInTheDocument();
    expect(screen.getByText("OTHERS")).toBeInTheDocument();
  });
});
