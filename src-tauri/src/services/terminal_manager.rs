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
                    let mut channel_guard = match terminal.channel.write() {
                        Ok(c) => c,
                        Err(_) => break,
                    };

                    // 检查是否已关闭
                    if channel_guard.eof() {
                        break;
                    }

                    match channel_guard.read(&mut buffer) {
                        Ok(0) => {
                            // EOF
                            break;
                        }
                        Ok(n) => n,
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

        let mut channel = terminal.channel.write().map_err(|_| {
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
