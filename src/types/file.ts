/**
 * 文件条目
 */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  /** 修改时间 (Unix 时间戳，秒) */
  mtime?: number;
  /** 文件权限 (Unix mode) */
  mode?: number;
}

/**
 * 排序字段
 */
export type SortField = "name" | "size" | "mtime";

/**
 * 排序顺序
 */
export type SortOrder = "asc" | "desc";

/**
 * 排序规格
 */
export interface SortSpec {
  field: SortField;
  order: SortOrder;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

/**
 * 格式化文件权限
 */
export function formatFileMode(mode?: number): string {
  if (mode === undefined) return "-";

  const permissions = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  const owner = (mode >> 6) & 7;
  const group = (mode >> 3) & 7;
  const other = mode & 7;

  return permissions[owner] + permissions[group] + permissions[other];
}

// ========== chmod 相关类型 ==========

/**
 * chmod 失败项
 */
export interface ChmodFailure {
  path: string;
  error: string;
}

/**
 * chmod 结果
 */
export interface ChmodResult {
  successCount: number;
  failures: ChmodFailure[];
}

/**
 * 单个角色的权限位
 */
export interface RolePermission {
  read: boolean;
  write: boolean;
  execute: boolean;
}

/**
 * 完整权限位 (Owner/Group/Others)
 */
export interface PermissionBits {
  owner: RolePermission;
  group: RolePermission;
  others: RolePermission;
}

// ========== 递归删除相关类型 ==========

/**
 * 目录统计信息（用于删除确认对话框）
 */
export interface DirectoryStats {
  /** 文件总数 */
  fileCount: number;
  /** 目录总数（不含自身） */
  dirCount: number;
  /** 总大小（字节） */
  totalSize: number;
}

/**
 * 删除失败项
 */
export interface DeleteFailure {
  path: string;
  error: string;
}

/**
 * 递归删除结果
 */
export interface RecursiveDeleteResult {
  /** 成功删除的文件数 */
  deletedFiles: number;
  /** 成功删除的目录数 */
  deletedDirs: number;
  /** 删除失败的项 */
  failures: DeleteFailure[];
}

/**
 * 删除进度事件
 */
export interface DeleteProgress {
  /** 删除任务路径 */
  path: string;
  /** 已删除的文件/目录数 */
  deletedCount: number;
  /** 总文件/目录数 */
  totalCount: number;
  /** 当前正在删除的路径 */
  currentPath: string;
}
