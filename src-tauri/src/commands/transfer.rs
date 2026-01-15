//! Transfer 相关命令

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::models::error::AppResult;
use crate::models::transfer_task::TransferTask;
use crate::services::session_manager::SessionManager;
use crate::services::transfer_manager::TransferManager;

/// 后台执行传输任务
fn spawn_transfer_task(
    app: AppHandle,
    transfer_manager: Arc<TransferManager>,
    session_manager: Arc<SessionManager>,
    task_id: String,
) {
    tokio::spawn(async move {
        if let Err(e) = transfer_manager
            .execute_task(app, session_manager, task_id)
            .await
        {
            tracing::error!(error = %e, "传输任务执行失败");
        }
    });
}

/// 上传文件
#[tauri::command]
pub async fn transfer_upload(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    session_id: String,
    local_path: String,
    remote_dir: String,
) -> AppResult<String> {
    tracing::info!(session_id = %session_id, local_path = %local_path, remote_dir = %remote_dir, "上传文件");

    let task_id = transfer_manager
        .create_upload(session_id, local_path, remote_dir)
        .await?;

    spawn_transfer_task(
        app,
        transfer_manager.inner().clone(),
        session_manager.inner().clone(),
        task_id.clone(),
    );

    Ok(task_id)
}

/// 下载文件
#[tauri::command]
pub async fn transfer_download(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    session_id: String,
    remote_path: String,
    local_dir: String,
) -> AppResult<String> {
    tracing::info!(session_id = %session_id, remote_path = %remote_path, local_dir = %local_dir, "下载文件");

    let task_id = transfer_manager
        .create_download(session_id, remote_path, local_dir)
        .await?;

    spawn_transfer_task(
        app,
        transfer_manager.inner().clone(),
        session_manager.inner().clone(),
        task_id.clone(),
    );

    Ok(task_id)
}

/// 下载目录（递归）
#[tauri::command]
pub async fn transfer_download_dir(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    session_id: String,
    remote_path: String,
    local_dir: String,
) -> AppResult<Vec<String>> {
    tracing::info!(session_id = %session_id, remote_path = %remote_path, local_dir = %local_dir, "下载目录");

    let task_ids = transfer_manager
        .create_download_dir(
            session_manager.inner().clone(),
            session_id,
            remote_path,
            local_dir,
        )
        .await?;

    // 为每个任务启动传输
    for task_id in &task_ids {
        spawn_transfer_task(
            app.clone(),
            transfer_manager.inner().clone(),
            session_manager.inner().clone(),
            task_id.clone(),
        );
    }

    Ok(task_ids)
}

/// 上传目录（递归）
#[tauri::command]
pub async fn transfer_upload_dir(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    session_id: String,
    local_path: String,
    remote_dir: String,
) -> AppResult<Vec<String>> {
    tracing::info!(session_id = %session_id, local_path = %local_path, remote_dir = %remote_dir, "上传目录");

    let task_ids = transfer_manager
        .create_upload_dir(
            session_manager.inner().clone(),
            session_id,
            local_path,
            remote_dir,
        )
        .await?;

    // 为每个任务启动传输
    for task_id in &task_ids {
        spawn_transfer_task(
            app.clone(),
            transfer_manager.inner().clone(),
            session_manager.inner().clone(),
            task_id.clone(),
        );
    }

    Ok(task_ids)
}

/// 取消传输
#[tauri::command]
pub async fn transfer_cancel(
    transfer_manager: State<'_, Arc<TransferManager>>,
    task_id: String,
) -> AppResult<()> {
    tracing::info!(task_id = %task_id, "取消传输任务");
    transfer_manager.cancel_task(&task_id).await
}

/// 重试传输
#[tauri::command]
pub async fn transfer_retry(
    app: AppHandle,
    session_manager: State<'_, Arc<SessionManager>>,
    transfer_manager: State<'_, Arc<TransferManager>>,
    task_id: String,
) -> AppResult<String> {
    tracing::info!(task_id = %task_id, "重试传输任务");

    let new_task_id = transfer_manager.retry_task(&task_id).await?;

    spawn_transfer_task(
        app,
        transfer_manager.inner().clone(),
        session_manager.inner().clone(),
        new_task_id.clone(),
    );

    Ok(new_task_id)
}

/// 获取任务列表
#[tauri::command]
pub async fn transfer_list(
    transfer_manager: State<'_, Arc<TransferManager>>,
) -> AppResult<Vec<TransferTask>> {
    Ok(transfer_manager.list_tasks().await)
}

/// 获取单个任务
#[tauri::command]
pub async fn transfer_get(
    transfer_manager: State<'_, Arc<TransferManager>>,
    task_id: String,
) -> AppResult<Option<TransferTask>> {
    Ok(transfer_manager.get_task(&task_id).await)
}

/// 清理已完成的任务
#[tauri::command]
pub async fn transfer_cleanup(
    transfer_manager: State<'_, Arc<TransferManager>>,
) -> AppResult<()> {
    transfer_manager.cleanup_completed().await;
    Ok(())
}
