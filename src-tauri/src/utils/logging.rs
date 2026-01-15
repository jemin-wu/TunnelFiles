//! 日志模块
//!
//! 负责:
//! - tracing 日志配置
//! - 日志文件输出
//! - 诊断包导出

use std::fs;
use std::path::PathBuf;
use tracing::Level;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

use crate::services::storage_service::{get_app_data_dir, get_logs_dir};

fn level_as_str(level: Level) -> &'static str {
    match level {
        Level::ERROR => "error",
        Level::WARN => "warn",
        Level::INFO => "info",
        Level::DEBUG => "debug",
        Level::TRACE => "trace",
    }
}

/// 初始化日志系统
///
/// - 控制台输出 (开发模式)
/// - 文件输出 (滚动日志，按天切割)
pub fn init_logging(level: Level) -> Result<(), Box<dyn std::error::Error>> {
    let logs_dir = get_logs_dir();

    // 确保日志目录存在
    fs::create_dir_all(&logs_dir)?;

    // 创建滚动日志文件 appender (按天切割，保留 7 天)
    let file_appender = RollingFileAppender::new(Rotation::DAILY, &logs_dir, "tunnelfiles.log");

    // 环境过滤器
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new(format!(
            "tunnelfiles={},ssh2=warn,rusqlite=warn",
            level_as_str(level)
        ))
    });

    // 控制台输出层
    let console_layer = fmt::layer()
        .with_target(true)
        .with_level(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_ansi(true)
        .compact();

    // 文件输出层
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_target(true)
        .with_level(true)
        .with_thread_ids(true)
        .with_ansi(false)
        .with_span_events(FmtSpan::CLOSE)
        .json();

    // 组合并初始化
    tracing_subscriber::registry()
        .with(env_filter)
        .with(console_layer)
        .with(file_layer)
        .init();

    tracing::info!(
        log_level = level_as_str(level),
        logs_dir = %logs_dir.display(),
        "日志系统初始化完成"
    );

    Ok(())
}

/// 导出诊断包
///
/// 打包日志文件和配置摘要为 zip 文件
pub fn export_diagnostic_package() -> Result<PathBuf, Box<dyn std::error::Error>> {
    use std::io::Write;

    let app_dir = get_app_data_dir();
    let logs_dir = get_logs_dir();

    // 创建诊断包输出路径
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let output_path = app_dir.join(format!("diagnostic_{}.zip", timestamp));

    let file = fs::File::create(&output_path)?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 添加日志文件
    if logs_dir.exists() {
        for entry in fs::read_dir(&logs_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown");

                zip.start_file(format!("logs/{}", file_name), options)?;
                let content = fs::read(&path)?;
                zip.write_all(&content)?;
            }
        }
    }

    // 添加系统信息摘要
    zip.start_file("system_info.txt", options)?;
    let system_info = format!(
        "TunnelFiles Diagnostic Report\n\
         ==============================\n\
         Generated: {}\n\
         OS: {} {}\n\
         Arch: {}\n\
         App Data Dir: {}\n\
         ",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        std::env::consts::OS,
        std::env::consts::FAMILY,
        std::env::consts::ARCH,
        app_dir.display(),
    );
    zip.write_all(system_info.as_bytes())?;

    // 添加数据库文件副本（排除敏感数据）
    let db_path = app_dir.join("data.db");
    if db_path.exists() {
        zip.start_file("database_info.txt", options)?;
        let db_info = format!(
            "Database: data.db\n\
             Size: {} bytes\n\
             Note: Settings are stored in the database (settings table)\n",
            fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0)
        );
        zip.write_all(db_info.as_bytes())?;
    }

    zip.finish()?;

    tracing::info!(path = %output_path.display(), "诊断包导出完成");

    Ok(output_path)
}

/// 清理旧日志文件
///
/// 删除超过指定天数的日志文件
pub fn cleanup_old_logs(days: u32) -> Result<usize, std::io::Error> {
    let logs_dir = get_logs_dir();
    let mut deleted_count = 0;

    if !logs_dir.exists() {
        return Ok(0);
    }

    let cutoff = chrono::Local::now() - chrono::Duration::days(days as i64);

    for entry in fs::read_dir(&logs_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    let modified_time: chrono::DateTime<chrono::Local> = modified.into();
                    if modified_time < cutoff && fs::remove_file(&path).is_ok() {
                        deleted_count += 1;
                        tracing::debug!(file = %path.display(), "删除过期日志文件");
                    }
                }
            }
        }
    }

    if deleted_count > 0 {
        tracing::info!(count = deleted_count, "清理过期日志文件");
    }

    Ok(deleted_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_as_str() {
        assert_eq!(level_as_str(Level::ERROR), "error");
        assert_eq!(level_as_str(Level::WARN), "warn");
        assert_eq!(level_as_str(Level::INFO), "info");
        assert_eq!(level_as_str(Level::DEBUG), "debug");
        assert_eq!(level_as_str(Level::TRACE), "trace");
    }
}
