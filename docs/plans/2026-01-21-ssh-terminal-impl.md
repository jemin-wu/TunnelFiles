# SSH 终端功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 TunnelFiles 添加完整的交互式 SSH 终端功能，支持 vim/top/tmux 等程序。

**Architecture:** 在现有 SessionManager 基础上新增 TerminalManager 服务管理 PTY channel。后端通过独立线程读取终端输出并推送事件，前端使用 xterm.js 渲染。每个 SSH 会话限制一个终端实例，按需创建。

**Tech Stack:** Rust ssh2 (PTY)、@xterm/xterm、@xterm/addon-fit、Tauri IPC events

---

## Task 1: 安装前端依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 xterm.js 依赖**

Run:
```bash
pnpm add @xterm/xterm @xterm/addon-fit
```

**Step 2: 验证安装**

Run:
```bash
pnpm list @xterm/xterm @xterm/addon-fit
```

Expected: 显示已安装的版本

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add xterm.js dependencies"
```

---

## Task 2: 添加前端类型定义

**Files:**
- Create: `src/types/terminal.ts`
- Modify: `src/types/events.ts`

**Step 1: 创建终端类型定义**

Create `src/types/terminal.ts`:

```typescript
/**
 * 终端相关类型定义
 */

/** 终端状态 */
export type TerminalStatus = "connected" | "disconnected" | "error";

/** 终端信息 */
export interface TerminalInfo {
  terminalId: string;
  sessionId: string;
}

/** 终端输出事件 payload */
export interface TerminalOutputPayload {
  terminalId: string;
  /** Base64 编码的输出数据 */
  data: string;
}

/** 终端状态事件 payload */
export interface TerminalStatusPayload {
  terminalId: string;
  status: TerminalStatus;
  message?: string;
}

/** 打开终端输入 */
export interface TerminalOpenInput {
  sessionId: string;
  cols?: number;
  rows?: number;
}

/** 终端输入数据 */
export interface TerminalInputData {
  terminalId: string;
  /** Base64 编码的输入数据 */
  data: string;
}

/** 终端尺寸调整输入 */
export interface TerminalResizeInput {
  terminalId: string;
  cols: number;
  rows: number;
}
```

**Step 2: 在 events.ts 添加终端事件常量**

在 `src/types/events.ts` 的 `EVENTS` 对象中添加：

```typescript
export const EVENTS = {
  TRANSFER_PROGRESS: "transfer:progress",
  TRANSFER_STATUS: "transfer:status",
  SESSION_STATUS: "session:status",
  SECURITY_HOSTKEY: "security:hostkey",
  // 新增终端事件
  TERMINAL_OUTPUT: "terminal:output",
  TERMINAL_STATUS: "terminal:status",
} as const;
```

**Step 3: Commit**

```bash
git add src/types/terminal.ts src/types/events.ts
git commit -m "feat(types): add terminal type definitions"
```

---

## Task 3: 添加前端 API 封装

**Files:**
- Create: `src/lib/terminal.ts`

**Step 1: 创建终端 API 封装**

Create `src/lib/terminal.ts`:

```typescript
/**
 * 终端 IPC 调用封装
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  TerminalInfo,
  TerminalOpenInput,
  TerminalInputData,
  TerminalResizeInput,
} from "@/types/terminal";

/** 打开终端 */
export async function openTerminal(input: TerminalOpenInput): Promise<TerminalInfo> {
  return invoke("terminal_open", { input });
}

/** 写入终端输入 */
export async function writeTerminalInput(input: TerminalInputData): Promise<void> {
  return invoke("terminal_input", { input });
}

/** 调整终端尺寸 */
export async function resizeTerminal(input: TerminalResizeInput): Promise<void> {
  return invoke("terminal_resize", { input });
}

/** 关闭终端 */
export async function closeTerminal(terminalId: string): Promise<void> {
  return invoke("terminal_close", { terminalId });
}

/** 通过 sessionId 获取终端 ID */
export async function getTerminalBySession(sessionId: string): Promise<string | null> {
  return invoke("terminal_get_by_session", { sessionId });
}

/** Base64 编码（用于发送输入） */
export function encodeTerminalData(data: string): string {
  return btoa(data);
}

