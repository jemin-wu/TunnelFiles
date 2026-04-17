//! Settings 相关命令
//!
//! - settings_get: 获取设置
//! - settings_set: 更新设置
//! - export_diagnostics: 导出诊断包

use std::sync::Arc;
use tauri::State;

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::settings::{Settings, SettingsPatch};
use crate::services::storage_service::Database;
use crate::services::transfer_manager::TransferManager;
use crate::utils::logging::export_diagnostic_package;

/// 获取当前设置
#[tauri::command]
pub async fn settings_get(db: State<'_, Arc<Database>>) -> AppResult<Settings> {
    tracing::debug!("获取设置");
    let db = (*db).clone();
    tokio::task::spawn_blocking(move || db.settings_load())
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))?
}

/// 更新设置
///
/// 接受部分更新（patch），只更新提供的字段
#[tauri::command]
pub async fn settings_set(
    db: State<'_, Arc<Database>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    patch: SettingsPatch,
) -> AppResult<Settings> {
    tracing::debug!("更新设置");
    let db = (*db).clone();
    let settings = tokio::task::spawn_blocking(move || db.settings_update(&patch))
        .await
        .map_err(|e| AppError::new(ErrorCode::Unknown, format!("任务执行失败: {}", e)))??;

    // 同步运行时可变设置（max_concurrent 需要重建 semaphore 才能生效，暂缓；
    // retry 次数纯原子读，可立即对后续任务生效）
    transfer_manager.set_max_retries(settings.transfer_retry_count);

    Ok(settings)
}

/// 导出诊断包
///
/// 打包日志文件和配置摘要（脱敏）为 zip 文件
/// 返回生成的文件路径
#[tauri::command]
pub async fn export_diagnostics() -> AppResult<String> {
    tracing::info!("开始导出诊断包");

    let path = export_diagnostic_package()
        .map_err(|e| AppError::local_io_error(format!("导出诊断包失败: {}", e)))?;

    let path_str = path.to_string_lossy().to_string();

    tracing::info!(path = %path_str, "诊断包导出完成");

    Ok(path_str)
}
