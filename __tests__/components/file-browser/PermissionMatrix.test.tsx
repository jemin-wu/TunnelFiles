/**
 * PermissionMatrix 组件测试
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionMatrix } from "@/components/file-browser/PermissionMatrix";

describe("PermissionMatrix", () => {
  const defaultPerms = {
    owner: { read: true, write: true, execute: true },
    group: { read: true, write: false, execute: true },
    others: { read: true, write: false, execute: true },
  };

  it("should render 3x3 checkbox matrix", () => {
    render(<PermissionMatrix permissions={defaultPerms} onChange={vi.fn()} />);

    // 检查行标签
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Group")).toBeInTheDocument();
    expect(screen.getByText("Others")).toBeInTheDocument();

    // 检查列标签
    expect(screen.getByText("R")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();

    // 9 个复选框
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(9);
  });

  it("should display current permissions correctly", () => {
    render(<PermissionMatrix permissions={defaultPerms} onChange={vi.fn()} />);

    const checkboxes = screen.getAllByRole("checkbox");

    // Owner: rwx (all checked)
    expect(checkboxes[0]).toBeChecked(); // owner read
    expect(checkboxes[1]).toBeChecked(); // owner write
    expect(checkboxes[2]).toBeChecked(); // owner execute

    // Group: r-x
    expect(checkboxes[3]).toBeChecked(); // group read
    expect(checkboxes[4]).not.toBeChecked(); // group write
    expect(checkboxes[5]).toBeChecked(); // group execute

    // Others: r-x
    expect(checkboxes[6]).toBeChecked(); // others read
    expect(checkboxes[7]).not.toBeChecked(); // others write
    expect(checkboxes[8]).toBeChecked(); // others execute
  });

  it("should call onChange when checkbox is clicked", () => {
    const onChange = vi.fn();
    render(<PermissionMatrix permissions={defaultPerms} onChange={onChange} />);

    const checkboxes = screen.getAllByRole("checkbox");

    // 点击 group write 复选框 (当前未选中)
    fireEvent.click(checkboxes[4]);

    expect(onChange).toHaveBeenCalledWith({
      owner: { read: true, write: true, execute: true },
      group: { read: true, write: true, execute: true }, // write changed to true
      others: { read: true, write: false, execute: true },
    });
  });

  it("should display octal mode", () => {
    render(<PermissionMatrix permissions={defaultPerms} onChange={vi.fn()} />);

    // 755 = rwxr-xr-x
    expect(screen.getByText("755")).toBeInTheDocument();
  });

  it("should be disabled when disabled prop is true", () => {
    render(<PermissionMatrix permissions={defaultPerms} onChange={vi.fn()} disabled />);

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled();
    });
  });
});