/** Base64 解码（用于接收输出） */
export function decodeTerminalData(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```

**Step 2: Commit**

```bash
git add src/lib/terminal.ts
git commit -m "feat(lib): add terminal API wrapper"
```

---

## Task 4: 后端 - 创建终端数据模型

**Files:**
- Create: `src-tauri/src/models/terminal.rs`
- Modify: `src-tauri/src/models/mod.rs`

**Step 1: 创建终端数据模型**

Create `src-tauri/src/models/terminal.rs`:

```rust
//! 终端相关数据模型

use serde::{Deserialize, Serialize};

/// 终端状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TerminalStatus {
    Connected,
    Disconnected,
    Error,
}

/// 终端信息（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub terminal_id: String,
    pub session_id: String,
}

/// 终端输出事件 payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub terminal_id: String,
    /// Base64 编码的输出数据
    pub data: String,
}

/// 终端状态事件 payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatusPayload {
    pub terminal_id: String,
    pub status: TerminalStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
```

**Step 2: 在 mod.rs 中导出**

在 `src-tauri/src/models/mod.rs` 添加：

```rust
pub mod terminal;
```

**Step 3: 验证编译**

Run:
```bash
cd src-tauri && cargo check
```

Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/models/terminal.rs src-tauri/src/models/mod.rs
git commit -m "feat(models): add terminal data models"
```

---

## Task 5: 后端 - 创建 TerminalManager 服务

**Files:**
- Create: `src-tauri/src/services/terminal_manager.rs`
- Modify: `src-tauri/src/services/mod.rs`

**Step 1: 创建 TerminalManager 服务**

Create `src-tauri/src/services/terminal_manager.rs`:

