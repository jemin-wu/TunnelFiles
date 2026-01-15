/**
 * 认证方式
 */
export type AuthType = "password" | "key";

/**
 * 连接配置
 */
export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  /** 密码引用 (指向系统安全存储的 key) */
  passwordRef?: string;
  /** 私钥路径 */
  privateKeyPath?: string;
  /** passphrase 引用 */
  passphraseRef?: string;
  /** 初始远程路径 */
  initialPath?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 创建/更新连接配置的输入
 */
export interface ProfileInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  /** 密码 (仅用于输入，不会存储在 Profile 中) */
  password?: string;
  /** 是否记住密码 */
  rememberPassword?: boolean;
  /** 私钥路径 */
  privateKeyPath?: string;
  /** passphrase (仅用于输入) */
  passphrase?: string;
  /** 是否记住 passphrase */
  rememberPassphrase?: boolean;
  /** 初始远程路径 */
  initialPath?: string;
}

/**
 * 最近连接记录
 */
export interface RecentConnection {
  id: string;
  profileId: string;
  profileName: string;
  host: string;
  username: string;
  connectedAt: number;
}
