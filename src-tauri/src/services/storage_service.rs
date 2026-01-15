//! 存储服务 - SQLite + JSON 配置
//!
//! 负责:
//! - SQLite 数据库初始化和迁移
//! - Profile CRUD 操作
//! - 最近连接记录
//! - Known Hosts 管理
//! - Settings JSON 读写

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};

use crate::models::error::{AppError, AppResult, ErrorCode};
use crate::models::profile::{AuthType, Profile, RecentConnection};
use crate::models::settings::{Settings, SettingsPatch};

/// 数据库版本 - 用于迁移
const DB_VERSION: i32 = 2;

/// 最近连接最大数量
const MAX_RECENT_CONNECTIONS: i32 = 10;

// ============================================
// 路径管理
// ============================================

/// 获取应用数据目录
pub fn get_app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tunnelfiles")
}

/// 获取数据库路径
pub fn get_database_path() -> PathBuf {
    get_app_data_dir().join("data.db")
}

/// 获取设置文件路径
pub fn get_settings_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

/// 获取 known_hosts 路径
pub fn get_known_hosts_path() -> PathBuf {
    get_app_data_dir().join("known_hosts")
}

/// 获取日志目录
pub fn get_logs_dir() -> PathBuf {
    get_app_data_dir().join("logs")
}

// ============================================
// 数据库管理
// ============================================

