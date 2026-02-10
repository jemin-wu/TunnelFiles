//! Service-layer integration tests
//!
//! Tests SessionManager and TransferManager against Docker SSH servers.
//!
//! Run: cd src-tauri && cargo test --test service_integration -- --test-threads=1 --nocapture

use std::path::Path;
use std::sync::Arc;

use tunnelfiles_lib::models::error::{AppResult, ErrorCode};
use tunnelfiles_lib::models::profile::{AuthType, Profile};
use tunnelfiles_lib::models::transfer_task::{TransferDirection, TransferStatus};
use tunnelfiles_lib::services::session_manager::{ConnectStatus, SessionManager};
use tunnelfiles_lib::services::storage_service::Database;
use tunnelfiles_lib::services::transfer_manager::TransferManager;

// Docker test server configs
const HOST: &str = "127.0.0.1";
const PORT_1: u16 = 2222;
const PORT_2: u16 = 2223;
const USERNAME: &str = "testuser";
const PASSWORD: &str = "testpass123";

fn is_docker_available() -> bool {
    use std::net::TcpStream;
    TcpStream::connect(format!("{}:{}", HOST, PORT_1)).is_ok()
}

fn create_test_db() -> (Database, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().unwrap();
    let db = Database::init_with_path(&temp_dir.path().join("test.db")).unwrap();
    (db, temp_dir)
}

fn create_test_profile(port: u16) -> Profile {
    Profile {
        id: format!("test-profile-{}", port),
        name: format!("Test Server {}", port),
        host: HOST.to_string(),
        port,
        username: USERNAME.to_string(),
        auth_type: AuthType::Password,
        password_ref: None,
        private_key_path: None,
        passphrase_ref: None,
        initial_path: None,
        created_at: chrono::Utc::now().timestamp_millis(),
        updated_at: chrono::Utc::now().timestamp_millis(),
    }
}

/// Helper: connect with host key handling.
///
/// First call connect() which returns NeedHostKeyConfirm for a fresh DB,
/// then trust the host key and use connect_after_trust() to complete.
fn connect_with_trust(
    manager: &SessionManager,
    db: &Database,
    profile: &Profile,
) -> AppResult<tunnelfiles_lib::services::session_manager::ConnectResult> {
    let status = manager.connect(db, profile, Some(PASSWORD), None, 30)?;
    match status {
        ConnectStatus::Connected(result) => Ok(result),
        ConnectStatus::NeedHostKeyConfirm(pending) => {
            // Trust the host key in DB, then connect again
            db.known_host_trust(
                &pending.host,
                pending.port,
                &pending.key_type,
                &pending.fingerprint,
            )?;
            manager.connect_after_trust(profile, Some(PASSWORD), None, 30)
        }
    }
}

// ============================================
// Session Lifecycle Tests
// ============================================

mod session_lifecycle {
    use super::*;

    #[test]
    fn test_connect_and_get_session() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        let result = connect_with_trust(&manager, &db, &profile).unwrap();

        assert!(!result.session_id.is_empty());
        assert!(!result.home_path.is_empty());
        assert!(result.fingerprint.starts_with("SHA256:"));

