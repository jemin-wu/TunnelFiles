//! Nginx E2E regression tests for the v0.3a/v0.3b plan chain.
//!
//! Run after `docker/setup-test-env.sh`:
//! `cargo test --test e2e_nginx -- --test-threads=1 --nocapture`

use std::net::TcpStream;
use std::sync::Arc;

use tunnelfiles_lib::models::ai_probe::ManagedAiProbe;
use tunnelfiles_lib::models::error::AppResult;
use tunnelfiles_lib::models::profile::{AuthType, Profile};
use tunnelfiles_lib::services::ai::allowlist::{self, CheckedCommand, Decision};
use tunnelfiles_lib::services::ai::executor::{exec_remote, ProbeOutput};
use tunnelfiles_lib::services::ai::rollback::{
    apply_text_write, rollback_snapshot, snapshot_remote_files, SnapshotBundle,
};
use tunnelfiles_lib::services::session_manager::{ConnectStatus, SessionManager};
use tunnelfiles_lib::services::storage_service::Database;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 2224;
const USERNAME: &str = "root";
const PASSWORD: &str = "rootpass123";
const NGINX_CONF: &str = "/etc/nginx/nginx.conf";

fn is_nginx_docker_available() -> bool {
    TcpStream::connect(format!("{HOST}:{PORT}")).is_ok()
}

fn create_test_db() -> (Database, tempfile::TempDir) {
    let temp_dir = tempfile::tempdir().unwrap();
    let db = Database::init_with_path(&temp_dir.path().join("test.db")).unwrap();
    (db, temp_dir)
}

