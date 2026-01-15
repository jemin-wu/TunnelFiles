/**
 * 文件名验证工具
 */

export function validateFileName(name: string, originalName?: string): string | null {
  if (!name.trim()) {
    return "名称不能为空";
  }
  if (name.includes("/")) {
    return "名称不能包含 /";
  }
  if (name.includes("\0")) {
    return "名称包含非法字符";
  }
  if (name === "." || name === "..") {
    return "名称不能是 . 或 ..";
  }
  if (originalName && name.trim() === originalName) {
    return "新名称与原名称相同";
  }
  return null;
}
