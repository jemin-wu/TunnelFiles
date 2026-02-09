import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "@/components/file-browser/StatusBar";

describe("StatusBar", () => {
  describe("文件计数显示", () => {
    it("应该显示文件总数", () => {
      render(<StatusBar totalCount={42} selectionCount={0} />);

      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("items")).toBeInTheDocument();
    });

    it("应该显示 0 个文件", () => {
      render(<StatusBar totalCount={0} selectionCount={0} />);

      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("选中计数显示", () => {
    it("没有选中时不应该显示选中计数", () => {
      render(<StatusBar totalCount={10} selectionCount={0} />);

      expect(screen.queryByText("selected")).not.toBeInTheDocument();
    });

    it("有选中时应该显示选中计数", () => {
      render(<StatusBar totalCount={10} selectionCount={3} />);

      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("selected")).toBeInTheDocument();
    });

    it("选中 1 个文件时应该显示 1 selected", () => {
      render(<StatusBar totalCount={10} selectionCount={1} />);

      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("selected")).toBeInTheDocument();
    });
  });

  describe("隐藏文件状态", () => {
    it("showHidden 为 false 时不显示 Hidden files 标签", () => {
      render(<StatusBar totalCount={10} selectionCount={0} showHidden={false} />);

      expect(screen.queryByText("Hidden files")).not.toBeInTheDocument();
    });

    it("showHidden 为 true 时显示 Hidden files 标签", () => {
      render(<StatusBar totalCount={10} selectionCount={0} showHidden={true} />);

      expect(screen.getByText("Hidden files")).toBeInTheDocument();
    });
  });

  describe("SFTP 标签", () => {
    it("应该始终显示 SFTP 标签", () => {
      render(<StatusBar totalCount={10} selectionCount={0} />);

      expect(screen.getByText("SFTP")).toBeInTheDocument();
    });
  });

  describe("样式和布局", () => {
    it("应该接受自定义 className", () => {
      const { container } = render(
        <StatusBar totalCount={10} selectionCount={0} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });
});