fn create_nginx_profile() -> Profile {
    Profile {
        id: "nginx-test-profile".to_string(),
        name: "Nginx Test Server".to_string(),
        host: HOST.to_string(),
        port: PORT,
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

fn connect_with_trust(
    manager: &SessionManager,
    db: &Database,
    profile: &Profile,
) -> AppResult<tunnelfiles_lib::services::session_manager::ConnectResult> {
    let status = manager.connect(db, profile, Some(PASSWORD), None, 30)?;
    match status {
        ConnectStatus::Connected(result) => Ok(result),
        ConnectStatus::NeedHostKeyConfirm(pending) => {
            db.known_host_trust(
                &pending.host,
                pending.port,
                &pending.key_type,
                &pending.fingerprint,
            )?;
            manager.connect_after_trust(profile, Some(PASSWORD), None, 30, &pending.fingerprint)
        }
    }
}

fn checked_probe(input: &str) -> CheckedCommand {
    match allowlist::check(input) {
        Decision::Allow(cmd) => cmd,
        Decision::RequireConfirm(_) => {
            panic!("probe command unexpectedly requires confirm: {input}")
        }
        Decision::Deny(reason) => panic!("probe command denied: {input}: {reason}"),
    }
}

fn checked_action(input: &str) -> CheckedCommand {
    match allowlist::check_action(input) {
        Decision::Allow(cmd) | Decision::RequireConfirm(cmd) => cmd,
        Decision::Deny(reason) => panic!("action command denied: {input}: {reason}"),
    }
}

fn run_remote(probe: &Arc<ManagedAiProbe>, checked: CheckedCommand) -> ProbeOutput {
    exec_remote(probe, checked).expect("remote command must succeed")
}

fn read_nginx_conf(probe: &Arc<ManagedAiProbe>) -> String {
    let output = run_remote(probe, checked_probe(&format!("cat {NGINX_CONF}")));
    assert_eq!(output.exit_code, Some(0), "cat nginx.conf should succeed");
    output.stdout
}

fn snapshot_mode(bundle: &SnapshotBundle, target_path: &str) -> Option<u32> {
    bundle
        .manifest
        .entries
        .iter()
        .find(|entry| entry.target_path == target_path)
        .and_then(|entry| entry.mode)
}

fn enable_gzip(original: &str) -> String {
    if original.contains("gzip on;") {
        return original.to_string();
    }

    original.replacen(
        "  keepalive_timeout 65;\n",
        "  keepalive_timeout 65;\n  gzip on;\n  gzip_types text/plain text/css application/json application/javascript;\n",
        1,
    )
}

fn inject_invalid_directive(original: &str) -> String {
    original.replacen(
        "  keepalive_timeout 65;\n",
        "  keepalive_timeout 65;\n  definitely_invalid_nginx_directive on;\n",
        1,
    )
}

fn disable_gzip(current: &str) -> String {
    let mut cleaned = String::new();
    for line in current.lines() {
        let trimmed = line.trim();
        if trimmed == "gzip on;" || trimmed.starts_with("gzip_types ") {
            continue;
        }
        cleaned.push_str(line);
        cleaned.push('\n');
    }
    cleaned
}

#[test]
fn e2e_nginx_positive_and_negative() {
    if !is_nginx_docker_available() {
        eprintln!("Skipping: nginx Docker test server not available on 2224");
        return;
    }

    let (db, _tmp) = create_test_db();
    let manager = SessionManager::new();
    let profile = create_nginx_profile();
    db.profile_upsert(&profile).unwrap();
    let result = connect_with_trust(&manager, &db, &profile).unwrap();
    let session = manager.get_session(&result.session_id).unwrap();
    let probe = manager
        .get_or_create_probe(&result.session_id, &db)
        .unwrap();

    let mut original = read_nginx_conf(&probe);
    if original.contains("gzip on;") {
        let baseline_snapshot = snapshot_remote_files(
            &session,
            &result.session_id,
            "step-reset-baseline",
            &[NGINX_CONF.to_string()],
        )
        .unwrap();
        let baseline_mode = snapshot_mode(&baseline_snapshot, NGINX_CONF);
        let cleaned = disable_gzip(&original);
        apply_text_write(&session, NGINX_CONF, &cleaned, baseline_mode).unwrap();
        let verify_output = run_remote(&probe, checked_probe("nginx -t"));
        assert_eq!(
            verify_output.exit_code,
            Some(0),
            "baseline reset nginx -t should succeed"
        );
        let reload_output = run_remote(&probe, checked_action("nginx -s reload"));
        assert_eq!(
            reload_output.exit_code,
            Some(0),
            "baseline reset nginx reload should succeed"
        );
        original = read_nginx_conf(&probe);
    }
    assert!(
        !original.contains("gzip on;"),
        "fixture should start without gzip"
    );

    let positive_snapshot = snapshot_remote_files(
        &session,
        &result.session_id,
        "step-positive-write",
        &[NGINX_CONF.to_string()],
    )
    .unwrap();
    let positive_mode = snapshot_mode(&positive_snapshot, NGINX_CONF);
    let updated = enable_gzip(&original);
    assert!(updated.contains("gzip on;"));

    apply_text_write(&session, NGINX_CONF, &updated, positive_mode).unwrap();

    let verify_output = run_remote(&probe, checked_probe("nginx -t"));
    assert_eq!(
        verify_output.exit_code,
        Some(0),
        "nginx -t should pass after gzip write"
    );

    let reload_output = run_remote(&probe, checked_action("nginx -s reload"));
    assert_eq!(
        reload_output.exit_code,
        Some(0),
        "nginx reload should succeed after verified write"
    );

    let updated_readback = read_nginx_conf(&probe);
    assert!(updated_readback.contains("gzip on;"));

    rollback_snapshot(&session, &positive_snapshot, |_| {}).unwrap();
    let cleanup_reload = run_remote(&probe, checked_action("nginx -s reload"));
    assert_eq!(
        cleanup_reload.exit_code,
        Some(0),
        "cleanup reload should succeed after restoring original config"
    );
    let restored = read_nginx_conf(&probe);
    assert_eq!(
        restored, original,
        "cleanup must restore original nginx.conf"
    );

    let negative_snapshot = snapshot_remote_files(
        &session,
        &result.session_id,
        "step-negative-write",
        &[NGINX_CONF.to_string()],
    )
    .unwrap();
    let negative_mode = snapshot_mode(&negative_snapshot, NGINX_CONF);
    let invalid = inject_invalid_directive(&original);
    assert!(invalid.contains("definitely_invalid_nginx_directive"));

    apply_text_write(&session, NGINX_CONF, &invalid, negative_mode).unwrap();

    let invalid_verify = run_remote(&probe, checked_probe("nginx -t"));
    assert_ne!(
        invalid_verify.exit_code,
        Some(0),
        "nginx -t should fail for intentionally broken config"
    );
    assert!(
        invalid_verify.stderr.contains("unknown directive")
            || invalid_verify.stdout.contains("unknown directive"),
        "verify failure should mention the invalid directive"
    );

    rollback_snapshot(&session, &negative_snapshot, |_| {}).unwrap();
    let final_config = read_nginx_conf(&probe);
    assert_eq!(
        final_config, original,
        "negative path rollback must restore original nginx.conf"
    );
}
