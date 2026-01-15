//! Settings 相关命令
//!
//! - settings_get: 获取设置
//! - settings_set: 更新设置
//! - export_diagnostics: 导出诊断包

use std::sync::Arc;
use tauri::State;

use crate::models::error::{AppError, AppResult};
use crate::models::settings::{Settings, SettingsPatch};
use crate::services::storage_service::Database;
use crate::utils::logging::export_diagnostic_package;

/// 获取当前设置
#[tauri::command]
pub async fn settings_get(db: State<'_, Arc<Database>>) -> AppResult<Settings> {
    tracing::debug!("获取设置");
    db.settings_load()
}

/// 更新设置
///
/// 接受部分更新（patch），只更新提供的字段
#[tauri::command]
pub async fn settings_set(
    db: State<'_, Arc<Database>>,
    patch: SettingsPatch,
) -> AppResult<Settings> {
    tracing::debug!("更新设置");
    db.settings_update(&patch)
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