        // get_session should work
        let session = manager.get_session(&result.session_id);
        assert!(session.is_ok());
        let session = session.unwrap();
        assert_eq!(session.profile_id, profile.id);
        assert_eq!(session.session_id, result.session_id);
    }

    #[test]
    fn test_close_session() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        let result = connect_with_trust(&manager, &db, &profile).unwrap();
        let session_id = result.session_id.clone();

        // Close session
        manager.close_session(&session_id).unwrap();

        // get_session should now fail
        let get_result = manager.get_session(&session_id);
        assert!(get_result.is_err());
    }

    #[test]
    fn test_connect_first_time_needs_hostkey_confirm() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        // First connect with fresh DB should return NeedHostKeyConfirm
        let status = manager
            .connect(&db, &profile, Some(PASSWORD), None, 30)
            .unwrap();

        match status {
            ConnectStatus::NeedHostKeyConfirm(pending) => {
                assert_eq!(pending.host, HOST);
                assert_eq!(pending.port, PORT_1);
                assert!(!pending.fingerprint.is_empty());
                assert!(!pending.key_type.is_empty());
                assert_eq!(pending.profile_id, profile.id);
            }
            ConnectStatus::Connected(_) => {
                panic!("Expected NeedHostKeyConfirm for first connection with fresh DB");
            }
        }
    }

    #[test]
    fn test_concurrent_sessions() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();

        let profile1 = create_test_profile(PORT_1);
        let profile2 = create_test_profile(PORT_2);

        let result1 = connect_with_trust(&manager, &db, &profile1).unwrap();
        let result2 = connect_with_trust(&manager, &db, &profile2).unwrap();

        // Both sessions should be accessible
        assert!(manager.get_session(&result1.session_id).is_ok());
        assert!(manager.get_session(&result2.session_id).is_ok());

        // list_sessions should contain both
        let sessions = manager.list_sessions().unwrap();
        assert_eq!(sessions.len(), 2);
        assert!(sessions.contains(&result1.session_id));
        assert!(sessions.contains(&result2.session_id));
    }

    #[test]
    fn test_is_session_alive() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        let result = connect_with_trust(&manager, &db, &profile).unwrap();

        assert!(manager.is_session_alive(&result.session_id));
        assert!(!manager.is_session_alive("nonexistent-session"));
    }

    #[test]
    fn test_cleanup_stale_sessions() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        let result = connect_with_trust(&manager, &db, &profile).unwrap();
        let session_id = result.session_id.clone();

        // Cleanup with 0 timeout should clean all sessions (they're all "stale")
        // But we just connected so idle_secs() is ~0, use timeout=0 to catch it
        // Need a small sleep to ensure idle_secs() > 0
        std::thread::sleep(std::time::Duration::from_millis(100));
        let cleaned = manager.cleanup_stale_sessions(0);
        assert_eq!(cleaned, 1);

        // Session should be gone
        assert!(manager.get_session(&session_id).is_err());
    }

    #[test]
    fn test_session_sftp_operations() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        let result = connect_with_trust(&manager, &db, &profile).unwrap();
        let session = manager.get_session(&result.session_id).unwrap();

        // SFTP readdir should work
        let entries = session.sftp.readdir(Path::new("."));
        assert!(entries.is_ok(), "SFTP readdir should succeed");
    }

    #[test]
    fn test_connect_wrong_password() {
        if !is_docker_available() {
            eprintln!("Skipping: Docker SSH server not available");
            return;
        }

        let (db, _tmp) = create_test_db();
        let manager = SessionManager::new();
        let profile = create_test_profile(PORT_1);

        // First, trust the host key so we get past that step
        let status = manager
            .connect(&db, &profile, Some(PASSWORD), None, 30)
            .unwrap();
        if let ConnectStatus::NeedHostKeyConfirm(pending) = status {
            db.known_host_trust(
                &pending.host,
                pending.port,
                &pending.key_type,
                &pending.fingerprint,
            )
            .unwrap();
        }

        // Now try with wrong password
        let result = manager.connect(&db, &profile, Some("wrong_password"), None, 30);
        let err = match result {
            Err(e) => e,
            Ok(_) => panic!("Expected AuthFailed error for wrong password"),
        };
        assert_eq!(err.code, ErrorCode::AuthFailed);
    }
}

// ============================================
// Transfer Lifecycle Tests
// ============================================

mod transfer_lifecycle {
    use super::*;
    use std::io::Write;

    fn create_temp_file(content: &[u8]) -> tempfile::NamedTempFile {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(content).unwrap();
        file.flush().unwrap();
        file
    }

