/**
 * 日志级别
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * 应用设置
 */
export interface Settings {
  /** 默认下载目录 */
  defaultDownloadDir?: string;
  /** 最大并发传输数 (1-6) */
  maxConcurrentTransfers: number;
  /** 连接超时时间 (秒) */
  connectionTimeoutSecs: number;
  /** 传输失败重试次数 */
  transferRetryCount: number;
  /** 日志级别 */
  logLevel: LogLevel;
  /** 终端字体大小 (10-24px) */
  terminalFontSize: number;
  /** 终端 scrollback 行数 (1000-50000) */
  terminalScrollbackLines: number;
  /** 终端跟随文件浏览器目录 */
  terminalFollowDirectory: boolean;
  /** AI Shell Copilot 启用开关（默认 false，off-by-default） */
  aiEnabled: boolean;
  /** AI 模型名（默认 "gemma4:e4b"） */
  aiModelName: string;
  /** AI 并发独立只读 probe session 上限（1-10，默认 3） */
  maxConcurrentAiProbes: number;
  /** AI 单次生成输出 token 上限（256-4096，DoS 防线） */
  aiOutputTokenCap: number;
}

/**
 * 设置更新补丁
 */
export type SettingsPatch = Partial<Settings>;

/** 终端字体大小边界 */
export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 24;
export const TERMINAL_FONT_SIZE_DEFAULT = 14;

/** 终端 scrollback 边界 */
export const TERMINAL_SCROLLBACK_MIN = 1000;
export const TERMINAL_SCROLLBACK_MAX = 50000;
export const TERMINAL_SCROLLBACK_DEFAULT = 5000;

/** AI 并发 probe 上限边界 */
export const AI_MAX_CONCURRENT_PROBES_MIN = 1;
export const AI_MAX_CONCURRENT_PROBES_MAX = 10;
export const AI_MAX_CONCURRENT_PROBES_DEFAULT = 3;

/** AI 输出 token hard cap 边界 */
export const AI_OUTPUT_TOKEN_CAP_MIN = 256;
export const AI_OUTPUT_TOKEN_CAP_MAX = 4096;
export const AI_OUTPUT_TOKEN_CAP_DEFAULT = 4096;

/** AI 默认模型名 */
export const AI_MODEL_NAME_DEFAULT = "gemma4:e4b";

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: Settings = {
  defaultDownloadDir: undefined,
  maxConcurrentTransfers: 3,
  connectionTimeoutSecs: 30,
  transferRetryCount: 2,
  logLevel: "info",
  terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
  terminalScrollbackLines: TERMINAL_SCROLLBACK_DEFAULT,
  terminalFollowDirectory: true,
  aiEnabled: false,
  aiModelName: AI_MODEL_NAME_DEFAULT,
  maxConcurrentAiProbes: AI_MAX_CONCURRENT_PROBES_DEFAULT,
  aiOutputTokenCap: AI_OUTPUT_TOKEN_CAP_DEFAULT,
};
