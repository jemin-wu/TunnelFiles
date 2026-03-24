//! 终端管理器 - PTY 创建、输入/输出处理、自动重连
//!
//! Terminal 使用独立的非阻塞 SSH session（与 SFTP 分离）实现毫秒级响应。
//! 连接断开时自动尝试重连（指数退避，最多 3 次），失败后可手动重连。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ssh2::{Channel, Session};
use tauri::{AppHandle, Emitter};

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::terminal::{
    TerminalInfo, TerminalOutputPayload, TerminalStatus, TerminalStatusPayload,
};
use crate::services::session_manager::SessionManager;
use crate::services::storage_service::Database;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const PTY_READ_BUFFER_SIZE: usize = 8192;
/// 自适应输出批量：交互模式（最近有用户输入）
const INTERACTIVE_THROTTLE_MS: u64 = 4;
const INTERACTIVE_BUFFER_LIMIT: usize = 4096;
/// 自适应输出批量：批量模式（无用户输入）
const BULK_THROTTLE_MS: u64 = 16;
const BULK_BUFFER_LIMIT: usize = 16384;
/// 判断交互模式的时间窗口（最后一次用户输入后 100ms 内）
const INTERACTIVE_WINDOW_MS: u64 = 100;
/// 自动重连最大尝试次数
const MAX_RECONNECT_ATTEMPTS: u8 = 3;

/// 托管的终端实例（包含独立的非阻塞 SSH session）
pub struct ManagedTerminal {
    pub terminal_id: String,
    pub session_id: String,
    /// SSH Session（通过 Mutex 保护，支持重连时替换）
    ssh_session: Mutex<Session>,
    /// PTY Channel（通过 Mutex 保护，支持重连时替换）
    pub channel: Mutex<Channel>,
    /// 当前终端列数（AtomicU16 支持 resize 时更新，重连时读取）
    pub cols: AtomicU16,
    /// 当前终端行数
    pub rows: AtomicU16,
    pub created_at: Instant,
    pub last_activity: RwLock<Instant>,
    /// 通知输出读取线程退出
    pub shutdown: AtomicBool,
    /// Reader 代数计数器，用于防止旧线程覆盖新线程的状态
    /// 每次 reconnect() 启动新 reader 时递增
    generation: AtomicU64,
    /// 最后一次用户输入的时间戳（epoch millis），用于自适应输出批量
    /// reader 线程读取此值判断交互/批量模式
    pub last_input_ts: AtomicU64,
}

