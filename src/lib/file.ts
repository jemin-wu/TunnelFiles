/** File utility functions */

import { z } from "zod";
import type { FileEntry, PermissionBits } from "@/types";

/** File type classification */
export type FileType =
  | "folder"
  | "code"
  | "document"
  | "image"
  | "archive"
  | "audio"
  | "video"
  | "other";

/** Get file extension (lowercase) */
export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return name.slice(lastDot + 1).toLowerCase();
}

/** Determine file type from file entry */
export function getFileType(file: FileEntry): FileType {
  if (file.isDir) return "folder";

  const ext = getFileExtension(file.name);

  // Code files
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

  // Document files
  if (
    ["md", "txt", "doc", "docx", "pdf", "rtf", "odt", "xls", "xlsx", "ppt", "pptx", "csv"].includes(
      ext
    )
  ) {
    return "document";
  }

  // Image files
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

  // Archive files
  if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz", "tbz2"].includes(ext)) {
    return "archive";
  }

  // Audio files
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"].includes(ext)) {
    return "audio";
  }

  // Video files
  if (["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v"].includes(ext)) {
    return "video";
  }

  return "other";
}

/** Format file modification time as relative or absolute */
export function formatFileTime(mtime?: number): string {
  if (mtime === undefined || mtime === null) return "-";

  const date = new Date(mtime * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Under 1 minute
  if (diff < 60 * 1000) {
    return "Just now";
  }

  // Under 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }

  // Under 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Over 24 hours: show full date
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  // Omit year if same as current
  if (year === now.getFullYear()) {
    return `${month}-${day} ${hours}:${minutes}`;
  }

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/** Join path segments */
export function joinPath(...segments: string[]): string {
  return segments.filter(Boolean).join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/** Normalize path (resolve . and ..) */
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

/** Get parent directory path */
export function getParentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === "/" || normalized === ".") return normalized;

  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return normalized.slice(0, lastSlash);
}

/** Format relative time (e.g. "5m ago", "3d ago") */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // Under 1 minute
  if (diff < 60 * 1000) {
    return "Just now";
  }

  // Under 1 hour
  if (diff < 60 * 60 * 1000) {
    const minutes = Math.floor(diff / (60 * 1000));
    return `${minutes}m ago`;
  }

  // Under 24 hours
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diff / (60 * 60 * 1000));
    return `${hours}h ago`;
  }

  // Under 7 days
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    return `${days}d ago`;
  }

  // Over 7 days: show date
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

/** Parse path into hierarchical segments */
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

  // If path starts with homePath, collapse home segments into ~
  if (homePath) {
    const normalizedHome = normalizePath(homePath);
    if (normalized === normalizedHome || normalized.startsWith(normalizedHome + "/")) {
      const homeParts = normalizedHome.split("/").filter(Boolean);
      // Replace root + home path segments with a single "~" segment
      const homeSegment: PathSegment = { name: "~", path: normalizedHome };
      const remaining = segments.slice(homeParts.length + 1);
      return [homeSegment, ...remaining];
    }
  }

  return segments;
}

// ========== chmod permission functions ==========

/** Chmod failure item schema */
export const ChmodFailureSchema = z.object({
  path: z.string(),
  error: z.string(),
});

/** Chmod result schema */
export const ChmodResultSchema = z.object({
  successCount: z.number(),
  failures: z.array(ChmodFailureSchema),
});

/** Convert Unix mode to permission bits object */
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

/** Convert permission bits object to Unix mode */
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

/** Format mode as 3-digit octal string (e.g. "755") */
export function formatOctalMode(mode: number): string {
  return mode.toString(8).padStart(3, "0");
}
