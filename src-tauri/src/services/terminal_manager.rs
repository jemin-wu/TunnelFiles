//! 终端管理器 - PTY 创建、输入/输出处理
//!
//! Terminal 使用独立的非阻塞 SSH session（与 SFTP 分离）实现毫秒级响应。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Instant;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ssh2::{Channel, Session};
use tauri::{AppHandle, Emitter};

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::terminal::{TerminalInfo, TerminalOutputPayload, TerminalStatus, TerminalStatusPayload};
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const PTY_READ_BUFFER_SIZE: usize = 8192;
const OUTPUT_THROTTLE_MS: u64 = 16;
const OUTPUT_BUFFER_LIMIT: usize = 4096;

/// 托管的终端实例（包含独立的非阻塞 SSH session）
pub struct ManagedTerminal {
    pub terminal_id: String,
    pub session_id: String,
    pub ssh_session: Session,
    pub channel: Mutex<Channel>,
    pub cols: u16,
    pub rows: u16,
    pub created_at: Instant,
    pub last_activity: RwLock<Instant>,
    /// 通知输出读取线程退出
    pub shutdown: AtomicBool,
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

    /// 打开终端（已存在则返回现有实例）
    pub fn open(
        &self,
        app: AppHandle,
        db: &Database,
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

        let ssh_session = session_manager.create_terminal_session(db, session_id)?;

        let cols = cols.unwrap_or(DEFAULT_COLS);
        let rows = rows.unwrap_or(DEFAULT_ROWS);
        let channel = Self::create_pty_channel(&ssh_session, cols, rows)?;

        // Channel 创建完成后切换到非阻塞模式
        ssh_session.set_blocking(false);

        let terminal_id = uuid::Uuid::new_v4().to_string();
        let managed_terminal = Arc::new(ManagedTerminal {
            terminal_id: terminal_id.clone(),
            session_id: session_id.to_string(),
            ssh_session,
            channel: Mutex::new(channel),
            cols,
            rows,
            created_at: Instant::now(),
            last_activity: RwLock::new(Instant::now()),
            shutdown: AtomicBool::new(false),
        });

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

    fn create_pty_channel(session: &Session, cols: u16, rows: u16) -> AppResult<Channel> {
        let mut channel = session.channel_session().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("无法创建 channel: {}", e))
        })?;

        channel
            .request_pty("xterm-256color", None, Some((cols as u32, rows as u32, 0, 0)))
            .map_err(|e| {
                AppError::new(ErrorCode::RemoteIoError, format!("请求 PTY 失败: {}", e))
            })?;

        channel.shell().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("启动 shell 失败: {}", e))
        })?;

        Ok(channel)
    }

    fn start_output_reader(&self, app: AppHandle, terminal: Arc<ManagedTerminal>) {
        thread::spawn(move || {
            // 使用初始缓冲区代替硬编码 sleep，避免竞态条件
            // 前端监听器注册前的输出会被缓冲，首次 emit 时一并发送
            let mut buffer = vec![0u8; PTY_READ_BUFFER_SIZE];
            let mut last_emit = Instant::now();
            let mut accumulated_data = Vec::with_capacity(OUTPUT_BUFFER_LIMIT * 2);

            loop {
                // 检查 shutdown 信号
                if terminal.shutdown.load(Ordering::Relaxed) {
                    tracing::info!(
                        terminal_id = %terminal.terminal_id,
                        "收到 shutdown 信号，终止读取线程"
                    );
                    break;
                }

                let read_result = {
                    let mut channel_guard = match terminal.channel.lock() {
                        Ok(c) => c,
                        Err(e) => {
                            tracing::error!(
                                terminal_id = %terminal.terminal_id,
                                error = %e,
                                "Channel mutex 已中毒，终止读取线程"
                            );
                            break;
                        }
                    };

                    if channel_guard.eof() {
                        tracing::info!(
                            terminal_id = %terminal.terminal_id,
                            "Channel EOF，远程 shell 已退出"
                        );
                        break;
                    }

                    channel_guard.read(&mut buffer)
                };

                let bytes_read = match read_result {
                    Ok(0) => {
                        tracing::info!(
                            terminal_id = %terminal.terminal_id,
                            "读取返回 0 字节，连接已关闭"
                        );
                        break;
                    }
                    Ok(n) => n,
                    Err(e) => {
                        let kind = e.kind();
                        if kind == std::io::ErrorKind::WouldBlock
                            || kind == std::io::ErrorKind::TimedOut
                        {
                            // WouldBlock: 立即发送已累积的数据
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
                            thread::sleep(std::time::Duration::from_millis(1));
                            continue;
                        }
                        tracing::error!(
                            terminal_id = %terminal.terminal_id,
                            error = %e,
                            "读取终端输出失败"
                        );
                        break;
                    }
                };

                accumulated_data.extend_from_slice(&buffer[..bytes_read]);

                let should_emit = !accumulated_data.is_empty()
                    && (last_emit.elapsed().as_millis() as u64 >= OUTPUT_THROTTLE_MS
                        || accumulated_data.len() >= OUTPUT_BUFFER_LIMIT);

                if should_emit {
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

    pub fn write_input(&self, terminal_id: &str, data: &[u8]) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        let mut channel = terminal.channel.lock().map_err(|_| {
            AppError::new(ErrorCode::Unknown, "无法获取 channel 锁")
        })?;

        channel.write_all(data).map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("写入失败: {}", e))
        })?;

        channel.flush().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("刷新失败: {}", e))
        })?;

        terminal.touch();
        Ok(())
    }

    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        let mut channel = terminal.channel.lock().map_err(|_| {
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

    pub fn close(&self, terminal_id: &str) -> AppResult<()> {
        let terminal = {
            let mut terminals = self.terminals.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端池锁")
            })?;
            terminals.remove(terminal_id)
        };

        if let Some(term) = terminal {
            // 先发送 shutdown 信号，让输出读取线程退出
            term.shutdown.store(true, Ordering::Relaxed);

            let mut mapping = self.session_to_terminal.write().map_err(|_| {
                AppError::new(ErrorCode::Unknown, "无法获取终端映射锁")
            })?;
            mapping.remove(&term.session_id);

            if let Ok(mut channel) = term.channel.lock() {
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

    pub fn get_terminal_by_session(&self, session_id: &str) -> Option<String> {
        self.session_to_terminal
            .read()
            .ok()?
            .get(session_id)
            .cloned()
    }

    /// 根据 session_id 关闭终端
    /// 复用 get_terminal_by_session + close，避免锁顺序问题
    pub fn close_by_session(&self, session_id: &str) -> AppResult<()> {
        if let Some(terminal_id) = self.get_terminal_by_session(session_id) {
            self.close(&terminal_id)?;
        }
        Ok(())
    }

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

// SAFETY: TerminalManager 可以安全地跨线程共享，原因如下：
// 1. terminals 和 session_to_terminal 使用 RwLock 保护，提供线程安全的访问
// 2. ManagedTerminal 中的 Channel 使用 Mutex 保护
// 3. ssh2::Session 虽然不是 Send/Sync，但每个 ManagedTerminal 的 Session 仅在
//    其专属的 output_reader 线程中通过 channel.read() 访问
// 4. 写入操作 (write_input) 通过 Mutex<Channel> 序列化，不直接访问 Session
// 5. 所有 Session 的其他操作 (如 resize) 也通过 Mutex<Channel> 进行
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
