//! Terminal model 单元测试
//!
//! 验证 TerminalStatus 序列化和 TerminalStatusPayload 重连字段

use tunnelfiles_lib::models::terminal::{TerminalStatus, TerminalStatusPayload};

#[test]
fn test_reconnecting_status_serialization() {
    let status = TerminalStatus::Reconnecting;
    let json = serde_json::to_string(&status).unwrap();
    assert_eq!(json, "\"reconnecting\"");
}

#[test]
fn test_all_status_variants_serialize() {
    assert_eq!(
        serde_json::to_string(&TerminalStatus::Connected).unwrap(),
        "\"connected\""
    );
    assert_eq!(
        serde_json::to_string(&TerminalStatus::Disconnected).unwrap(),
        "\"disconnected\""
    );
    assert_eq!(
        serde_json::to_string(&TerminalStatus::Reconnecting).unwrap(),
        "\"reconnecting\""
    );
    assert_eq!(
        serde_json::to_string(&TerminalStatus::Error).unwrap(),
        "\"error\""
    );
}

#[test]
fn test_status_payload_with_reconnect_fields() {
    let payload = TerminalStatusPayload {
        terminal_id: "test-id".to_string(),
        status: TerminalStatus::Reconnecting,
        message: Some("Reconnecting... attempt 1/3".to_string()),
        reconnect_attempt: Some(1),
        max_reconnect_attempts: Some(3),
    };
    let json = serde_json::to_string(&payload).unwrap();
    assert!(json.contains("\"reconnecting\""));
    assert!(json.contains("\"reconnectAttempt\":1"));
    assert!(json.contains("\"maxReconnectAttempts\":3"));
}

#[test]
fn test_status_payload_without_reconnect_fields() {
    let payload = TerminalStatusPayload {
        terminal_id: "test-id".to_string(),
        status: TerminalStatus::Connected,
        message: None,
        reconnect_attempt: None,
        max_reconnect_attempts: None,
    };
    let json = serde_json::to_string(&payload).unwrap();
    // reconnect fields should be absent when None
    assert!(!json.contains("reconnectAttempt"));
    assert!(!json.contains("maxReconnectAttempts"));
}
