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
}

/**
 * 设置更新补丁
 */
export type SettingsPatch = Partial<Settings>;

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: Settings = {
  defaultDownloadDir: undefined,
  maxConcurrentTransfers: 3,
  connectionTimeoutSecs: 30,
  transferRetryCount: 2,
  logLevel: "info",
  terminalFontSize: 14,
  terminalScrollbackLines: 5000,
};