/// 数据库存储服务
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// 初始化数据库
    pub fn init() -> AppResult<Self> {
        let db_path = get_database_path();

        // 确保目录存在
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::local_io_error(format!("无法创建数据目录: {}", e)))?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| AppError::local_io_error(format!("无法打开数据库: {}", e)))?;

        // 启用 WAL 模式，提升并发性能
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;

        let db = Self {
            conn: Mutex::new(conn),
        };

        // 执行迁移
        db.migrate()?;

        tracing::info!(path = %db_path.display(), "数据库初始化完成");

        Ok(db)
    }

    /// 确保 settings 表存在（修复旧版本问题）
    fn ensure_settings_table(conn: &Connection) -> AppResult<()> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                default_download_dir TEXT,
                max_concurrent_transfers INTEGER NOT NULL DEFAULT 3,
                connection_timeout_secs INTEGER NOT NULL DEFAULT 30,
                transfer_retry_count INTEGER NOT NULL DEFAULT 2,
                log_level TEXT NOT NULL DEFAULT 'info',
                updated_at INTEGER NOT NULL
            );
            INSERT OR IGNORE INTO settings (id, updated_at) VALUES (1, 0);
            "#,
        )?;
        Ok(())
    }

    /// 执行数据库迁移
    fn migrate(&self) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        // 确保 settings 表存在（无论版本号如何）
        // 这是为了修复之前版本号已更新但表未创建的问题
        Self::ensure_settings_table(&conn)?;

        // 获取当前版本
        let current_version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap_or(0);

        if current_version >= DB_VERSION {
            return Ok(());
        }

        tracing::info!(from = current_version, to = DB_VERSION, "执行数据库迁移");

        // 版本 0 -> 1: 初始表结构
        if current_version < 1 {
            conn.execute_batch(
                r#"
                -- 连接配置表
                CREATE TABLE IF NOT EXISTS profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL DEFAULT 22,
                    username TEXT NOT NULL,
                    auth_type TEXT NOT NULL CHECK(auth_type IN ('password', 'key')),
                    password_ref TEXT,
                    private_key_path TEXT,
                    passphrase_ref TEXT,
                    initial_path TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                -- 最近连接记录表
                CREATE TABLE IF NOT EXISTS recent_connections (
                    id TEXT PRIMARY KEY,
                    profile_id TEXT NOT NULL,
                    profile_name TEXT NOT NULL,
                    host TEXT NOT NULL,
                    username TEXT NOT NULL,
                    connected_at INTEGER NOT NULL
                );

                -- 最近连接索引
                CREATE INDEX IF NOT EXISTS idx_recent_connections_time
                ON recent_connections(connected_at DESC);

                -- 传输历史表
                CREATE TABLE IF NOT EXISTS transfer_history (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    direction TEXT NOT NULL CHECK(direction IN ('upload', 'download')),
                    local_path TEXT NOT NULL,
                    remote_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'canceled')),
                    error_message TEXT,
                    started_at INTEGER NOT NULL,
                    finished_at INTEGER
                );

                -- 传输历史索引
                CREATE INDEX IF NOT EXISTS idx_transfer_history_session
                ON transfer_history(session_id);
                CREATE INDEX IF NOT EXISTS idx_transfer_history_time
                ON transfer_history(started_at DESC);

                -- Known Hosts 表 (备用方案，优先使用文件)
                CREATE TABLE IF NOT EXISTS known_hosts (
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL,
                    key_type TEXT NOT NULL,
                    fingerprint TEXT NOT NULL,
                    trusted_at INTEGER NOT NULL,
                    PRIMARY KEY (host, port)
                );
                "#,
            )?;
        }

        // 版本 1 -> 2: 迁移 settings.json 数据
        if current_version < 2 {
            self.migrate_settings_from_json(&conn)?;
        }

        // 更新版本号
        conn.execute_batch(&format!("PRAGMA user_version = {}", DB_VERSION))?;

        tracing::info!("数据库迁移完成");

        Ok(())
    }

    // ============================================
    // Profile 操作
    // ============================================

    /// 获取所有连接配置
    pub fn profile_list(&self) -> AppResult<Vec<Profile>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, host, port, username, auth_type,
                   password_ref, private_key_path, passphrase_ref,
                   initial_path, created_at, updated_at
            FROM profiles
            ORDER BY updated_at DESC
            "#,
        )?;

        let profiles = stmt
            .query_map([], |row| {
                Ok(Profile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    port: row.get(3)?,
                    username: row.get(4)?,
                    auth_type: parse_auth_type(row.get::<_, String>(5)?),
                    password_ref: row.get(6)?,
                    private_key_path: row.get(7)?,
                    passphrase_ref: row.get(8)?,
                    initial_path: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(profiles)
    }

    /// 获取单个连接配置
    pub fn profile_get(&self, id: &str) -> AppResult<Option<Profile>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let profile = conn
            .query_row(
                r#"
                SELECT id, name, host, port, username, auth_type,
                       password_ref, private_key_path, passphrase_ref,
                       initial_path, created_at, updated_at
                FROM profiles
                WHERE id = ?
                "#,
                [id],
                |row| {
                    Ok(Profile {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        host: row.get(2)?,
                        port: row.get(3)?,
                        username: row.get(4)?,
                        auth_type: parse_auth_type(row.get::<_, String>(5)?),
                        password_ref: row.get(6)?,
                        private_key_path: row.get(7)?,
                        passphrase_ref: row.get(8)?,
                        initial_path: row.get(9)?,
                        created_at: row.get(10)?,
                        updated_at: row.get(11)?,
                    })
                },
            )
            .optional()?;

        Ok(profile)
    }

    /// 创建或更新连接配置
    pub fn profile_upsert(&self, profile: &Profile) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        conn.execute(
            r#"
            INSERT INTO profiles (
                id, name, host, port, username, auth_type,
                password_ref, private_key_path, passphrase_ref,
                initial_path, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                host = excluded.host,
                port = excluded.port,
                username = excluded.username,
                auth_type = excluded.auth_type,
                password_ref = excluded.password_ref,
                private_key_path = excluded.private_key_path,
                passphrase_ref = excluded.passphrase_ref,
                initial_path = excluded.initial_path,
                updated_at = excluded.updated_at
            "#,
            params![
                profile.id,
                profile.name,
                profile.host,
                profile.port,
                profile.username,
                profile.auth_type.as_str(),
                profile.password_ref,
                profile.private_key_path,
                profile.passphrase_ref,
                profile.initial_path,
                profile.created_at,
                profile.updated_at,
            ],
        )?;

        tracing::debug!(profile_id = %profile.id, "Profile 已保存");

        Ok(())
    }

    /// 删除连接配置
    pub fn profile_delete(&self, id: &str) -> AppResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let affected = conn.execute("DELETE FROM profiles WHERE id = ?", [id])?;

        if affected > 0 {
            tracing::info!(profile_id = %id, "Profile 已删除");
        }

        Ok(affected > 0)
    }

    // ============================================
    // 最近连接记录
    // ============================================

    /// 获取最近连接记录
    pub fn recent_connections_list(&self) -> AppResult<Vec<RecentConnection>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, profile_id, profile_name, host, username, connected_at
            FROM recent_connections
            ORDER BY connected_at DESC
            LIMIT ?
            "#,
        )?;

        let records = stmt
            .query_map([MAX_RECENT_CONNECTIONS], |row| {
                Ok(RecentConnection {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    profile_name: row.get(2)?,
                    host: row.get(3)?,
                    username: row.get(4)?,
                    connected_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(records)
    }

    /// 添加最近连接记录
    pub fn recent_connection_add(&self, record: &RecentConnection) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        // 删除该 profile 的旧记录（保持最新的在顶部）
        conn.execute(
            "DELETE FROM recent_connections WHERE profile_id = ?",
            [&record.profile_id],
        )?;

        // 插入新记录
        conn.execute(
            r#"
            INSERT INTO recent_connections (
                id, profile_id, profile_name, host, username, connected_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            "#,
            params![
                record.id,
                record.profile_id,
                record.profile_name,
                record.host,
                record.username,
                record.connected_at,
            ],
        )?;

        // 清理超出限制的旧记录
        conn.execute(
            r#"
            DELETE FROM recent_connections
            WHERE id NOT IN (
                SELECT id FROM recent_connections
                ORDER BY connected_at DESC
                LIMIT ?
            )
            "#,
            [MAX_RECENT_CONNECTIONS],
        )?;

        Ok(())
    }

    /// 清空最近连接记录
    pub fn recent_connections_clear(&self) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        conn.execute("DELETE FROM recent_connections", [])?;

        tracing::info!("最近连接记录已清空");

        Ok(())
    }

    // ============================================
    // Known Hosts 管理
    // ============================================

    /// 检查 HostKey 是否已信任
    pub fn known_host_check(&self, host: &str, port: u16) -> AppResult<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let fingerprint: Option<String> = conn
            .query_row(
                "SELECT fingerprint FROM known_hosts WHERE host = ? AND port = ?",
                params![host, port],
                |row| row.get(0),
            )
            .optional()?;

        Ok(fingerprint)
    }

    /// 保存信任的 HostKey
    pub fn known_host_trust(
        &self,
        host: &str,
        port: u16,
        key_type: &str,
        fingerprint: &str,
    ) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let now = chrono::Utc::now().timestamp_millis();

        conn.execute(
            r#"
            INSERT INTO known_hosts (host, port, key_type, fingerprint, trusted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(host, port) DO UPDATE SET
                key_type = excluded.key_type,
                fingerprint = excluded.fingerprint,
                trusted_at = excluded.trusted_at
            "#,
            params![host, port, key_type, fingerprint, now],
        )?;

        tracing::info!(
            host = %host,
            port = port,
            key_type = %key_type,
            "HostKey 已信任"
        );

        Ok(())
    }

    /// 移除信任的 HostKey
    pub fn known_host_remove(&self, host: &str, port: u16) -> AppResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let affected = conn.execute(
            "DELETE FROM known_hosts WHERE host = ? AND port = ?",
            params![host, port],
        )?;

        if affected > 0 {
            tracing::info!(host = %host, port = port, "HostKey 已移除");
        }

        Ok(affected > 0)
    }

    // ============================================
    // 传输历史
    // ============================================

    /// 记录传输历史
    pub fn transfer_history_add(&self, record: &TransferHistoryRecord) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        conn.execute(
            r#"
            INSERT INTO transfer_history (
                id, session_id, direction, local_path, remote_path,
                file_size, status, error_message, started_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            params![
                record.id,
                record.session_id,
                record.direction,
                record.local_path,
                record.remote_path,
                record.file_size,
                record.status,
                record.error_message,
                record.started_at,
                record.finished_at,
            ],
        )?;

        Ok(())
    }

    /// 更新传输状态
    pub fn transfer_history_update_status(
        &self,
        id: &str,
        status: &str,
        error_message: Option<&str>,
        finished_at: Option<i64>,
    ) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        conn.execute(
            r#"
            UPDATE transfer_history
            SET status = ?, error_message = ?, finished_at = ?
            WHERE id = ?
            "#,
            params![status, error_message, finished_at, id],
        )?;

        Ok(())
    }

    /// 获取传输历史
    pub fn transfer_history_list(&self, limit: i32) -> AppResult<Vec<TransferHistoryRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, session_id, direction, local_path, remote_path,
                   file_size, status, error_message, started_at, finished_at
            FROM transfer_history
            ORDER BY started_at DESC
            LIMIT ?
            "#,
        )?;

        let records = stmt
            .query_map([limit], |row| {
                Ok(TransferHistoryRecord {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    direction: row.get(2)?,
                    local_path: row.get(3)?,
                    remote_path: row.get(4)?,
                    file_size: row.get(5)?,
                    status: row.get(6)?,
                    error_message: row.get(7)?,
                    started_at: row.get(8)?,
                    finished_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(records)
    }

    // ============================================
    // Settings 管理
    // ============================================

    /// 保存设置到数据库（内部方法，调用方需持有锁）
    fn save_settings_to_db(conn: &Connection, settings: &Settings) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            r#"
            UPDATE settings SET
                default_download_dir = ?,
                max_concurrent_transfers = ?,
                connection_timeout_secs = ?,
                transfer_retry_count = ?,
                log_level = ?,
                updated_at = ?
            WHERE id = 1
            "#,
            params![
                settings.default_download_dir,
                settings.max_concurrent_transfers,
                settings.connection_timeout_secs,
                settings.transfer_retry_count,
                settings.log_level.as_str(),
                now,
            ],
        )?;
        Ok(())
    }

    /// 从数据库行解析 Settings（内部方法）
    fn parse_settings_row(row: &rusqlite::Row) -> rusqlite::Result<Settings> {
        Ok(Settings {
            default_download_dir: row.get(0)?,
            max_concurrent_transfers: row.get(1)?,
            connection_timeout_secs: row.get(2)?,
            transfer_retry_count: row.get(3)?,
            log_level: parse_log_level(row.get::<_, String>(4)?),
        })
    }

    /// 从 JSON 文件迁移 Settings 到数据库
    fn migrate_settings_from_json(&self, conn: &Connection) -> AppResult<()> {
        let json_path = get_settings_path();

        if !json_path.exists() {
            tracing::debug!("无 settings.json 需要迁移");
            return Ok(());
        }

        let content = match fs::read_to_string(&json_path) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(error = %e, "读取 settings.json 失败，跳过迁移");
                return Ok(());
            }
        };

        let settings: Settings = match serde_json::from_str(&content) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "解析 settings.json 失败，使用默认设置");
                Settings::default()
            }
        };

        Self::save_settings_to_db(conn, &settings)?;

        if let Err(e) = fs::remove_file(&json_path) {
            tracing::warn!(error = %e, "删除 settings.json 失败");
        } else {
            tracing::info!("settings.json 已迁移到数据库并删除");
        }

        Ok(())
    }

    /// 加载设置
    pub fn settings_load(&self) -> AppResult<Settings> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let settings = conn.query_row(
            r#"
            SELECT default_download_dir, max_concurrent_transfers,
                   connection_timeout_secs, transfer_retry_count, log_level
            FROM settings WHERE id = 1
            "#,
            [],
            Self::parse_settings_row,
        )?;

        Ok(settings)
    }

    /// 更新设置
    pub fn settings_update(&self, patch: &SettingsPatch) -> AppResult<Settings> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let mut settings: Settings = conn.query_row(
            r#"
            SELECT default_download_dir, max_concurrent_transfers,
                   connection_timeout_secs, transfer_retry_count, log_level
            FROM settings WHERE id = 1
            "#,
            [],
            Self::parse_settings_row,
        )?;

        if let Some(v) = &patch.default_download_dir {
            settings.default_download_dir = Some(v.clone());
        }
        if let Some(v) = patch.max_concurrent_transfers {
            settings.max_concurrent_transfers = v.clamp(1, 6);
        }
        if let Some(v) = patch.connection_timeout_secs {
            settings.connection_timeout_secs = v.clamp(5, 300);
        }
        if let Some(v) = patch.transfer_retry_count {
            settings.transfer_retry_count = v.min(5);
        }
        if let Some(v) = &patch.log_level {
            settings.log_level = v.clone();
        }

        Self::save_settings_to_db(&conn, &settings)?;
        tracing::info!("设置已更新");

        Ok(settings)
    }

    /// 重置设置为默认值
    pub fn settings_reset(&self) -> AppResult<Settings> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::new(ErrorCode::LocalIoError, "数据库锁获取失败"))?;

        let settings = Settings::default();
        Self::save_settings_to_db(&conn, &settings)?;
        tracing::info!("设置已重置为默认值");

        Ok(settings)
    }
}

