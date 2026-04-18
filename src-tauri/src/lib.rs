// TunnelFiles - SSH/SFTP 文件管理器
//
// 模块结构:
// - commands: IPC 命令入口
// - services: 业务逻辑服务
// - models: 数据模型
// - utils: 工具函数

use std::sync::Arc;

pub mod commands;
pub mod models;
pub mod services;
pub mod utils;

use services::session_manager::SessionManager;
use services::storage_service::Database;
use services::terminal_manager::TerminalManager;
use services::transfer_manager::TransferManager;
use utils::logging::{cleanup_old_logs, init_logging};

use tauri::Emitter;

use commands::session::SessionStatusPayload;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. 初始化数据库（设置现在存储在数据库中）
    let database = match Database::init() {
        Ok(db) => db,
        Err(e) => {
            eprintln!("Failed to initialize database: {}", e);
            std::process::exit(1);
        }
    };
    let db = Arc::new(database);

    // 2. 从数据库加载设置并初始化日志
    let settings = match db.settings_load() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Warning: Failed to load settings, using defaults: {}", e);
            Default::default()
        }
    };
    let log_level = settings.log_level.to_tracing_level();

    if let Err(e) = init_logging(log_level) {
        eprintln!("Failed to initialize logging: {}", e);
    }

    // 3. 初始化会话管理器
    let session_manager = Arc::new(SessionManager::new());

    // 4. 初始化传输管理器
    let transfer_manager = Arc::new(TransferManager::new(
        settings.max_concurrent_transfers,
        settings.transfer_retry_count,
        db.clone(),
    ));

    // 5. 初始化终端管理器
    let terminal_manager = Arc::new(TerminalManager::new());

    // 6. 启动时清理旧日志（保留 7 天）
    if let Err(e) = cleanup_old_logs(7) {
        tracing::warn!(error = %e, "清理旧日志失败");
    }

    // 7. 构建 Tauri 应用
    let sm_for_cleanup = session_manager.clone();
    let tm_for_cleanup = terminal_manager.clone();
    let xm_for_cleanup = transfer_manager.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            // 启动后台定时任务清理空闲会话（每 5 分钟检查一次，清理 30 分钟无活动的会话）
            // 与 session_disconnect 走同一拆解管线：取消传输 → 关闭终端 → 发送状态事件 → 关 SSH
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(300)).await;
                    let stale_ids = sm_for_cleanup.list_stale_session_ids(1800);
                    if stale_ids.is_empty() {
                        continue;
                    }
                    for id in stale_ids {
                        xm_for_cleanup
                            .cancel_tasks_by_session(Some(&app_handle), &id)
                            .await;
                        if let Err(e) = tm_for_cleanup.close_by_session(&id) {
                            tracing::warn!(session_id = %id, error = %e, "空闲清理：关闭关联终端失败");
                        }
                        if let Err(e) = sm_for_cleanup.close_session(&id) {
                            tracing::warn!(session_id = %id, error = %e, "空闲清理：关闭 SSH 会话失败");
                            continue;
                        }
                        let payload = SessionStatusPayload {
                            session_id: id.clone(),
                            status: "disconnected".to_string(),
                            message: Some("空闲超时已自动断开".to_string()),
                        };
                        app_handle.emit("session:status", &payload).ok();
                        tracing::info!(session_id = %id, "会话因空闲超时已清理");
                    }
                }
            });
            Ok(())
        })
        .manage(db)
        .manage(session_manager)
        .manage(transfer_manager)
        .manage(terminal_manager)
        .invoke_handler(tauri::generate_handler![
            // Profile 命令
            commands::profile::profile_list,
            commands::profile::profile_get,
            commands::profile::profile_upsert,
            commands::profile::profile_delete,
            commands::profile::profile_recent_connections,
            // Session 命令
            commands::session::session_connect,
            commands::session::session_connect_after_trust,
            commands::session::session_disconnect,
            commands::session::session_info,
            commands::session::session_list,
            // Security 命令
            commands::security::security_trust_hostkey,
            commands::security::security_remove_hostkey,
            commands::security::security_check_hostkey,
            commands::security::security_list_known_hosts,
            // Settings 命令
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::export_diagnostics,
            // SFTP 命令
            commands::sftp::sftp_list_dir,
            commands::sftp::sftp_stat,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_delete,
            commands::sftp::sftp_batch_delete,
            commands::sftp::sftp_chmod,
            commands::sftp::sftp_get_dir_stats,
            commands::sftp::sftp_delete_recursive,
            commands::sftp::sftp_read_file,
            // Transfer 命令
            commands::transfer::transfer_upload,
            commands::transfer::transfer_upload_dir,
            commands::transfer::transfer_download,
            commands::transfer::transfer_download_dir,
            commands::transfer::transfer_cancel,
            commands::transfer::transfer_retry,
            commands::transfer::transfer_list,
            commands::transfer::transfer_get,
            commands::transfer::transfer_cleanup,
            commands::transfer::transfer_history_list,
            commands::transfer::transfer_history_clear,
            // Terminal 命令
            commands::terminal::terminal_open,
            commands::terminal::terminal_input,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_reconnect,
            commands::terminal::terminal_get_by_session,
            // AI 命令
            commands::ai::ai_health_check,
            commands::ai::ai_chat_send,
            commands::ai::ai_chat_cancel,
            commands::ai::ai_context_snapshot,
            commands::ai::ai_license_accept,
            commands::ai::ai_model_download,
            commands::ai::ai_model_download_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