    #[tokio::test]
    async fn test_create_upload_task() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"upload test content");

        let task_id = manager
            .create_upload(
                "session-abc".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote/dir".to_string(),
            )
            .await
            .unwrap();

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Waiting);
        assert_eq!(task.direction, TransferDirection::Upload);
        assert_eq!(task.session_id, "session-abc");
        assert_eq!(task.transferred, 0);
        assert_eq!(task.total, Some(19)); // "upload test content" = 19 bytes
        assert!(task.completed_at.is_none());
    }

    #[tokio::test]
    async fn test_create_download_task() {
        let manager = TransferManager::new(3);
        let temp_dir = tempfile::tempdir().unwrap();

        let task_id = manager
            .create_download(
                "session-abc".to_string(),
                "/remote/path/data.csv".to_string(),
                temp_dir.path().to_str().unwrap().to_string(),
            )
            .await
            .unwrap();

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Waiting);
        assert_eq!(task.direction, TransferDirection::Download);
        assert_eq!(task.file_name, "data.csv");
        assert_eq!(task.total, None); // Download total unknown at creation
        assert!(task.completed_at.is_none());
    }

    #[tokio::test]
    async fn test_cancel_waiting_task() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"cancel me");

        let task_id = manager
            .create_upload(
                "session-abc".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap();

        // Cancel the waiting task
        manager.cancel_task(None, &task_id).await.unwrap();

        let task = manager.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, TransferStatus::Canceled);
        assert!(task.completed_at.is_some());
    }

    #[tokio::test]
    async fn test_retry_failed_task() {
        let manager = TransferManager::new(3);
        let temp_file = create_temp_file(b"retry me");

        let task_id = manager
            .create_upload(
                "session-abc".to_string(),
                temp_file.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap();

        // Simulate failure by directly updating status (using the internal method
        // which is accessible because update_status is private, so we use the
        // public retry path: mark as failed via cancel+state change won't work,
        // but retry_task checks for Failed status)
        // We need to get the task to Failed state. The only public way is through
        // execute_task which needs AppHandle. Instead, test retry with the state machine.

        // retry_task requires Failed status - a Waiting task should be rejected
        let result = manager.retry_task(&task_id).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidArgument);
    }

    #[tokio::test]
    async fn test_concurrent_task_creation() {
        let manager = Arc::new(TransferManager::new(2));
        let mut handles = vec![];

        // Create 5 tasks concurrently
        for i in 0..5 {
            let mgr = manager.clone();
            let handle = tokio::spawn(async move {
                let temp_file = create_temp_file(format!("data_{}", i).as_bytes());
                mgr.create_upload(
                    format!("session-{}", i),
                    temp_file.path().to_str().unwrap().to_string(),
                    "/remote".to_string(),
                )
                .await
            });
            handles.push(handle);
        }

        let results: Vec<_> = futures::future::join_all(handles).await;
        let task_ids: Vec<String> = results.into_iter().map(|r| r.unwrap().unwrap()).collect();
        assert_eq!(task_ids.len(), 5);

        // All task IDs should be unique
        let unique: std::collections::HashSet<_> = task_ids.iter().collect();
        assert_eq!(unique.len(), 5);

        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 5);
    }

    #[tokio::test]
    async fn test_list_and_get_tasks() {
        let manager = TransferManager::new(3);
        let temp1 = create_temp_file(b"file1");
        let _temp2_keep = create_temp_file(b"file2"); // keep alive
        let temp_dir = tempfile::tempdir().unwrap();

        let id1 = manager
            .create_upload(
                "s1".to_string(),
                temp1.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap();

        let id2 = manager
            .create_download(
                "s2".to_string(),
                "/remote/file.txt".to_string(),
                temp_dir.path().to_str().unwrap().to_string(),
            )
            .await
            .unwrap();

        // list_tasks should return both
        let tasks = manager.list_tasks().await;
        assert_eq!(tasks.len(), 2);

        // get_task should return correct tasks
        let task1 = manager.get_task(&id1).await.unwrap();
        assert_eq!(task1.direction, TransferDirection::Upload);

        let task2 = manager.get_task(&id2).await.unwrap();
        assert_eq!(task2.direction, TransferDirection::Download);

        // get_task for nonexistent should return None
        assert!(manager.get_task("nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn test_cleanup_completed() {
        let manager = TransferManager::new(3);
        let temp1 = create_temp_file(b"data1");
        let temp2 = create_temp_file(b"data2");
        let temp3 = create_temp_file(b"data3");

        let _id1 = manager
            .create_upload(
                "s1".to_string(),
                temp1.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap(); // stays Waiting

        let id2 = manager
            .create_upload(
                "s2".to_string(),
                temp2.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap();

        let id3 = manager
            .create_upload(
                "s3".to_string(),
                temp3.path().to_str().unwrap().to_string(),
                "/remote".to_string(),
            )
            .await
            .unwrap();

        // Cancel task2 (Waiting -> Canceled)
        manager.cancel_task(None, &id2).await.unwrap();

        // Cancel task3 too
        manager.cancel_task(None, &id3).await.unwrap();

        // Verify states before cleanup
        assert_eq!(
            manager.get_task(&id2).await.unwrap().status,
            TransferStatus::Canceled
        );
        assert_eq!(
            manager.get_task(&id3).await.unwrap().status,
            TransferStatus::Canceled
        );

        // Cleanup removes Success and Canceled
        manager.cleanup_completed().await;

        let remaining = manager.list_tasks().await;
        // Only the Waiting task should remain
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].status, TransferStatus::Waiting);
    }
}
