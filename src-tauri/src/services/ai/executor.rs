//! AI 探针命令执行器（T2.7 / SPEC §5）。
//!
//! ## 安全设计
//!
//! 客户端 AST 判定（allowlist）≠ 远端 shell 解释。即使 argv 通过了白名单，
//! 远端 shell 可能有别名（`alias ls=rm`）或 PATH 污染。本模块通过以下手段
//! 消除二阶攻击面：
//!
//! 1. **单引号包裹**：每个 argv 元素用 POSIX `'...'` 包裹，防止远端展开 `$VAR`。
//! 2. **远端硬化 prolog**：`set -f; unalias -a; unset HISTFILE; export PATH=...;`
//!    - `set -f` 禁用 glob 展开
//!    - `unalias -a` 清除全部别名（包括 `alias ls=rm`）
//!    - `unset HISTFILE` 不写 shell history
//!    - `export PATH=...` 只保留受信任路径
//! 3. **10s 超时 + 64KB 输出上限**：防止 DoS（无限 tail、/dev/zero 等）。
//!
//! `exec_remote` 是纯阻塞调用，调用方**必须**在 `spawn_blocking` 中使用。
//! Channel 在函数内部作为局部变量持有（不存入 probe.channel），避免锁序问题。

use std::io::Read;
use std::sync::Arc;

use crate::models::ai_probe::{ManagedAiProbe, ProbeStatus};
use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::services::ai::allowlist::CheckedCommand;

/// 探针命令执行结果。
#[derive(Debug, Clone)]
pub struct ProbeOutput {
    /// 标准输出（UTF-8 lossy，最多 `OUTPUT_CAP` 字节）
    pub stdout: String,
    /// 标准错误（UTF-8 lossy，同上限）
    pub stderr: String,
    /// 远端退出码（None = channel 关闭前未收到）
    pub exit_code: Option<i32>,
    /// 输出是否因超过 64KB 上限被截断
    pub truncated: bool,
}

pub const OUTPUT_CAP: usize = 64 * 1024; // 64 KB
const EXEC_TIMEOUT_MS: u32 = 10_000; // 10s
pub const REMOTE_PROLOG: &str =
    "set -f; unalias -a; unset HISTFILE; export PATH=/usr/bin:/bin:/usr/local/bin; ";

/// POSIX 单引号包裹：`'<s>'`，内嵌单引号转义为 `'\''`。
///
/// 保证远端 shell 不展开 `$VAR`、不做 glob、不做 brace-expansion。
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// 在 probe session 上同步执行已通过白名单的命令。
///
/// **调用方必须在 `spawn_blocking` 中调用**，此函数是纯阻塞调用。
/// Channel 生命周期完全在函数内部，不与 `probe.channel` 字段交互，
/// 以保持 `channel → session` 锁顺序不变量。
pub fn exec_remote(probe: &Arc<ManagedAiProbe>, checked: CheckedCommand) -> AppResult<ProbeOutput> {
    // 1. 组装最终命令字符串
    let quoted_args: Vec<String> = checked.argv.iter().map(|a| shell_quote(a)).collect();
    let final_cmd = format!("{}{}", REMOTE_PROLOG, quoted_args.join(" "));

    tracing::debug!(
        profile_id = %probe.profile_id,
        cmd_len = final_cmd.len(),
        "AI probe 执行命令"
    );

    probe.set_status(ProbeStatus::Running);

    // 2. 获取 session 锁，设超时，创建 channel，执行命令，读取输出。
    //    全程持 session 锁，channel 作局部变量——不需要额外获取 probe.channel 锁，
    //    避免违反 channel → session 的锁序不变量。
    let result = {
        let session_guard = probe
            .session
            .lock()
            .map_err(|_| AppError::new(ErrorCode::Unknown, "probe session lock poisoned"))?;
        session_guard.set_timeout(EXEC_TIMEOUT_MS);

        let mut channel = session_guard.channel_session().map_err(AppError::from)?;

        channel.exec(&final_cmd).map_err(AppError::from)?;

        // 3. 读 stdout（最多 OUTPUT_CAP）
        let mut stdout_buf = Vec::with_capacity(4096);
        let mut stderr_buf = Vec::with_capacity(1024);
        let mut truncated = false;

        let mut tmp = [0u8; 4096];
        loop {
            match channel.read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => {
                    let remaining = OUTPUT_CAP.saturating_sub(stdout_buf.len());
                    if remaining == 0 {
                        truncated = true;
                        break;
                    }
                    stdout_buf.extend_from_slice(&tmp[..n.min(remaining)]);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    tracing::warn!(profile_id = %probe.profile_id, "AI probe 命令超时");
                    truncated = true;
                    break;
                }
                Err(e) => return Err(AppError::remote_io_error(e.to_string())),
            }
        }

        // 4. 读 stderr
        {
            let mut stderr_stream = channel.stderr();
            let mut tmp2 = [0u8; 4096];
            loop {
                match stderr_stream.read(&mut tmp2) {
                    Ok(0) => break,
                    Ok(n) => {
                        let remaining = OUTPUT_CAP.saturating_sub(stderr_buf.len());
                        if remaining == 0 {
                            break;
                        }
                        stderr_buf.extend_from_slice(&tmp2[..n.min(remaining)]);
                    }
                    Err(_) => break,
                }
            }
        }

        channel.wait_close().ok();
        let exit_code = channel.exit_status().ok();
        // channel drop 自动关闭；session_guard drop 释放 session 锁

        Ok(ProbeOutput {
            stdout: String::from_utf8_lossy(&stdout_buf).into_owned(),
            stderr: String::from_utf8_lossy(&stderr_buf).into_owned(),
            exit_code,
            truncated,
        })
    };

    probe.set_status(ProbeStatus::Idle);
    probe.touch();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- shell_quote unit tests ----

    #[test]
    fn quote_simple_arg() {
        assert_eq!(shell_quote("ls"), "'ls'");
    }

    #[test]
    fn quote_arg_with_spaces() {
        assert_eq!(shell_quote("my file"), "'my file'");
    }

    #[test]
    fn quote_arg_prevents_dollar_expansion() {
        assert_eq!(shell_quote("$HOME"), "'$HOME'");
        assert_eq!(shell_quote("$(rm -rf /)"), "'$(rm -rf /)'");
    }

    #[test]
    fn quote_arg_with_embedded_single_quote() {
        // "it's" → 'it'\''s'
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }

    #[test]
    fn quote_empty_arg() {
        assert_eq!(shell_quote(""), "''");
    }

    #[test]
    fn quote_arg_with_backslash() {
        assert_eq!(shell_quote("a\\b"), "'a\\b'");
    }

    #[test]
    fn prolog_contains_required_hardening_flags() {
        assert!(REMOTE_PROLOG.contains("set -f"), "must disable glob");
        assert!(REMOTE_PROLOG.contains("unalias -a"), "must clear aliases");
        assert!(
            REMOTE_PROLOG.contains("unset HISTFILE"),
            "must unset history"
        );
        assert!(REMOTE_PROLOG.contains("PATH="), "must restrict PATH");
    }

    #[test]
    fn final_cmd_structure_with_argv() {
        let argv = vec!["ls".to_string(), "/tmp".to_string()];
        let checked = CheckedCommand { argv };
        let quoted_args: Vec<String> = checked.argv.iter().map(|a| shell_quote(a)).collect();
        let cmd = format!("{}{}", REMOTE_PROLOG, quoted_args.join(" "));
        assert!(cmd.starts_with(REMOTE_PROLOG));
        assert!(cmd.contains("'ls' '/tmp'"));
    }
}