// SAFETY: ManagedTerminal 可以安全地跨线程发送和共享，原因如下：
// 1. ssh2::Session 和 Channel 虽然不是 Send/Sync，但均通过 Mutex 序列化所有访问
// 2. 重连时按固定锁顺序 (channel -> session) 获取锁，防止死锁
// 3. 写入操作 (write_input) 和尺寸调整 (resize) 通过 Mutex<Channel> 序列化
// 4. AtomicU16/AtomicU64/AtomicBool 提供无锁线程安全访问（含 last_input_ts）
// 5. RwLock<Instant> 用于 last_activity，提供线程安全的读写
unsafe impl Send for ManagedTerminal {}
unsafe impl Sync for ManagedTerminal {}

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
        db: Arc<Database>,
        session_manager: Arc<SessionManager>,
        session_id: &str,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> AppResult<TerminalInfo> {
        // 检查是否已有终端
        {
            let mapping = self
                .session_to_terminal
                .read()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端映射锁"))?;
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

        let ssh_session = session_manager.create_terminal_session(&db, session_id)?;

        let cols = cols.unwrap_or(DEFAULT_COLS);
        let rows = rows.unwrap_or(DEFAULT_ROWS);
        let channel = Self::create_pty_channel(&ssh_session, cols, rows)?;

        // Channel 创建完成后切换到非阻塞模式
        ssh_session.set_blocking(false);

        let terminal_id = uuid::Uuid::new_v4().to_string();
        let managed_terminal = Arc::new(ManagedTerminal {
            terminal_id: terminal_id.clone(),
            session_id: session_id.to_string(),
            ssh_session: Mutex::new(ssh_session),
            channel: Mutex::new(channel),
            cols: AtomicU16::new(cols),
            rows: AtomicU16::new(rows),
            created_at: Instant::now(),
            last_activity: RwLock::new(Instant::now()),
            shutdown: AtomicBool::new(false),
            generation: AtomicU64::new(0),
            last_input_ts: AtomicU64::new(0),
        });

        {
            let mut terminals = self
                .terminals
                .write()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端池锁"))?;
            terminals.insert(terminal_id.clone(), managed_terminal.clone());
        }
        {
            let mut mapping = self
                .session_to_terminal
                .write()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端映射锁"))?;
            mapping.insert(session_id.to_string(), terminal_id.clone());
        }

        self.start_output_reader(app, managed_terminal.clone(), session_manager, db);

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
            .request_pty(
                "xterm-256color",
                None,
                Some((cols as u32, rows as u32, 0, 0)),
            )
            .map_err(|e| {
                AppError::new(ErrorCode::RemoteIoError, format!("请求 PTY 失败: {}", e))
            })?;

        channel.shell().map_err(|e| {
            AppError::new(ErrorCode::RemoteIoError, format!("启动 shell 失败: {}", e))
        })?;

        Ok(channel)
    }

    /// 替换终端的 SSH session 和 channel（重连核心逻辑）
    ///
    /// 锁顺序: channel -> session（必须一致，防止死锁）
    fn reconnect_terminal(
        session_manager: &SessionManager,
        db: &Database,
        terminal: &ManagedTerminal,
    ) -> AppResult<()> {
        let cols = terminal.cols.load(Ordering::Relaxed);
        let rows = terminal.rows.load(Ordering::Relaxed);

        // 创建新的 SSH session（阻塞操作：TCP 连接 + SSH 握手 + 认证）
        let new_session = session_manager.create_terminal_session(db, &terminal.session_id)?;
        let new_channel = Self::create_pty_channel(&new_session, cols, rows)?;
        new_session.set_blocking(false);

        // 获取锁并替换（锁顺序: channel -> session）
        {
            let mut channel_guard = terminal
                .channel
                .lock()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "Channel mutex 已中毒"))?;
            let mut session_guard = terminal
                .ssh_session
                .lock()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "Session mutex 已中毒"))?;

            // 关闭旧 channel（忽略错误，连接可能已断）
            channel_guard.close().ok();

            // 替换为新值，旧值在此作用域结束时被 drop
            *channel_guard = new_channel;
            *session_guard = new_session;
        }

        terminal.touch();
        Ok(())
    }

    fn start_output_reader(
        &self,
        app: AppHandle,
        terminal: Arc<ManagedTerminal>,
        session_manager: Arc<SessionManager>,
        db: Arc<Database>,
    ) {
        // 捕获当前代数，用于防止旧线程覆盖新线程的状态事件
        let my_generation = terminal.generation.load(Ordering::Acquire);

        thread::spawn(move || {
            let mut buffer = vec![0u8; PTY_READ_BUFFER_SIZE];
            let mut last_emit = Instant::now();
            let mut accumulated_data = Vec::with_capacity(BULK_BUFFER_LIMIT * 2);

            'outer: loop {
                // === 读取循环 ===
                loop {
                    // 检查 shutdown 信号或 generation 过时（手动重连时旧 reader 退出）
                    if terminal.shutdown.load(Ordering::Acquire)
                        || terminal.generation.load(Ordering::Acquire) != my_generation
                    {
                        tracing::info!(
                            terminal_id = %terminal.terminal_id,
                            "收到退出信号（shutdown 或 generation 过时），终止读取线程"
                        );
                        break 'outer;
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
                                break 'outer;
                            }
                        };

                        if channel_guard.eof() {
                            tracing::info!(
                                terminal_id = %terminal.terminal_id,
                                "Channel EOF，远程 shell 已退出"
                            );
                            // EOF 表示用户主动退出 shell，不应重连
                            break 'outer;
                        }

                        channel_guard.read(&mut buffer)
                    };

                    let bytes_read = match read_result {
                        Ok(0) => {
                            tracing::info!(
                                terminal_id = %terminal.terminal_id,
                                "读取返回 0 字节，连接已关闭"
                            );
                            // 0 字节也表示连接正常关闭，不应重连
                            break 'outer;
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
                                thread::sleep(Duration::from_millis(1));
                                continue;
                            }

                            // 连接错误 → 进入重连流程
                            tracing::warn!(
                                terminal_id = %terminal.terminal_id,
                                error = %e,
                                "读取终端输出失败，尝试自动重连"
                            );

                            // 先发送已累积的数据
                            if !accumulated_data.is_empty() {
                                let data_base64 = BASE64.encode(&accumulated_data);
                                let payload = TerminalOutputPayload {
                                    terminal_id: terminal.terminal_id.clone(),
                                    data: data_base64,
                                };
                                app.emit("terminal:output", &payload).ok();
                                accumulated_data.clear();
                            }

                            break; // 跳出内层读取循环，进入重连循环
                        }
                    };

                    accumulated_data.extend_from_slice(&buffer[..bytes_read]);

                    // 自适应批量：根据最后一次用户输入判断交互/批量模式
                    let now_millis = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;
                    let last_input = terminal.last_input_ts.load(Ordering::Acquire);
                    let is_interactive = last_input > 0
                        && now_millis.saturating_sub(last_input) < INTERACTIVE_WINDOW_MS;

                    let (throttle_ms, buffer_limit) = if is_interactive {
                        (INTERACTIVE_THROTTLE_MS, INTERACTIVE_BUFFER_LIMIT)
                    } else {
                        (BULK_THROTTLE_MS, BULK_BUFFER_LIMIT)
                    };

                    let should_emit = !accumulated_data.is_empty()
                        && (last_emit.elapsed().as_millis() as u64 >= throttle_ms
                            || accumulated_data.len() >= buffer_limit);

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

                // === 重连循环 ===
                let mut reconnected = false;
                for attempt in 0..MAX_RECONNECT_ATTEMPTS {
                    if terminal.shutdown.load(Ordering::Acquire)
                        || terminal.generation.load(Ordering::Acquire) != my_generation
                    {
                        break 'outer;
                    }

                    // 发送 Reconnecting 状态
                    let payload = TerminalStatusPayload {
                        terminal_id: terminal.terminal_id.clone(),
                        status: TerminalStatus::Reconnecting,
                        message: Some(format!(
                            "正在重连... ({}/{})",
                            attempt + 1,
                            MAX_RECONNECT_ATTEMPTS
                        )),
                        reconnect_attempt: Some(attempt + 1),
                        max_reconnect_attempts: Some(MAX_RECONNECT_ATTEMPTS),
                    };
                    app.emit("terminal:status", &payload).ok();

                    // 指数退避: 1s, 2s, 4s
                    let delay = Duration::from_secs(1 << attempt);
                    tracing::info!(
                        terminal_id = %terminal.terminal_id,
                        attempt = attempt + 1,
                        max_attempts = MAX_RECONNECT_ATTEMPTS,
                        delay_secs = delay.as_secs(),
                        "等待后尝试重连"
                    );
                    thread::sleep(delay);

                    if terminal.shutdown.load(Ordering::Acquire)
                        || terminal.generation.load(Ordering::Acquire) != my_generation
                    {
                        break 'outer;
                    }

                    match Self::reconnect_terminal(&session_manager, &db, &terminal) {
                        Ok(()) => {
                            tracing::info!(
                                terminal_id = %terminal.terminal_id,
                                attempt = attempt + 1,
                                "终端重连成功"
                            );
                            // 发送 Connected 状态
                            let payload = TerminalStatusPayload {
                                terminal_id: terminal.terminal_id.clone(),
                                status: TerminalStatus::Connected,
                                message: Some("重连成功".to_string()),
                                reconnect_attempt: None,
                                max_reconnect_attempts: None,
                            };
                            app.emit("terminal:status", &payload).ok();

                            // 重置 emit 计时器
                            last_emit = Instant::now();
                            reconnected = true;
                            break;
                        }
                        Err(e) => {
                            tracing::warn!(
                                terminal_id = %terminal.terminal_id,
                                attempt = attempt + 1,
                                error = %e,
                                "重连尝试失败"
                            );
                        }
                    }
                }

                if !reconnected {
                    // 所有重连尝试失败
                    tracing::error!(
                        terminal_id = %terminal.terminal_id,
                        max_attempts = MAX_RECONNECT_ATTEMPTS,
                        "自动重连失败，终止读取线程"
                    );
                    break 'outer;
                }

                // 重连成功，继续外层循环（回到读取循环）
            }

            // 线程退出前检查代数：仅当代数匹配时才发送 Disconnected
            // 防止旧线程覆盖新线程（手动重连后）的状态
            if terminal.generation.load(Ordering::Acquire) == my_generation {
                let payload = TerminalStatusPayload {
                    terminal_id: terminal.terminal_id.clone(),
                    status: TerminalStatus::Disconnected,
                    message: Some("终端已断开".to_string()),
                    reconnect_attempt: None,
                    max_reconnect_attempts: None,
                };
                app.emit("terminal:status", &payload).ok();
            } else {
                tracing::info!(
                    terminal_id = %terminal.terminal_id,
                    my_generation = my_generation,
                    "旧 reader 线程退出，跳过 Disconnected 事件（已有新 reader）"
                );
            }

            tracing::info!(
                terminal_id = %terminal.terminal_id,
                "终端输出读取线程已退出"
            );
        });
    }

    /// 手动重连终端（当自动重连失败后，用户点击重连按钮触发）
    pub fn reconnect(
        &self,
        app: AppHandle,
        db: Arc<Database>,
        session_manager: Arc<SessionManager>,
        terminal_id: &str,
    ) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        // 通知旧 reader 线程退出，并递增代数以使其跳过 Disconnected 事件
        terminal.shutdown.store(true, Ordering::Release);
        terminal.generation.fetch_add(1, Ordering::Release);

        // 短暂等待旧线程看到 shutdown 信号（最多一个 read 循环迭代 ~1ms）
        thread::sleep(Duration::from_millis(10));

        // 重置 shutdown 标志，为新 reader 线程做准备
        terminal.shutdown.store(false, Ordering::Release);

        // 执行重连
        Self::reconnect_terminal(&session_manager, &db, &terminal)?;

        // 启动新的 reader 线程
        self.start_output_reader(app, terminal, session_manager, db);

        Ok(())
    }

    pub fn write_input(&self, terminal_id: &str, data: &[u8]) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        // 记录用户输入时间戳，用于自适应输出批量模式切换
        let now_millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        terminal.last_input_ts.store(now_millis, Ordering::Release);

        let mut channel = terminal
            .channel
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取 channel 锁"))?;

        channel
            .write_all(data)
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("写入失败: {}", e)))?;

        channel
            .flush()
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("刷新失败: {}", e)))?;

        terminal.touch();
        Ok(())
    }

    pub fn resize(&self, terminal_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        let terminal = self.get_terminal(terminal_id)?;

        let mut channel = terminal
            .channel
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取 channel 锁"))?;

        channel
            .request_pty_size(cols as u32, rows as u32, None, None)
            .map_err(|e| AppError::new(ErrorCode::RemoteIoError, format!("调整尺寸失败: {}", e)))?;

        // 更新存储的尺寸（重连时使用）
        terminal.cols.store(cols, Ordering::Relaxed);
        terminal.rows.store(rows, Ordering::Relaxed);

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
            let mut terminals = self
                .terminals
                .write()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端池锁"))?;
            terminals.remove(terminal_id)
        };

        if let Some(term) = terminal {
            // 先发送 shutdown 信号，让输出读取线程退出
            term.shutdown.store(true, Ordering::Release);

            let mut mapping = self
                .session_to_terminal
                .write()
                .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端映射锁"))?;
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
        let terminals = self
            .terminals
            .read()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "无法获取终端池锁"))?;

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

