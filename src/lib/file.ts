/**
 * 文件相关工具函数
 */

import { z } from "zod";
import type { FileEntry, PermissionBits } from "@/types";

/**
 * 文件类型
 */
export type FileType =
  | "folder"
  | "code"
  | "document"
  | "image"
  | "archive"
  | "audio"
  | "video"
  | "other";

/**
 * 获取文件扩展名（小写）
 */
export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

/**
 * 根据文件条目判断文件类型
 */
export function getFileType(file: FileEntry): FileType {
  if (file.isDir) return "folder";

  const ext = getFileExtension(file.name);

  // 代码文件
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "rs",
      "go",
      "java",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "rb",
      "php",
      "swift",
      "kt",
      "scala",
      "vue",
      "svelte",
      "sh",
      "bash",
      "zsh",
      "fish",
      "sql",
      "json",
      "yaml",
      "yml",
      "toml",
      "xml",
      "html",
      "css",
      "scss",
      "less",
    ].includes(ext)
  ) {
    return "code";
  }

  // 文档文件
  if (
    ["md", "txt", "doc", "docx", "pdf", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv"].includes(
      ext
    )
  ) {
    return "document";
  }

  // 图片文件
  if (
    [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "svg",
      "webp",
      "ico",
      "bmp",
      "tiff",
      "heic",
      "heif",
      "avif",
    ].includes(ext)
  ) {
    return "image";
  }

  // 压缩文件
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz", "tbz2"].includes(ext)) {
    return "archive";
  }

  // 音频文件
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)) {
    return "audio";
  }

  // 视频文件
  if (["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v"].includes(ext)) {
    return "video";
  }

  return "other";
}

/**
 * 格式化文件时间
 */
export function formatFileTime(mtime?: number): string {
  if (mtime === undefined || mtime === null) return "-";

  const date = new Date(mtime * 1000); // Unix 时间戳转毫秒
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 1 分钟内
  if (diff < 60 * 1000) {
    return "刚刚";
  }

  // 1 小时内
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} 分钟前`;
  }

  // 24 小时内
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} 小时前`;
  }

  // 超过 24 小时，显示完整日期时间
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  // 同一年则省略年份
  if (year === now.getFullYear()) {
    return `${month}-${day} ${hours}:${minutes}`;
  }

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 拼接路径
 */
export function joinPath(...segments: string[]): string {
  return (
    segments
      .filter(Boolean)
      .join("/")
      .replace(/\/+/g, "/") // 合并多个 /
      .replace(/\/$/, "") || "/" // 移除末尾 /，除非是根目录
  );
}

/**
 * 规范化路径
 */
export function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") return "/";

  const isAbsolute = trimmed.startsWith("/");
  const components: string[] = [];

  for (const part of trimmed.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (components.length > 0 && components[components.length - 1] !== "..") {
        components.pop();
      } else if (!isAbsolute) {
        components.push("..");
      }
    } else {
      components.push(part);
    }
  }

  if (isAbsolute) {
    return "/" + components.join("/");
  }
  return components.join("/") || ".";
}

/**
 * 获取父目录路径
 */
export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/" || normalized === ".") return normalized;

  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return normalized.slice(0, lastSlash);
}

/**
 * 格式化相对时间（用于展示"最近连接"等场景）
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // 1 分钟内
  if (diff < 60 * 1000) {
    return "刚刚";
  }

  // 1 小时内
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes} 分钟前`;
  }

  // 24 小时内
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours} 小时前`;
  }

  // 7 天内
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days} 天前`;
  }

  // 超过 7 天，显示日期
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

/**
 * 解析路径为层级数组
 */
export interface PathSegment {
  name: string;
  path: string;
}

export function parsePath(path: string, homePath?: string): PathSegment[] {
  const normalized = normalizePath(path);
  if (normalized === "/") {
    return [{ name: "/", path: "/" }];
  }

  const segments: PathSegment[] = [{ name: "/", path: "/" }];
  const parts = normalized.split("/").filter(Boolean);

  let currentPath = "";
  for (const part of parts) {
    currentPath += "/" + part;
    segments.push({
      name: part,
      path: currentPath,
    });
  }

  // 如果路径等于 homePath，将根目录名称改为 ~
  if (homePath && normalized === normalizePath(homePath)) {
    segments[0].name = "~";
  }

  return segments;
}

// ========== chmod 权限相关函数 ==========

/**
 * chmod 失败项 Zod Schema
 */
export const ChmodFailureSchema = z.object({
  path: z.string(),
  error: z.string(),
});

/**
 * chmod 结果 Zod Schema
 */
export const ChmodResultSchema = z.object({
  successCount: z.number(),
  failures: z.array(ChmodFailureSchema),
});

/**
 * Unix mode 转换为权限位对象
 *
 * @param mode - Unix 权限值 (0-511, 即 0o000-0o777)
 * @returns 权限位对象
 */
export function modeToPermissions(mode: number): PermissionBits {
  return {
    owner: {
      read: (mode & 0o400) !== 0,
      write: (mode & 0o200) !== 0,
      execute: (mode & 0o100) !== 0,
    },
    group: {
      read: (mode & 0o040) !== 0,
      write: (mode & 0o020) !== 0,
      execute: (mode & 0o010) !== 0,
    },
    others: {
      read: (mode & 0o004) !== 0,
      write: (mode & 0o002) !== 0,
      execute: (mode & 0o001) !== 0,
    },
  };
}

/**
 * 权限位对象转换为 Unix mode
 *
 * @param perms - 权限位对象
 * @returns Unix 权限值 (0-511)
 */
export function permissionsToMode(perms: PermissionBits): number {
  let mode = 0;
  if (perms.owner.read) mode |= 0o400;
  if (perms.owner.write) mode |= 0o200;
  if (perms.owner.execute) mode |= 0o100;
  if (perms.group.read) mode |= 0o040;
  if (perms.group.write) mode |= 0o020;
  if (perms.group.execute) mode |= 0o010;
  if (perms.others.read) mode |= 0o004;
  if (perms.others.write) mode |= 0o002;
  if (perms.others.execute) mode |= 0o001;
  return mode;
}

/**
 * 格式化八进制权限显示
 *
 * @param mode - Unix 权限值
 * @returns 三位八进制字符串 (如 "755")
 */
export function formatOctalMode(mode: number): string {
  return mode.toString(8).padStart(3, "0");
}