/// 传输历史记录
#[derive(Debug, Clone)]
pub struct TransferHistoryRecord {
    pub id: String,
    pub session_id: String,
    pub direction: String, // "upload" | "download"
    pub local_path: String,
    pub remote_path: String,
    pub file_size: i64,
    pub status: String, // "success" | "failed" | "canceled"
    pub error_message: Option<String>,
    pub started_at: i64,
    pub finished_at: Option<i64>,
}

// ============================================
// 辅助函数
// ============================================

fn parse_auth_type(s: String) -> AuthType {
    match s.as_str() {
        "password" => AuthType::Password,
        "key" => AuthType::Key,
        _ => AuthType::Password,
    }
}

fn parse_log_level(s: String) -> crate::models::settings::LogLevel {
    use crate::models::settings::LogLevel;
    match s.as_str() {
        "error" => LogLevel::Error,
        "warn" => LogLevel::Warn,
        "info" => LogLevel::Info,
        "debug" => LogLevel::Debug,
        _ => LogLevel::Info,
    }
}

impl AuthType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthType::Password => "password",
            AuthType::Key => "key",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn setup_test_db() -> Database {
        // 使用临时目录进行测试
        let temp_dir = env::temp_dir().join(format!("tunnelfiles_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("test.db");
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.migrate().unwrap();
        db
    }

    #[test]
    fn test_profile_crud() {
        let db = setup_test_db();

        let profile = Profile {
            id: "test-1".to_string(),
            name: "Test Server".to_string(),
            host: "192.168.1.1".to_string(),
            port: 22,
            username: "admin".to_string(),
            auth_type: AuthType::Password,
            password_ref: Some("test-1-pwd".to_string()),
            private_key_path: None,
            passphrase_ref: None,
            initial_path: Some("/home/admin".to_string()),
            created_at: 1000,
            updated_at: 1000,
        };

        // Create
        db.profile_upsert(&profile).unwrap();

        // Read
        let loaded = db.profile_get("test-1").unwrap().unwrap();
        assert_eq!(loaded.name, "Test Server");
        assert_eq!(loaded.host, "192.168.1.1");
        assert_eq!(loaded.auth_type, AuthType::Password);

        // Update
        let updated_profile = Profile {
            name: "Updated Server".to_string(),
            updated_at: 2000,
            ..profile.clone()
        };
        db.profile_upsert(&updated_profile).unwrap();

        let loaded = db.profile_get("test-1").unwrap().unwrap();
        assert_eq!(loaded.name, "Updated Server");
        assert_eq!(loaded.updated_at, 2000);

        // List
        let profiles = db.profile_list().unwrap();
        assert_eq!(profiles.len(), 1);

        // Delete
        let deleted = db.profile_delete("test-1").unwrap();
        assert!(deleted);

        let loaded = db.profile_get("test-1").unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn test_recent_connections() {
        let db = setup_test_db();

        let record = RecentConnection {
            id: "rc-1".to_string(),
            profile_id: "p-1".to_string(),
            profile_name: "Server 1".to_string(),
            host: "192.168.1.1".to_string(),
            username: "admin".to_string(),
            connected_at: 1000,
        };

        db.recent_connection_add(&record).unwrap();

        let records = db.recent_connections_list().unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].profile_name, "Server 1");

        db.recent_connections_clear().unwrap();
        let records = db.recent_connections_list().unwrap();
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_known_hosts() {
        let db = setup_test_db();

        // 初始状态 - 不存在
        let fingerprint = db.known_host_check("example.com", 22).unwrap();
        assert!(fingerprint.is_none());

        // 添加信任
        db.known_host_trust("example.com", 22, "ssh-ed25519", "SHA256:abc123")
            .unwrap();

        // 检查存在
        let fingerprint = db.known_host_check("example.com", 22).unwrap();
        assert_eq!(fingerprint, Some("SHA256:abc123".to_string()));

        // 移除
        let removed = db.known_host_remove("example.com", 22).unwrap();
        assert!(removed);

        let fingerprint = db.known_host_check("example.com", 22).unwrap();
        assert!(fingerprint.is_none());
    }
}
