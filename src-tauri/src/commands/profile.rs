//! Profile 相关命令
//!
//! - profile_list: 获取所有连接配置
//! - profile_get: 获取单个连接配置
//! - profile_upsert: 创建/更新连接配置
//! - profile_delete: 删除连接配置

use std::sync::Arc;
use tauri::State;

use crate::models::error::{AppError, AppResult};
use crate::models::profile::{Profile, ProfileInput};
use crate::services::security_service::{
    credential_delete_for_profile, credential_store_passphrase, credential_store_password,
};
use crate::services::storage_service::Database;

/// 获取所有连接配置
#[tauri::command]
pub async fn profile_list(db: State<'_, Arc<Database>>) -> AppResult<Vec<Profile>> {
    tracing::debug!("获取 Profile 列表");
    db.profile_list()
}

/// 获取单个连接配置
#[tauri::command]
pub async fn profile_get(
    db: State<'_, Arc<Database>>,
    profile_id: String,
) -> AppResult<Option<Profile>> {
    tracing::debug!(profile_id = %profile_id, "获取 Profile");
    db.profile_get(&profile_id)
}

/// 创建或更新连接配置
///
/// 处理流程:
/// 1. 如果有密码且需要记住，存储到系统安全存储
/// 2. 如果有 passphrase 且需要记住，存储到系统安全存储
/// 3. 保存 Profile 到数据库（不含明文密码）
#[tauri::command]
pub async fn profile_upsert(
    db: State<'_, Arc<Database>>,
    input: ProfileInput,
) -> AppResult<String> {
    // 输入校验
    input
        .validate()
        .map_err(|msg| AppError::new(crate::models::error::ErrorCode::InvalidArgument, msg))?;

    let now = chrono::Utc::now().timestamp_millis();

    // 确定 ID (新建或更新)
    let (profile_id, created_at) = if let Some(ref id) = input.id {
        // 更新现有 Profile，保留原创建时间
        let existing = db.profile_get(id)?;
        match existing {
            Some(p) => (id.clone(), p.created_at),
            None => (id.clone(), now), // ID 存在但记录不存在，视为新建
        }
    } else {
        // 新建 Profile
        (uuid::Uuid::new_v4().to_string(), now)
    };

    // 处理密码存储
    let password_ref = if input.remember_password {
        // 检查是否提供了新密码（非空字符串）
        let has_new_password = input
            .password
            .as_ref()
            .map(|p| !p.is_empty())
            .unwrap_or(false);

        if has_new_password {
            // 存储新密码
            Some(credential_store_password(
                &profile_id,
                input.password.as_ref()
                    .ok_or_else(|| AppError::invalid_argument("Password required when remember_password is set"))?,
            )?)
        } else {
            // 没有新密码，保持现有的 password_ref（更新时不清除）
            if let Some(ref id) = input.id {
                db.profile_get(id)?.and_then(|p| p.password_ref)
            } else {
                None
            }
        }
    } else {
        None
    };

    // 处理 passphrase 存储
    let passphrase_ref = if input.remember_passphrase {
        // 检查是否提供了新 passphrase（非空字符串）
        let has_new_passphrase = input
            .passphrase
            .as_ref()
            .map(|p| !p.is_empty())
            .unwrap_or(false);

        if has_new_passphrase {
            // 存储新 passphrase
            Some(credential_store_passphrase(
                &profile_id,
                input.passphrase.as_ref()
                    .ok_or_else(|| AppError::invalid_argument("Passphrase required when remember_passphrase is set"))?,
            )?)
        } else {
            // 没有新 passphrase，保持现有的 passphrase_ref
            if let Some(ref id) = input.id {
                db.profile_get(id)?.and_then(|p| p.passphrase_ref)
            } else {
                None
            }
        }
    } else {
        None
    };

    // 构建 Profile
    let profile = Profile {
        id: profile_id.clone(),
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        auth_type: input.auth_type,
        password_ref,
        private_key_path: input.private_key_path,
        passphrase_ref,
        initial_path: input.initial_path,
        created_at,
        updated_at: now,
    };

    // 保存到数据库
    db.profile_upsert(&profile)?;

    tracing::info!(profile_id = %profile_id, name = %profile.name, "Profile 已保存");

    Ok(profile_id)
}

/// 删除连接配置
///
/// 同时删除关联的安全存储凭据
#[tauri::command]
pub async fn profile_delete(db: State<'_, Arc<Database>>, profile_id: String) -> AppResult<()> {
    // 先删除关联的凭据
    if let Err(e) = credential_delete_for_profile(&profile_id) {
        tracing::warn!(
            profile_id = %profile_id,
            error = %e,
            "删除凭据失败，继续删除 Profile"
        );
    }

    // 删除 Profile
    let deleted = db.profile_delete(&profile_id)?;

    if deleted {
        tracing::info!(profile_id = %profile_id, "Profile 已删除");
    } else {
        return Err(AppError::not_found(format!(
            "Profile {} 不存在",
            profile_id
        )));
    }

    Ok(())
}
