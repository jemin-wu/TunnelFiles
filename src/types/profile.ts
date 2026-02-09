/** Authentication method */
export type AuthType = "password" | "key";

/** Connection profile */
export interface Profile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  /** Password reference (keychain key) */
  passwordRef?: string;
  /** Private key path */
  privateKeyPath?: string;
  /** Passphrase reference (keychain key) */
  passphraseRef?: string;
  /** Initial remote path */
  initialPath?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/** Input for creating/updating a connection profile */
export interface ProfileInput {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  /** Password (input only, not stored in Profile) */
  password?: string;
  /** Whether to save password to keychain */
  rememberPassword?: boolean;
  /** Private key path */
  privateKeyPath?: string;
  /** Passphrase (input only) */
  passphrase?: string;
  /** Whether to save passphrase to keychain */
  rememberPassphrase?: boolean;
  /** Initial remote path */
  initialPath?: string;
}
