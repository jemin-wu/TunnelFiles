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
use utils::logging::init_logging;

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
    let settings = db.settings_load().unwrap_or_default();
    let log_level = settings.log_level.to_tracing_level();

    if let Err(e) = init_logging(log_level) {
        eprintln!("Failed to initialize logging: {}", e);
    }

    // 3. 初始化会话管理器
    let session_manager = Arc::new(SessionManager::new());

    // 4. 初始化传输管理器
    let transfer_manager = Arc::new(TransferManager::new(settings.max_concurrent_transfers));

    // 5. 初始化终端管理器
    let terminal_manager = Arc::new(TerminalManager::new());

    // 6. 构建 Tauri 应用
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            // Terminal 命令
            commands::terminal::terminal_open,
            commands::terminal::terminal_input,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::terminal::terminal_get_by_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
