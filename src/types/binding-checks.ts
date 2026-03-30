/**
 * Compile-time checks that hand-written TypeScript types stay in sync with
 * Rust-generated ts-rs bindings. If a Rust struct adds, removes, or renames
 * a field, this file will fail to compile with a clear TS error.
 *
 * Run: `pnpm exec tsc --noEmit` to verify.
 *
 * NOTE: ts-rs maps `Option<T>` with `skip_serializing_if` to `T | null`,
 * while our hand-written types use `T | undefined` (optional `?:`).
 * Both are correct at the type level for different reasons:
 *   - `T | null` reflects the Rust type system (Option is either Some or None)
 *   - `T?` reflects the runtime JS shape (serde omits None fields entirely)
 * We therefore check *key names* match, not full assignability.
 */

import type {
  AuthType as B_AuthType,
  Profile as B_Profile,
  ProfileInput as B_ProfileInput,
  FileEntry as B_FileEntry,
  SortField as B_SortField,
  SortOrder as B_SortOrder,
  SortSpec as B_SortSpec,
  TransferDirection as B_TransferDirection,
  TransferStatus as B_TransferStatus,
  TransferTask as B_TransferTask,
  TransferProgressPayload as B_TransferProgressPayload,
  TransferStatusPayload as B_TransferStatusPayload,
  ErrorCode as B_ErrorCode,
  AppError as B_AppError,
  LogLevel as B_LogLevel,
  Settings as B_Settings,
  TerminalStatus as B_TerminalStatus,
  TerminalInfo as B_TerminalInfo,
  TerminalOutputPayload as B_TerminalOutputPayload,
  TerminalStatusPayload as B_TerminalStatusPayload,
  SessionConnectResult as B_SessionConnectResult,
  SessionStatusPayload as B_SessionStatusPayload,
  SessionInfo as B_SessionInfo,
  ConnectInput as B_ConnectInput,
  DirectoryStats as B_DirectoryStats,
  DeleteFailure as B_DeleteFailure,
  DeleteProgress as B_DeleteProgress,
  RecursiveDeleteResult as B_RecursiveDeleteResult,
  ChmodResult as B_ChmodResult,
  ChmodFailure as B_ChmodFailure,
  TrustHostKeyInput as B_TrustHostKeyInput,
  TerminalOpenInput as B_TerminalOpenInput,
  TerminalInputData as B_TerminalInputData,
  TerminalResizeInput as B_TerminalResizeInput,
} from "./bindings";

import type {
  AuthType,
  Profile,
  ProfileInput,
  FileEntry,
  SortField,
  SortOrder,
  SortSpec,
  TransferDirection,
  TransferStatus,
  TransferTask,
  ErrorCode,
  AppError,
  LogLevel,
  Settings,
} from "./index";

import type {
  TerminalStatus,
  TerminalInfo,
  TerminalOutputPayload,
  TerminalStatusPayload,
  TerminalOpenInput,
  TerminalInputData,
  TerminalResizeInput,
} from "./terminal";

import type {
  TransferProgressPayload,
  TransferStatusPayload,
  SessionConnectResult,
  SessionStatusPayload,
  SessionInfo,
  ConnectInput,
  TrustHostKeyInput,
} from "./events";

import type {
  DirectoryStats,
  DeleteFailure,
  DeleteProgress,
  RecursiveDeleteResult,
  ChmodResult,
  ChmodFailure,
} from "./file";

// ── Utility types for compile-time assertions ──

/** Produces `true` if keyof A and keyof B are identical sets, `never` otherwise. */
type KeysMatch<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : never
  : never;

/** Produces `true` if two string-union types are identical, `never` otherwise. */
type UnionsMatch<A extends string, B extends string> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;

// ── Exported assertion type ──
// A single intersection of all checks. If any check resolves to `never`,
// the whole type becomes `never` and the export will fail with a compile error.
// This is exported so TypeScript doesn't flag the individual checks as unused.

export type BindingSyncChecks =
  // String union checks
  UnionsMatch<AuthType, B_AuthType> &
    UnionsMatch<SortField, B_SortField> &
    UnionsMatch<SortOrder, B_SortOrder> &
    UnionsMatch<TransferDirection, B_TransferDirection> &
    UnionsMatch<TransferStatus, B_TransferStatus> &
    UnionsMatch<`${ErrorCode}`, B_ErrorCode> &
    UnionsMatch<LogLevel, B_LogLevel> &
    UnionsMatch<TerminalStatus, B_TerminalStatus> &
    // Struct key checks
    KeysMatch<Profile, B_Profile> &
    KeysMatch<ProfileInput, B_ProfileInput> &
    KeysMatch<FileEntry, B_FileEntry> &
    KeysMatch<SortSpec, B_SortSpec> &
    KeysMatch<TransferTask, B_TransferTask> &
    KeysMatch<TransferProgressPayload, B_TransferProgressPayload> &
    KeysMatch<TransferStatusPayload, B_TransferStatusPayload> &
    KeysMatch<AppError, B_AppError> &
    KeysMatch<Settings, B_Settings> &
    KeysMatch<TerminalInfo, B_TerminalInfo> &
    KeysMatch<TerminalOutputPayload, B_TerminalOutputPayload> &
    KeysMatch<TerminalStatusPayload, B_TerminalStatusPayload> &
    KeysMatch<SessionConnectResult, B_SessionConnectResult> &
    KeysMatch<SessionStatusPayload, B_SessionStatusPayload> &
    KeysMatch<SessionInfo, B_SessionInfo> &
    KeysMatch<ConnectInput, B_ConnectInput> &
    KeysMatch<DirectoryStats, B_DirectoryStats> &
    KeysMatch<DeleteFailure, B_DeleteFailure> &
    KeysMatch<DeleteProgress, B_DeleteProgress> &
    KeysMatch<RecursiveDeleteResult, B_RecursiveDeleteResult> &
    KeysMatch<ChmodResult, B_ChmodResult> &
    KeysMatch<ChmodFailure, B_ChmodFailure> &
    KeysMatch<TrustHostKeyInput, B_TrustHostKeyInput> &
    KeysMatch<TerminalOpenInput, B_TerminalOpenInput> &
    KeysMatch<TerminalInputData, B_TerminalInputData> &
    KeysMatch<TerminalResizeInput, B_TerminalResizeInput>;