// SAFETY: TerminalManager 仅包含 RwLock<HashMap<..>> 字段，
// 其中 Arc<ManagedTerminal> 已通过上方的 unsafe impl 标记为 Send + Sync
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

    #[test]
    fn test_adaptive_batching_constants() {
        // 交互模式比批量模式更激进
        assert!(INTERACTIVE_THROTTLE_MS < BULK_THROTTLE_MS);
        assert!(INTERACTIVE_BUFFER_LIMIT < BULK_BUFFER_LIMIT);
        // 交互窗口合理范围
        assert!(INTERACTIVE_WINDOW_MS > 0 && INTERACTIVE_WINDOW_MS <= 500);
    }

    #[test]
    fn test_interactive_mode_detection() {
        // 模拟交互模式检测逻辑
        let now: u64 = 1000;
        let last_input: u64 = 950; // 50ms ago
        let is_interactive =
            last_input > 0 && now.saturating_sub(last_input) < INTERACTIVE_WINDOW_MS;
        assert!(is_interactive);

        // 批量模式：无最近输入
        let old_input: u64 = 500; // 500ms ago
        let is_bulk = old_input > 0 && now.saturating_sub(old_input) >= INTERACTIVE_WINDOW_MS;
        assert!(is_bulk);

        // 从未有输入
        let no_input: u64 = 0;
        let is_never = no_input == 0;
        assert!(is_never);
    }
}