```rust
//! 终端管理器
//!
//! 负责:
//! - PTY 终端的创建、维护、关闭
//! - 终端输出的异步读取和事件推送
//! - 终端输入的写入

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::Instant;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ssh2::Channel;
use tauri::{AppHandle, Emitter};

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::terminal::{TerminalInfo, TerminalOutputPayload, TerminalStatus, TerminalStatusPayload};
use crate::services::session_manager::{ManagedSession, SessionManager};

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const PTY_READ_BUFFER_SIZE: usize = 8192;
const OUTPUT_THROTTLE_MS: u64 = 50;
const OUTPUT_BUFFER_LIMIT: usize = 4096;

/// 托管的终端实例
pub struct ManagedTerminal {
    pub terminal_id: String,
    pub session_id: String,
    pub channel: Arc<RwLock<Channel>>,
    pub cols: u16,
    pub rows: u16,
    pub created_at: Instant,
    pub last_activity: RwLock<Instant>,
}

impl ManagedTerminal {
    pub fn touch(&self) {
        if let Ok(mut last) = self.last_activity.write() {
            *last = Instant::now();
        }
    }
}

/// 终端管理器
pub struct TerminalManager {
    terminals: RwLock<HashMap<String, Arc<ManagedTerminal>>>,
    session_to_terminal: RwLock<HashMap<String, String>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: RwLock::new(HashMap::new()),
            session_to_terminal: RwLock::new(HashMap::new()),
        }
    }

    /// 打开终端（如果已存在则返回现有实例）
    pub fn open(
        &self,
        app: AppHandle,
        session_manager: Arc<SessionManager>,
        session_id: &str,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> AppResult<TerminalInfo> {
        // 检查是否已有终端
        {
            let mapping = self.session_to_terminal.read().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端映射锁")
            })?;
            if let Some(terminal_id) = mapping.get(session_id) {
                tracing::info!(
                    session_id = %session_id,
                    terminal_id = %terminal_id,
                    "终端已存在，返回现有实例"
                );
                return Ok(TerminalInfo {
                    terminal_id: terminal_id.clone(),
                    session_id: session_id.to_string(),
                });
            }
        }

        // 获取会话
        let session = session_manager.get_session(session_id)?;

        // 创建 PTY
        let cols = cols.unwrap_or(DEFAULT_COLS);
        let rows = rows.unwrap_or(DEFAULT_ROWS);
        let channel = Self::create_pty_channel(&session, cols, rows)?;

        let terminal_id = uuid::Uuid::new_v4().to_string();
        let managed_terminal = Arc::new(ManagedTerminal {
            terminal_id: terminal_id.clone(),
            session_id: session_id.to_string(),
            channel: Arc::new(RwLock::new(channel)),
            cols,
            rows,
            created_at: Instant::now(),
            last_activity: RwLock::new(Instant::now()),
        });

        // 存储终端
        {
            let mut terminals = self.terminals.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端池锁")
            })?;
            terminals.insert(terminal_id.clone(), managed_terminal.clone());
        }
        {
            let mut mapping = self.session_to_terminal.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端映射锁")
            })?;
            mapping.insert(session_id.to_string(), terminal_id.clone());
        }

        // 启动输出读取线程
        self.start_output_reader(app, managed_terminal.clone());

        tracing::info!(
            session_id = %session_id,
            terminal_id = %terminal_id,
            cols = cols,
            rows = rows,
            "PTY 终端已创建"
        );

        Ok(TerminalInfo {
            terminal_id,
            session_id: session_id.to_string(),
        })
    }

    /// 创建 PTY Channel
    fn create_pty_channel(session: &ManagedSession, cols: u16, rows: u16) -> AppResult<Channel> {
        let mut channel = session.session.channel_session().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("无法创建 channel: {}", e))
        })?;

        // 请求 PTY (xterm-256color 支持全彩色)
        channel
            .request_pty("xterm-256color", None, Some((cols as u32, rows as u32, 0, 0)))
            .map_err(|e| {
                AppError::new(ErrorCode::RemoteIoError, format!("请求 PTY 失败: {}", e))
            })?;

        // 启动 shell
        channel.shell().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("启动 shell 失败: {}", e))
        })?;

        Ok(channel)
    }

    /// 启动输出读取线程
    fn start_output_reader(&self, app: AppHandle, terminal: Arc<ManagedTerminal>) {
        thread::spawn(move || {
            let mut buffer = vec![0u8; PTY_READ_BUFFER_SIZE];
            let mut last_emit = Instant::now();
            let mut accumulated_data = Vec::new();

            loop {
                let bytes_read = {
                    let mut channel = match terminal.channel.write() {
                        Ok(c) => c,
                        Err(_) => break,
                    };

                    // 设置非阻塞模式
                    channel.set_blocking(false);

                    match channel.read(&mut buffer) {
                        Ok(0) => {
                            // EOF - 检查是否真的关闭了
                            if channel.eof() {
                                break;
                            }
                            // 短暂休眠避免 CPU 空转
                            drop(channel);
                            thread::sleep(std::time::Duration::from_millis(10));
                            continue;
                        }
                        Ok(n) => n,
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            // 无数据可读，发送累积的数据
                            drop(channel);
                            if !accumulated_data.is_empty() {
                                let data_base64 = BASE64.encode(&accumulated_data);
                                let payload = TerminalOutputPayload {
                                    terminal_id: terminal.terminal_id.clone(),
                                    data: data_base64,
                                };
                                app.emit("terminal:output", &payload).ok();
                                accumulated_data.clear();
                                last_emit = Instant::now();
                            }
                            thread::sleep(std::time::Duration::from_millis(10));
                            continue;
                        }
                        Err(e) => {
                            tracing::error!(
                                terminal_id = %terminal.terminal_id,
                                error = %e,
                                "读取终端输出失败"
                            );
                            break;
                        }
                    }
                };

                // 累积数据
                accumulated_data.extend_from_slice(&buffer[..bytes_read]);

                // 节流：每 50ms 发送一次或数据量超过 4KB
                let should_emit = last_emit.elapsed().as_millis() as u64 >= OUTPUT_THROTTLE_MS
                    || accumulated_data.len() >= OUTPUT_BUFFER_LIMIT;

                if should_emit && !accumulated_data.is_empty() {
                    let data_base64 = BASE64.encode(&accumulated_data);
                    let payload = TerminalOutputPayload {
                        terminal_id: terminal.terminal_id.clone(),
                        data: data_base64,
                    };

                    app.emit("terminal:output", &payload).ok();
                    accumulated_data.clear();
                    last_emit = Instant::now();
                }

                terminal.touch();
            }

            // 终端关闭
            let payload = TerminalStatusPayload {
                terminal_id: terminal.terminal_id.clone(),
                status: TerminalStatus::Disconnected,
                message: Some("终端已关闭".to_string()),
            };
            app.emit("terminal:status", &payload).ok();

            tracing::info!(
                terminal_id = %terminal.terminal_id,
                "终端输出读取线程已退出"
            );
        });
    }

    /// 写入输入数据
    pub fn write_input(&self, terminal_id: &str, data: &[u8]) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        let mut channel = terminal.channel.write().map_err(|_| {
            AppError::new(ErrorCode::Unknown, "无法获取 channel 锁")
        })?;

        channel.write_all(data).map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("写入失败: {}", e))
        })?;

        terminal.touch();
        Ok(())
    }

    /// 调整终端尺寸
    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        let channel = terminal.channel.write().map_err(|_| {
            AppError::new(ErrorCode::Unknown, "无法获取 channel 锁")
        })?;

        channel.request_pty_size(cols as u32, rows as u32, None, None).map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("调整尺寸失败: {}", e))
        })?;

        tracing::debug!(
            terminal_id = %terminal_id,
            cols = cols,
            rows = rows,
            "终端尺寸已调整"
        );

        Ok(())
    }

    /// 关闭终端
    pub fn close(&self, terminal_id: &str) -> AppResult<()> {
        let terminal = {
            let mut terminals = self.terminals.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端池锁")
            })?;
            terminals.remove(terminal_id)
        };

        if let Some(term) = terminal {
            // 移除 session 映射
            let mut mapping = self.session_to_terminal.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端映射锁")
            })?;
            mapping.remove(&term.session_id);

            // 关闭 channel
            if let Ok(mut channel) = term.channel.write() {
                channel.close().ok();
                channel.wait_close().ok();
            }

            tracing::info!(
                terminal_id = %terminal_id,
                session_id = %term.session_id,
                "终端已关闭"
            );
        }

        Ok(())
    }

    /// 通过 sessionId 获取终端 ID
    pub fn get_terminal_by_session(&self, session_id: &str) -> Option<String> {
        self.session_to_terminal
            .read()
            .ok()?
            .get(session_id)
            .cloned()
    }

    /// 关闭指定会话的所有终端
    pub fn close_by_session(&self, session_id: &str) -> AppResult<()> {
        if let Some(terminal_id) = self.get_terminal_by_session(session_id) {
            self.close(&terminal_id)?;
        }
        Ok(())
    }

    /// 获取终端
    fn get_terminal(&self, terminal_id: &str) -> AppResult<Arc<ManagedTerminal>> {
        let terminals = self.terminals.read().map_err(|_| {
            AppError::new(ErrorCode::Unknown, "无法获取终端池锁")
        })?;

        terminals
            .get(terminal_id)
            .cloned()
            .ok_or_else(|| AppError::not_found(format!("终端不存在: {}", terminal_id)))
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

unsafe impl Send for TerminalManager {}
unsafe impl Sync for TerminalManager {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_manager_creation() {
        let manager = TerminalManager::new();
        assert!(manager.get_terminal_by_session("nonexistent").is_none());
    }

    #[test]
    fn test_close_nonexistent_terminal() {
        let manager = TerminalManager::new();
        let result = manager.close("nonexistent");
        assert!(result.is_ok());
    }
}
```

