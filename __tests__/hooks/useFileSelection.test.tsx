import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileSelection } from "@/hooks/useFileSelection";
import type { FileEntry } from "@/types";

// 工厂函数创建 FileEntry
const createFileEntry = (overrides: Partial<FileEntry> = {}): FileEntry => ({
  name: "file.txt",
  path: "/home/user/file.txt",
  isDir: false,
  size: 1024,
  mtime: 1700000000,
  ...overrides,
});

// 创建测试用文件列表
const createMockFiles = (): FileEntry[] => [
  createFileEntry({ name: "file1.txt", path: "/path/file1.txt" }),
  createFileEntry({ name: "file2.txt", path: "/path/file2.txt" }),
  createFileEntry({ name: "file3.txt", path: "/path/file3.txt" }),
  createFileEntry({ name: "file4.txt", path: "/path/file4.txt" }),
  createFileEntry({ name: "file5.txt", path: "/path/file5.txt" }),
];

describe("useFileSelection", () => {
  let files: FileEntry[];

  beforeEach(() => {
    files = createMockFiles();
  });

  describe("初始状态", () => {
    it("应该初始化为空选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      expect(result.current.selectedPaths.size).toBe(0);
      expect(result.current.selectedFiles).toHaveLength(0);
      expect(result.current.selectedPath).toBeNull();
      expect(result.current.selectedFile).toBeNull();
      expect(result.current.selectionCount).toBe(0);
    });
  });

  describe("单选行为", () => {
    it("点击应该选中单个文件", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file1.txt");
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file1.txt")).toBe(true);
      expect(result.current.selectedPath).toBe("/path/file1.txt");
    });

    it("点击另一个文件应该取消之前的选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file1.txt");
      });
      act(() => {
        result.current.selectFile("/path/file2.txt");
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file1.txt")).toBe(false);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
    });
  });

  describe("Cmd+Click 切换选择", () => {
    it("Cmd+Click 应该添加到现有选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file1.txt");
      });
      act(() => {
        result.current.selectFile("/path/file3.txt", { metaKey: true });
      });

      expect(result.current.selectionCount).toBe(2);
      expect(result.current.isSelected("/path/file1.txt")).toBe(true);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
    });

    it("Cmd+Click 已选中的文件应该取消选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file1.txt");
      });
      act(() => {
        result.current.selectFile("/path/file3.txt", { metaKey: true });
      });
      act(() => {
        result.current.selectFile("/path/file1.txt", { metaKey: true });
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file1.txt")).toBe(false);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
    });
  });

  describe("Shift+Click 范围选择", () => {
    it("Shift+Click 应该选择从锚点到目标的范围", () => {
      const { result } = renderHook(() => useFileSelection(files));

      // 先点击 file2 设置锚点
      act(() => {
        result.current.selectFile("/path/file2.txt");
      });
      // Shift+Click file4
      act(() => {
        result.current.selectFile("/path/file4.txt", { shiftKey: true });
      });

      expect(result.current.selectionCount).toBe(3);
      expect(result.current.isSelected("/path/file1.txt")).toBe(false);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
      expect(result.current.isSelected("/path/file4.txt")).toBe(true);
      expect(result.current.isSelected("/path/file5.txt")).toBe(false);
    });

    it("Shift+Click 反向选择也应该工作", () => {
      const { result } = renderHook(() => useFileSelection(files));

      // 先点击 file4 设置锚点
      act(() => {
        result.current.selectFile("/path/file4.txt");
      });
      // Shift+Click file2 (反向)
      act(() => {
        result.current.selectFile("/path/file2.txt", { shiftKey: true });
      });

      expect(result.current.selectionCount).toBe(3);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
      expect(result.current.isSelected("/path/file4.txt")).toBe(true);
    });

    it("Shift+Cmd+Click 应该添加范围到现有选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      // 选择 file1
      act(() => {
        result.current.selectFile("/path/file1.txt");
      });
      // Cmd+Click file4 (添加并设置新锚点)
      act(() => {
        result.current.selectFile("/path/file4.txt", { metaKey: true });
      });
      // Shift+Cmd+Click file5 (添加范围 4-5)
      act(() => {
        result.current.selectFile("/path/file5.txt", { metaKey: true, shiftKey: true });
      });

      expect(result.current.selectionCount).toBe(3);
      expect(result.current.isSelected("/path/file1.txt")).toBe(true);
      expect(result.current.isSelected("/path/file4.txt")).toBe(true);
      expect(result.current.isSelected("/path/file5.txt")).toBe(true);
    });
  });

  describe("全选", () => {
    it("selectAll 应该选中所有文件", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectAll();
      });

      expect(result.current.selectionCount).toBe(5);
      files.forEach((file) => {
        expect(result.current.isSelected(file.path)).toBe(true);
      });
    });
  });

  describe("清空选择", () => {
    it("clearSelection 应该清空所有选择", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectAll();
      });
      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectionCount).toBe(0);
      expect(result.current.selectedPath).toBeNull();
    });
  });

  describe("键盘导航", () => {
    it("moveSelectionDown 应该选中下一个文件", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file2.txt");
      });
      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
    });

    it("moveSelectionUp 应该选中上一个文件", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file3.txt");
      });
      act(() => {
        result.current.moveSelectionUp();
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
    });

    it("Shift+Down 应该扩展选择范围", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file2.txt");
      });
      act(() => {
        result.current.moveSelectionDown({ shiftKey: true });
      });
      act(() => {
        result.current.moveSelectionDown({ shiftKey: true });
      });

      expect(result.current.selectionCount).toBe(3);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
      expect(result.current.isSelected("/path/file4.txt")).toBe(true);
    });

    it("Shift+Up 应该扩展选择范围", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file4.txt");
      });
      act(() => {
        result.current.moveSelectionUp({ shiftKey: true });
      });
      act(() => {
        result.current.moveSelectionUp({ shiftKey: true });
      });

      expect(result.current.selectionCount).toBe(3);
      expect(result.current.isSelected("/path/file2.txt")).toBe(true);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
      expect(result.current.isSelected("/path/file4.txt")).toBe(true);
    });

    it("没有选择时 moveSelectionDown 应该选中第一个", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file1.txt")).toBe(true);
    });

    it("没有选择时 moveSelectionUp 应该选中最后一个", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.moveSelectionUp();
      });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file5.txt")).toBe(true);
    });
  });

  describe("文件列表变化时的行为", () => {
    it("选中的文件被删除后应该从选择中移除", () => {
      const { result, rerender } = renderHook(
        ({ fileList }) => useFileSelection(fileList),
        { initialProps: { fileList: files } }
      );

      act(() => {
        result.current.selectFile("/path/file2.txt");
        result.current.selectFile("/path/file3.txt", { metaKey: true });
      });

      expect(result.current.selectionCount).toBe(2);

      // 模拟 file2 被删除
      const newFiles = files.filter((f) => f.path !== "/path/file2.txt");
      rerender({ fileList: newFiles });

      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected("/path/file2.txt")).toBe(false);
      expect(result.current.isSelected("/path/file3.txt")).toBe(true);
    });
  });

  describe("向后兼容", () => {
    it("selectedPath 应该返回第一个选中的文件路径", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file3.txt");
        result.current.selectFile("/path/file1.txt", { metaKey: true });
      });

      // 应该返回文件列表顺序中第一个选中的
      expect(result.current.selectedPath).toBe("/path/file1.txt");
    });

    it("selectedFile 应该返回第一个选中的文件对象", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file2.txt");
      });

      expect(result.current.selectedFile).toEqual(files[1]);
    });

    it("selectedFiles 应该按文件列表顺序返回所有选中的文件", () => {
      const { result } = renderHook(() => useFileSelection(files));

      act(() => {
        result.current.selectFile("/path/file4.txt");
        result.current.selectFile("/path/file2.txt", { metaKey: true });
      });

      expect(result.current.selectedFiles).toHaveLength(2);
      expect(result.current.selectedFiles[0].path).toBe("/path/file2.txt");
      expect(result.current.selectedFiles[1].path).toBe("/path/file4.txt");
    });
  });
});
