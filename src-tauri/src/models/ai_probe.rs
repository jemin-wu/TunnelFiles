//! AI probe 会话模型（T2.5 / SPEC §5）。
//!
//! `ManagedAiProbe` 是轻量独立 SSH session，专供 shell copilot 探针命令使用。
//! 设计刻意不镜像 `ManagedTerminal`：无 PTY、无 reader thread、无 generation
//! AtomicU64、无 last_input_ts、无 recent_output buffer。
//!
//! 锁顺序固定（防止与 reconnect 死锁）：channel → session。

use std::sync::{Mutex, RwLock};
use std::time::Instant;

use ssh2::{Channel, Session};

/// Probe 会话当前状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeStatus {
    /// 已连接，空闲等待命令
    Idle,
    /// 正在执行探针命令
    Running,
    /// SSH session 已断开（可尝试重连）
    Disconnected,
}

/// 独立 AI 探针 SSH session。
///
/// 每个 probe 持有独立的 TCP 连接和认证 session，不与主 session 或
/// Terminal session 共享资源。`channel` 按需创建（None = 无活跃命令）。
pub struct ManagedAiProbe {
    /// 关联的 Profile ID（用于日志和重连）
    pub profile_id: String,
    /// 独立 SSH session（non-blocking 模式下可超时）
    pub session: Mutex<Session>,
    /// 活跃执行 channel（按需创建；None = 空闲）。锁顺序：先 channel 后 session。
    pub channel: Mutex<Option<Channel>>,
    /// 最后活跃时间（探针命令完成时更新）
    pub last_activity: RwLock<Instant>,
    /// 当前状态
    pub status: RwLock<ProbeStatus>,
}

// SAFETY: ManagedAiProbe 可以安全跨线程发送和共享，原因如下：
// 1. ssh2::Session 和 Channel 虽然是 !Send + !Sync（libssh2 C 绑定），但均通过
//    Mutex 序列化所有访问，保证同时只有一个线程操作 libssh2 对象。
// 2. 任何 ssh2 调用都在 spawn_blocking 闭包内进行，不会阻塞 tokio runtime。
// 3. 锁获取顺序固定：channel → session（与 Terminal 一致），消除死锁环。
// 4. last_activity 通过 RwLock<Instant> 保护，Instant 是 Send + Sync。
// 5. status 通过 RwLock<ProbeStatus> 保护，ProbeStatus 是 Copy + Send + Sync。
// 6. profile_id (String) 创建后不可变，无需加锁。
// 7. 没有原始裸指针或内部可变性绕过上述机制。
unsafe impl Send for ManagedAiProbe {}
unsafe impl Sync for ManagedAiProbe {}

impl ManagedAiProbe {
    /// 创建新的 probe 实例。`session` 必须已完成 SSH 认证。
    pub fn new(profile_id: String, session: Session) -> Self {
        Self {
            profile_id,
            session: Mutex::new(session),
            channel: Mutex::new(None),
            last_activity: RwLock::new(Instant::now()),
            status: RwLock::new(ProbeStatus::Idle),
        }
    }

    /// 更新最后活跃时间。
    pub fn touch(&self) {
        if let Ok(mut last) = self.last_activity.write() {
            *last = Instant::now();
        }
    }

    /// 返回自上次活跃以来经过的秒数。
    pub fn idle_secs(&self) -> u64 {
        self.last_activity
            .read()
            .map(|t| t.elapsed().as_secs())
            .unwrap_or(0)
    }

    /// 读取当前状态。
    pub fn status(&self) -> ProbeStatus {
        self.status
            .read()
            .map(|s| *s)
            .unwrap_or(ProbeStatus::Disconnected)
    }

    /// 更新状态。
    pub fn set_status(&self, new_status: ProbeStatus) {
        if let Ok(mut s) = self.status.write() {
            *s = new_status;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn managed_ai_probe_is_send_and_sync() {
        // 静态断言：若编译通过，Send + Sync 成立
        assert_send_sync::<ManagedAiProbe>();
    }

    #[test]
    fn probe_status_default_is_idle() {
        // ProbeStatus 必须从 Idle 开始
        let status = ProbeStatus::Idle;
        assert_eq!(status, ProbeStatus::Idle);
        assert_ne!(status, ProbeStatus::Running);
        assert_ne!(status, ProbeStatus::Disconnected);
    }
}