**Step 2: 在 mod.rs 中导出**

在 `src-tauri/src/services/mod.rs` 添加：

```rust
pub mod terminal_manager;
```

**Step 3: 验证编译**

Run:
```bash
cd src-tauri && cargo check
```

Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/services/terminal_manager.rs src-tauri/src/services/mod.rs
git commit -m "feat(services): add TerminalManager for PTY management"
```

---

## Task 6: 后端 - 创建终端 IPC 命令

**Files:**
- Create: `src-tauri/src/commands/terminal.rs`
- Modify: `src-tauri/src/commands/mod.rs`

**Step 1: 创建终端 IPC 命令**

Create `src-tauri/src/commands/terminal.rs`:

```rust
//! 终端 IPC 命令

use std::sync::Arc;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::models::error::{AppError, AppResult};
use crate::models::terminal::TerminalInfo;
use crate::services::session_manager::SessionManager;
use crate::services::terminal_manager::TerminalManager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpenInput {
    pub session_id: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// 打开终端
#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalOpenInput,
) -> AppResult<TerminalInfo> {
    tracing::info!(session_id = %input.session_id, "打开终端");

    terminal_manager.open(
        app,
        session_manager.inner().clone(),
        &input.session_id,
        input.cols,
        input.rows,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputData {
    pub terminal_id: String,
    pub data: String, // Base64 编码
}

/// 写入输入
#[tauri::command]
pub async fn terminal_input(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalInputData,
) -> AppResult<()> {
    let data = BASE64.decode(&input.data).map_err(|e| {
        AppError::invalid_argument(format!("Base64 解码失败: {}", e))
    })?;

    terminal_manager.write_input(&input.terminal_id, &data)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResizeInput {
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
}

/// 调整尺寸
#[tauri::command]
pub async fn terminal_resize(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    input: TerminalResizeInput,
) -> AppResult<()> {
    terminal_manager.resize(&input.terminal_id, input.cols, input.rows)
}

/// 关闭终端
#[tauri::command]
pub async fn terminal_close(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    terminal_id: String,
) -> AppResult<()> {
    tracing::info!(terminal_id = %terminal_id, "关闭终端");
    terminal_manager.close(&terminal_id)
}

/// 通过 sessionId 获取终端
#[tauri::command]
pub async fn terminal_get_by_session(
    terminal_manager: State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> AppResult<Option<String>> {
    Ok(terminal_manager.get_terminal_by_session(&session_id))
}
```

**Step 2: 在 mod.rs 中导出**

在 `src-tauri/src/commands/mod.rs` 添加：

```rust
pub mod terminal;
```

**Step 3: 验证编译**

Run:
```bash
cd src-tauri && cargo check
```

Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/commands/terminal.rs src-tauri/src/commands/mod.rs
git commit -m "feat(commands): add terminal IPC commands"
```

---

## Task 7: 后端 - 集成到 lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 导入并初始化 TerminalManager**

在 `src-tauri/src/lib.rs` 中：

1. 添加 import（在其他 services import 附近）:
```rust
use services::terminal_manager::TerminalManager;
```

2. 在 `transfer_manager` 初始化后添加:
```rust
// 5. 初始化终端管理器
let terminal_manager = Arc::new(TerminalManager::new());
```

3. 在 `.manage(transfer_manager)` 后添加:
```rust
.manage(terminal_manager)
```

4. 在 `invoke_handler` 中添加终端命令:
```rust
// Terminal 命令
commands::terminal::terminal_open,
commands::terminal::terminal_input,
commands::terminal::terminal_resize,
commands::terminal::terminal_close,
commands::terminal::terminal_get_by_session,
```

**Step 2: 验证编译**

Run:
```bash
cd src-tauri && cargo check
```

Expected: 编译成功

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: integrate TerminalManager into Tauri app"
```

---

## Task 8: 前端 - 创建事件监听 Hook

**Files:**
- Create: `src/hooks/useTerminalEvents.ts`

**Step 1: 创建事件监听 Hook**

Create `src/hooks/useTerminalEvents.ts`:

```typescript
/**
 * 终端事件监听 Hook
 * 监听后端终端输出和状态事件
 */

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { EVENTS } from "@/types/events";
import type { TerminalOutputPayload, TerminalStatusPayload } from "@/types/terminal";
import { decodeTerminalData } from "@/lib/terminal";

interface UseTerminalEventsOptions {
  terminalId: string | null;
  onOutput: (data: Uint8Array) => void;
  onStatusChange?: (status: TerminalStatusPayload) => void;
}

export function useTerminalEvents(options: UseTerminalEventsOptions): void {
  const { terminalId, onOutput, onStatusChange } = options;

  // 用 ref 保存回调，避免 useEffect 重复执行
  const callbacksRef = useRef({ onOutput, onStatusChange });
  useEffect(() => {
    callbacksRef.current = { onOutput, onStatusChange };
  }, [onOutput, onStatusChange]);

  useEffect(() => {
    if (!terminalId) return;

    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenOutput = await listen<TerminalOutputPayload>(
        EVENTS.TERMINAL_OUTPUT,
        (event) => {
          if (event.payload.terminalId === terminalId) {
            const data = decodeTerminalData(event.payload.data);
            callbacksRef.current.onOutput(data);
          }
        }
      );
      unlisteners.push(unlistenOutput);

      const unlistenStatus = await listen<TerminalStatusPayload>(
        EVENTS.TERMINAL_STATUS,
        (event) => {
          if (event.payload.terminalId === terminalId) {
            callbacksRef.current.onStatusChange?.(event.payload);
          }
        }
      );
      unlisteners.push(unlistenStatus);
    };

    setup();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [terminalId]);
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTerminalEvents.ts
git commit -m "feat(hooks): add useTerminalEvents for terminal output/status"
```

---

## Task 9: 前端 - 创建终端管理 Hook

**Files:**
- Create: `src/hooks/useTerminal.ts`

**Step 1: 创建终端管理 Hook**

Create `src/hooks/useTerminal.ts`:

```typescript
/**
 * 终端管理 Hook
 * 处理终端的打开、关闭、输入、尺寸调整
 */

import { useState, useCallback, useRef, useEffect } from "react";

import {
  openTerminal,
  closeTerminal,
  writeTerminalInput,
  resizeTerminal,
  encodeTerminalData,
} from "@/lib/terminal";
import { showErrorToast } from "@/lib/error";
import type { TerminalInfo, TerminalStatus } from "@/types/terminal";

interface UseTerminalOptions {
  sessionId: string;
  cols?: number;
  rows?: number;
}

interface UseTerminalReturn {
  terminalInfo: TerminalInfo | null;
  status: TerminalStatus;
  isOpening: boolean;
  error: unknown;
  open: () => Promise<void>;
  close: () => Promise<void>;
  writeInput: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  setStatus: (status: TerminalStatus) => void;
}

export function useTerminal(options: UseTerminalOptions): UseTerminalReturn {
  const { sessionId, cols, rows } = options;
  const [terminalInfo, setTerminalInfo] = useState<TerminalInfo | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("disconnected");
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // 用 ref 保存 terminalInfo，用于 cleanup
  const terminalInfoRef = useRef<TerminalInfo | null>(null);
  useEffect(() => {
    terminalInfoRef.current = terminalInfo;
  }, [terminalInfo]);

  const open = useCallback(async () => {
    if (terminalInfo || isOpening) {
      return; // 已打开或正在打开
    }

    setIsOpening(true);
    setError(null);

    try {
      const info = await openTerminal({ sessionId, cols, rows });
      setTerminalInfo(info);
      setStatus("connected");
    } catch (err) {
      setError(err);
      setStatus("error");
      showErrorToast(err);
    } finally {
      setIsOpening(false);
    }
  }, [sessionId, cols, rows, terminalInfo, isOpening]);

  const close = useCallback(async () => {
    if (!terminalInfo) return;

    try {
      await closeTerminal(terminalInfo.terminalId);
      setTerminalInfo(null);
      setStatus("disconnected");
    } catch (err) {
      showErrorToast(err);
    }
  }, [terminalInfo]);

  const writeInput = useCallback(
    async (data: string) => {
      if (!terminalInfo) return;

      try {
        const base64 = encodeTerminalData(data);
        await writeTerminalInput({
          terminalId: terminalInfo.terminalId,
          data: base64,
        });
      } catch (err) {
        showErrorToast(err);
      }
    },
    [terminalInfo]
  );

  const resize = useCallback(
    async (newCols: number, newRows: number) => {
      if (!terminalInfo) return;

      try {
        await resizeTerminal({
          terminalId: terminalInfo.terminalId,
          cols: newCols,
          rows: newRows,
        });
      } catch (err) {
        // 尺寸调整失败不中断使用，仅记录
        console.warn("Failed to resize terminal:", err);
      }
    },
    [terminalInfo]
  );

  // 组件卸载时关闭终端
  useEffect(() => {
    return () => {
      const info = terminalInfoRef.current;
      if (info) {
        closeTerminal(info.terminalId).catch(console.error);
      }
    };
  }, []);

  return {
    terminalInfo,
    status,
    isOpening,
    error,
    open,
    close,
    writeInput,
    resize,
    setStatus,
  };
}
```

**Step 2: Commit**

```bash
git add src/hooks/useTerminal.ts
git commit -m "feat(hooks): add useTerminal for terminal lifecycle management"
```

---

## Task 10: 前端 - 创建 XTerm 组件

**Files:**
- Create: `src/components/terminal/Terminal.tsx`
- Create: `src/components/terminal/index.ts`

**Step 1: 创建 Terminal 组件**

Create `src/components/terminal/Terminal.tsx`:

```typescript
/**
 * XTerm 终端组件
 * 封装 xterm.js，处理渲染和交互
 */

import { useEffect, useRef, useCallback, memo } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useTerminalEvents } from "@/hooks/useTerminalEvents";
import type { TerminalStatusPayload } from "@/types/terminal";

interface TerminalProps {
  terminalId: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onStatusChange?: (status: TerminalStatusPayload) => void;
}

export const Terminal = memo(function Terminal({
  terminalId,
  onInput,
  onResize,
  onStatusChange,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);

  // 处理终端输出
  const handleOutput = useCallback((data: Uint8Array) => {
    xtermRef.current?.write(data);
  }, []);

  // 监听终端事件
  useTerminalEvents({
    terminalId,
    onOutput: handleOutput,
    onStatusChange,
  });

  // 初始化 XTerm
  useEffect(() => {
    if (!containerRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(containerRef.current);

    // 延迟 fit 确保容器尺寸已确定
    requestAnimationFrame(() => {
      fitAddon.fit();
      onResize(xterm.cols, xterm.rows);
    });

    // 监听输入
    const inputDisposable = xterm.onData((data) => {
      onInput(data);
    });

    // 监听尺寸变化
    const resizeDisposable = xterm.onResize(({ cols, rows }) => {
      onResize(cols, rows);
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // 窗口尺寸变化时自动调整（防抖）
    const handleWindowResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        fitAddon.fit();
      }, 100);
    };
    window.addEventListener("resize", handleWindowResize);

    // 聚焦终端
    xterm.focus();

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      inputDisposable.dispose();
      resizeDisposable.dispose();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [onInput, onResize]);

  // terminalId 变化时清空终端内容
  useEffect(() => {
    xtermRef.current?.clear();
  }, [terminalId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        padding: "8px",
        backgroundColor: "#1e1e1e",
        boxSizing: "border-box",
      }}
    />
  );
});
```

**Step 2: 创建 index.ts 导出**

Create `src/components/terminal/index.ts`:

```typescript
export { Terminal } from "./Terminal";
```

**Step 3: Commit**

```bash
git add src/components/terminal/Terminal.tsx src/components/terminal/index.ts
git commit -m "feat(components): add Terminal component with xterm.js"
```

---

## Task 11: 验证后端编译和测试

**Step 1: 编译后端**

Run:
```bash
cd src-tauri && cargo build
```

Expected: 编译成功

**Step 2: 运行后端测试**

Run:
```bash
cd src-tauri && cargo test
```

Expected: 所有测试通过

**Step 3: Commit（如有修复）**

如果有修复，提交：
```bash
git add -A
git commit -m "fix: resolve compilation issues"
```

---

## Task 12: 验证前端编译

**Step 1: 检查 TypeScript**

Run:
```bash
pnpm tsc --noEmit
```

Expected: 无类型错误

**Step 2: 运行 lint**

Run:
```bash
pnpm lint
```

Expected: 无 lint 错误

**Step 3: Commit（如有修复）**

如果有修复，提交：
```bash
git add -A
git commit -m "fix: resolve frontend type/lint issues"
```

---

## Task 13: 集成测试 - 运行开发环境

**Step 1: 启动开发环境**

Run:
```bash
pnpm tauri dev
```

Expected: 应用启动成功

**Step 2: 手动测试**

1. 连接到一个 SSH 服务器
2. 在浏览器控制台测试终端 API：
```javascript
// 打开终端
const result = await window.__TAURI__.core.invoke('terminal_open', {
  input: { sessionId: '<your-session-id>', cols: 80, rows: 24 }
});
console.log('Terminal opened:', result);

// 写入输入
await window.__TAURI__.core.invoke('terminal_input', {
  input: { terminalId: result.terminalId, data: btoa('ls -la\n') }
});
```

3. 检查控制台是否收到 `terminal:output` 事件

**Step 3: 记录测试结果**

确认以下功能正常：
- [ ] 终端可以打开
- [ ] 可以接收输出事件
- [ ] 可以发送输入

---

## 后续任务（页面集成）

> 注意：页面布局设计由 designer agent 后续完成，以下仅为参考。

### Task 14: 页面集成（待 designer agent 设计后实施）

需要修改的文件：
- `src/pages/FileManagerPage.tsx` 或新建页面

集成要点：
1. 添加 Tab 切换（Files / Terminal）
2. 切换到 Terminal Tab 时调用 `terminal.open()`
3. 将 `Terminal` 组件与 `useTerminal` hook 连接

---

## 验收检查清单

- [ ] 后端编译无错误
- [ ] 后端测试全部通过
- [ ] 前端类型检查通过
- [ ] 前端 lint 检查通过
- [ ] 终端可以打开
- [ ] 终端可以接收输出
- [ ] 终端可以发送输入
- [ ] 终端可以调整尺寸
- [ ] 终端关闭后资源释放
