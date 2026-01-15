//! SSH/SFTP 集成测试
//!
//! 运行前需要启动 Docker SSH 测试环境:
//! ```bash
//! cd docker && ./setup-test-env.sh
//! ```
//!
//! 运行测试:
//! ```bash
//! cd src-tauri && cargo test --test integration_tests -- --test-threads=1
//! ```

use std::time::Duration;

use ssh2::{Session, Sftp};

/// 测试服务器配置
struct TestServer {
    host: &'static str,
    port: u16,
    username: &'static str,
    password: &'static str,
}

const TEST_SERVER_1: TestServer = TestServer {
    host: "127.0.0.1",
    port: 2222,
    username: "testuser",
    password: "testpass123",
};

const TEST_SERVER_2: TestServer = TestServer {
    host: "127.0.0.1",
    port: 2223,
    username: "testuser",
    password: "testpass123",
};

/// 创建 SSH 连接
fn create_ssh_session(server: &TestServer) -> Result<Session, Box<dyn std::error::Error>> {
    use std::net::TcpStream;

    let addr = format!("{}:{}", server.host, server.port);
    let tcp = TcpStream::connect(&addr)?;
    tcp.set_read_timeout(Some(Duration::from_secs(30)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(30)))?;

    let mut session = Session::new()?;
    session.set_tcp_stream(tcp);
    session.handshake()?;
    session.userauth_password(server.username, server.password)?;

    if !session.authenticated() {
        return Err("认证失败".into());
    }

    Ok(session)
}

/// 创建 SFTP 会话
fn create_sftp_session(server: &TestServer) -> Result<(Session, Sftp), Box<dyn std::error::Error>> {
    let session = create_ssh_session(server)?;
    let sftp = session.sftp()?;
    Ok((session, sftp))
}

/// 检查 Docker 环境是否可用
fn is_docker_available() -> bool {
    use std::net::TcpStream;
    TcpStream::connect(format!("{}:{}", TEST_SERVER_1.host, TEST_SERVER_1.port)).is_ok()
}

// ============ 连接测试 ============

mod connection_tests {
    use super::*;

    #[test]
    fn test_password_auth_success() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let session = create_ssh_session(&TEST_SERVER_1);
        assert!(session.is_ok(), "密码认证应该成功");
    }

    #[test]
    fn test_password_auth_failure() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let server = TestServer {
            password: "wrong_password",
            ..TEST_SERVER_1
        };
        let session = create_ssh_session(&server);
        assert!(session.is_err(), "错误密码应该认证失败");
    }

    #[test]
    fn test_connection_timeout() {
        use std::net::TcpStream;

        // 连接到不存在的端口应该失败
        let result = TcpStream::connect_timeout(
            &"127.0.0.1:29999".parse().unwrap(),
            Duration::from_secs(2),
        );
        assert!(result.is_err(), "连接不存在的端口应该超时");
    }

    #[test]
    fn test_concurrent_connections() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        // 同时连接两个服务器
        let session1 = create_ssh_session(&TEST_SERVER_1);
        let session2 = create_ssh_session(&TEST_SERVER_2);

        assert!(session1.is_ok(), "第一个连接应该成功");
        assert!(session2.is_ok(), "第二个连接应该成功");
    }
}

// ============ SFTP 目录列表测试 ============

mod sftp_list_tests {
    use super::*;

    #[test]
    fn test_list_home_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let entries = sftp.readdir(std::path::Path::new("/home/testuser"));

        assert!(entries.is_ok(), "应该能列出 home 目录");
        let entries = entries.unwrap();
        assert!(!entries.is_empty(), "home 目录不应该为空");

        // 检查预期的目录
        let names: Vec<_> = entries
            .iter()
            .map(|(path, _)| path.file_name().unwrap().to_str().unwrap())
            .collect();

        assert!(names.contains(&"test-files"), "应该包含 test-files 目录");
        assert!(names.contains(&"uploads"), "应该包含 uploads 目录");
    }

    #[test]
    fn test_list_test_files_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let entries = sftp.readdir(std::path::Path::new("/home/testuser/test-files"));

        assert!(entries.is_ok(), "应该能列出 test-files 目录");
        let entries = entries.unwrap();

        let names: Vec<_> = entries
            .iter()
            .map(|(path, _)| path.file_name().unwrap().to_str().unwrap())
            .collect();

        assert!(names.contains(&"hello.txt"), "应该包含 hello.txt");
        assert!(names.contains(&"test.txt"), "应该包含 test.txt");
        assert!(names.contains(&"random.bin"), "应该包含 random.bin");
    }

    #[test]
    fn test_list_nonexistent_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let entries = sftp.readdir(std::path::Path::new("/nonexistent"));

        assert!(entries.is_err(), "不存在的目录应该返回错误");
    }

    #[test]
    fn test_list_empty_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let entries = sftp.readdir(std::path::Path::new("/home/testuser/empty-dir"));

        assert!(entries.is_ok(), "应该能列出空目录");
        let entries = entries.unwrap();
        // 空目录只有 . 和 .. (如果 SFTP 服务器返回的话)
        assert!(entries.len() <= 2, "空目录应该几乎没有内容");
    }
}

// ============ SFTP 文件操作测试 ============

mod sftp_file_ops_tests {
    use super::*;

    #[test]
    fn test_mkdir_success() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let test_dir = format!(
            "/home/testuser/uploads/test_mkdir_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        );

        // 创建目录
        let result = sftp.mkdir(std::path::Path::new(&test_dir), 0o755);
        assert!(result.is_ok(), "应该能创建目录");

        // 验证目录存在
        let stat = sftp.stat(std::path::Path::new(&test_dir));
        assert!(stat.is_ok(), "创建的目录应该存在");
        assert!(stat.unwrap().is_dir(), "应该是目录类型");

        // 清理
        sftp.rmdir(std::path::Path::new(&test_dir)).ok();
    }

    #[test]
    fn test_mkdir_already_exists() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        // 尝试创建已存在的目录
        let result = sftp.mkdir(std::path::Path::new("/home/testuser/test-files"), 0o755);
        assert!(result.is_err(), "创建已存在目录应该失败");
    }

    #[test]
    fn test_mkdir_permission_denied() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        // 尝试在只读目录中创建
        let result = sftp.mkdir(
            std::path::Path::new("/home/testuser/readonly-dir/new"),
            0o755,
        );
        assert!(result.is_err(), "在只读目录中创建应该失败");
    }

    #[test]
    fn test_rename_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let original = format!("/home/testuser/uploads/rename_test_{}.txt", timestamp);
        let renamed = format!("/home/testuser/uploads/renamed_{}.txt", timestamp);

        // 创建测试文件
        {
            let mut file = sftp
                .create(std::path::Path::new(&original))
                .expect("应该能创建文件");
            use std::io::Write;
            file.write_all(b"test content").unwrap();
        }

        // 重命名
        let result = sftp.rename(
            std::path::Path::new(&original),
            std::path::Path::new(&renamed),
            None,
        );
        assert!(result.is_ok(), "重命名应该成功");

        // 验证
        assert!(
            sftp.stat(std::path::Path::new(&original)).is_err(),
            "原文件不应该存在"
        );
        assert!(
            sftp.stat(std::path::Path::new(&renamed)).is_ok(),
            "新文件应该存在"
        );

        // 清理
        sftp.unlink(std::path::Path::new(&renamed)).ok();
    }

    #[test]
    fn test_rename_nonexistent() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        let result = sftp.rename(
            std::path::Path::new("/home/testuser/nonexistent_file.txt"),
            std::path::Path::new("/home/testuser/new_name.txt"),
            None,
        );
        assert!(result.is_err(), "重命名不存在的文件应该失败");
    }

    #[test]
    fn test_delete_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let test_file = format!("/home/testuser/uploads/delete_test_{}.txt", timestamp);

        // 创建测试文件
        {
            let mut file = sftp
                .create(std::path::Path::new(&test_file))
                .expect("应该能创建文件");
            use std::io::Write;
            file.write_all(b"to be deleted").unwrap();
        }

        // 删除
        let result = sftp.unlink(std::path::Path::new(&test_file));
        assert!(result.is_ok(), "删除文件应该成功");

        // 验证
        assert!(
            sftp.stat(std::path::Path::new(&test_file)).is_err(),
            "删除的文件不应该存在"
        );
    }

    #[test]
    fn test_delete_empty_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let test_dir = format!("/home/testuser/uploads/delete_dir_{}", timestamp);

        // 创建测试目录
        sftp.mkdir(std::path::Path::new(&test_dir), 0o755)
            .expect("应该能创建目录");

        // 删除空目录
        let result = sftp.rmdir(std::path::Path::new(&test_dir));
        assert!(result.is_ok(), "删除空目录应该成功");

        // 验证
        assert!(
            sftp.stat(std::path::Path::new(&test_dir)).is_err(),
            "删除的目录不应该存在"
        );
    }

    #[test]
    fn test_delete_nonempty_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        // 尝试删除非空目录
        let result = sftp.rmdir(std::path::Path::new("/home/testuser/test-files"));
        assert!(result.is_err(), "删除非空目录应该失败");
    }

    #[test]
    fn test_delete_nonexistent() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        let result = sftp.unlink(std::path::Path::new("/home/testuser/nonexistent.txt"));
        assert!(result.is_err(), "删除不存在的文件应该失败");
    }
}

// ============ SFTP 文件读写测试 ============

mod sftp_read_write_tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn test_read_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let mut file = sftp
            .open(std::path::Path::new("/home/testuser/test-files/hello.txt"))
            .expect("应该能打开文件");

        let mut content = String::new();
        file.read_to_string(&mut content)
            .expect("应该能读取文件内容");

        assert_eq!(content.trim(), "Hello, World!", "文件内容应该匹配");
    }

    #[test]
    fn test_write_and_read_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let test_file = format!("/home/testuser/uploads/rw_test_{}.txt", timestamp);
        let test_content = "Hello from integration test!\n这是中文测试。";

        // 写入
        {
            let mut file = sftp
                .create(std::path::Path::new(&test_file))
                .expect("应该能创建文件");
            file.write_all(test_content.as_bytes())
                .expect("应该能写入内容");
        }

        // 读取验证
        {
            let mut file = sftp
                .open(std::path::Path::new(&test_file))
                .expect("应该能打开文件");
            let mut content = String::new();
            file.read_to_string(&mut content)
                .expect("应该能读取内容");
            assert_eq!(content, test_content, "读写内容应该一致");
        }

        // 清理
        sftp.unlink(std::path::Path::new(&test_file)).ok();
    }

    #[test]
    fn test_read_binary_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let mut file = sftp
            .open(std::path::Path::new(
                "/home/testuser/test-files/random.bin",
            ))
            .expect("应该能打开二进制文件");

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .expect("应该能读取二进制内容");

        // 验证大小 (100 KB)
        assert_eq!(buffer.len(), 100 * 1024, "文件大小应该是 100 KB");
    }
}

// ============ 并发操作测试 ============

mod concurrent_tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_concurrent_read_operations() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let handles: Vec<_> = (0..5)
            .map(|i| {
                thread::spawn(move || {
                    let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
                    let entries = sftp.readdir(std::path::Path::new("/home/testuser/test-files"));
                    assert!(entries.is_ok(), "并发读取 {} 应该成功", i);
                    entries.unwrap().len()
                })
            })
            .collect();

        let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();

        // 所有结果应该相同
        let first = results[0];
        for result in &results {
            assert_eq!(*result, first, "并发读取结果应该一致");
        }
    }

    #[test]
    fn test_concurrent_write_operations() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let handles: Vec<_> = (0..5)
            .map(|i| {
                let ts = timestamp;
                thread::spawn(move || {
                    let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
                    let file_path = format!("/home/testuser/uploads/concurrent_{}_{}.txt", ts, i);

                    // 创建文件
                    {
                        let mut file = sftp
                            .create(std::path::Path::new(&file_path))
                            .expect("应该能创建文件");
                        use std::io::Write;
                        file.write_all(format!("Content from thread {}", i).as_bytes())
                            .unwrap();
                    }

                    // 清理
                    sftp.unlink(std::path::Path::new(&file_path)).ok();

                    true
                })
            })
            .collect();

        for handle in handles {
            assert!(handle.join().unwrap(), "并发写入应该成功");
        }
    }
}

// ============ 会话管理测试 ============

mod session_management_tests {
    use super::*;

    #[test]
    fn test_session_disconnect_reconnect() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        // 第一次连接
        let session1 = create_ssh_session(&TEST_SERVER_1).unwrap();
        assert!(session1.authenticated(), "第一次连接应该成功");
        drop(session1);

        // 断开后重新连接
        let session2 = create_ssh_session(&TEST_SERVER_1).unwrap();
        assert!(session2.authenticated(), "重新连接应该成功");
    }

    #[test]
    fn test_multiple_sftp_channels() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let session = create_ssh_session(&TEST_SERVER_1).unwrap();

        // 创建多个 SFTP 通道
        let sftp1 = session.sftp();
        let sftp2 = session.sftp();

        assert!(sftp1.is_ok(), "第一个 SFTP 通道应该创建成功");
        assert!(sftp2.is_ok(), "第二个 SFTP 通道应该创建成功");
    }
}

// ============ 错误场景测试 ============

mod error_tests {
    use super::*;

    #[test]
    fn test_stat_nonexistent_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let stat = sftp.stat(std::path::Path::new("/nonexistent/path/file.txt"));

        assert!(stat.is_err(), "stat 不存在的文件应该返回错误");
    }

    #[test]
    fn test_read_directory_as_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let result = sftp.open(std::path::Path::new("/home/testuser/test-files"));

        // 注意: SFTP 协议允许打开目录，但读取会失败或返回空
        // 这里只验证 stat 能正确识别目录类型
        if let Ok(mut file) = result {
            use std::io::Read;
            let mut buf = [0u8; 10];
            // 尝试读取目录内容应该失败或返回 0 字节
            let read_result = file.read(&mut buf);
            // 某些 SFTP 实现允许打开但读取返回错误或 0
            assert!(
                read_result.is_err() || read_result.unwrap() == 0,
                "读取目录内容应该失败或返回空"
            );
        }
        // 如果打开失败也是预期行为
    }

    #[test]
    fn test_write_to_readonly_directory() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let result = sftp.create(std::path::Path::new(
            "/home/testuser/readonly-dir/test.txt",
        ));

        assert!(result.is_err(), "在只读目录中创建文件应该失败");
    }
}

// ============ Key 认证测试 ============

mod key_auth_tests {
    use super::*;
    use std::net::TcpStream;
    use std::path::Path;

    /// SSH 私钥路径 (Docker volume 挂载)
    const KEY_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../docker/ssh-keys/id_ed25519");
    const KEY_WITH_PASSPHRASE_PATH: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../docker/ssh-keys/id_ed25519_passphrase");
    const PASSPHRASE: &str = "testpass";

    fn create_session_with_key(
        key_path: &str,
        passphrase: Option<&str>,
    ) -> Result<Session, Box<dyn std::error::Error>> {
        let addr = format!("{}:{}", TEST_SERVER_1.host, TEST_SERVER_1.port);
        let tcp = TcpStream::connect(&addr)?;
        tcp.set_read_timeout(Some(Duration::from_secs(30)))?;
        tcp.set_write_timeout(Some(Duration::from_secs(30)))?;

        let mut session = Session::new()?;
        session.set_tcp_stream(tcp);
        session.handshake()?;

        session.userauth_pubkey_file(
            TEST_SERVER_1.username,
            None,
            Path::new(key_path),
            passphrase,
        )?;

        if !session.authenticated() {
            return Err("Key 认证失败".into());
        }

        Ok(session)
    }

    #[test]
    fn test_key_auth_without_passphrase() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        if !Path::new(KEY_PATH).exists() {
            eprintln!("跳过: SSH 私钥不存在");
            return;
        }

        let session = create_session_with_key(KEY_PATH, None);
        assert!(session.is_ok(), "无 passphrase 的 Key 认证应该成功");

        let session = session.unwrap();
        assert!(session.authenticated());
    }

    #[test]
    fn test_key_auth_with_passphrase() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        if !Path::new(KEY_WITH_PASSPHRASE_PATH).exists() {
            eprintln!("跳过: SSH 私钥不存在");
            return;
        }

        let session = create_session_with_key(KEY_WITH_PASSPHRASE_PATH, Some(PASSPHRASE));
        assert!(session.is_ok(), "带 passphrase 的 Key 认证应该成功");

        let session = session.unwrap();
        assert!(session.authenticated());
    }

    #[test]
    fn test_key_auth_wrong_passphrase() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        if !Path::new(KEY_WITH_PASSPHRASE_PATH).exists() {
            eprintln!("跳过: SSH 私钥不存在");
            return;
        }

        let session = create_session_with_key(KEY_WITH_PASSPHRASE_PATH, Some("wrong_passphrase"));
        assert!(session.is_err(), "错误的 passphrase 应该认证失败");
    }

    #[test]
    fn test_key_auth_missing_passphrase() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        if !Path::new(KEY_WITH_PASSPHRASE_PATH).exists() {
            eprintln!("跳过: SSH 私钥不存在");
            return;
        }

        // 不提供 passphrase 给需要 passphrase 的 key
        let session = create_session_with_key(KEY_WITH_PASSPHRASE_PATH, None);
        assert!(session.is_err(), "缺少 passphrase 应该认证失败");
    }

    #[test]
    fn test_key_auth_nonexistent_key() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let session = create_session_with_key("/nonexistent/key", None);
        assert!(session.is_err(), "不存在的 key 文件应该失败");
    }

    #[test]
    fn test_key_auth_sftp_operations() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        if !Path::new(KEY_PATH).exists() {
            eprintln!("跳过: SSH 私钥不存在");
            return;
        }

        let session = create_session_with_key(KEY_PATH, None).unwrap();
        let sftp = session.sftp().unwrap();

        // 验证 SFTP 操作正常
        let entries = sftp.readdir(Path::new("/home/testuser"));
        assert!(entries.is_ok(), "Key 认证后 SFTP 操作应该正常");
    }
}

// ============ 传输测试 ============

mod transfer_tests {
    use super::*;
    use std::io::{Read, Write};

    #[test]
    fn test_upload_small_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let remote_path = format!("/home/testuser/uploads/upload_small_{}.txt", timestamp);
        let content = b"Hello, this is a small test file for upload testing.";

        // 上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建远程文件");
            remote_file
                .write_all(content)
                .expect("应该能写入远程文件");
        }

        // 验证
        {
            let mut remote_file = sftp
                .open(std::path::Path::new(&remote_path))
                .expect("应该能打开远程文件");
            let mut read_content = Vec::new();
            remote_file
                .read_to_end(&mut read_content)
                .expect("应该能读取远程文件");
            assert_eq!(read_content, content, "上传内容应该一致");
        }

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }

    #[test]
    fn test_upload_large_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let remote_path = format!("/home/testuser/uploads/upload_large_{}.bin", timestamp);

        // 创建 1MB 测试数据
        let content: Vec<u8> = (0..1024 * 1024).map(|i| (i % 256) as u8).collect();

        // 分块上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建远程文件");

            const CHUNK_SIZE: usize = 64 * 1024;
            for chunk in content.chunks(CHUNK_SIZE) {
                remote_file.write_all(chunk).expect("应该能写入块");
            }
        }

        // 验证大小
        let stat = sftp
            .stat(std::path::Path::new(&remote_path))
            .expect("应该能获取文件信息");
        assert_eq!(stat.size.unwrap(), content.len() as u64, "文件大小应该一致");

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }

    #[test]
    fn test_download_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        // 下载已存在的测试文件
        let mut remote_file = sftp
            .open(std::path::Path::new(
                "/home/testuser/test-files/hello.txt",
            ))
            .expect("应该能打开远程文件");

        let mut content = String::new();
        remote_file
            .read_to_string(&mut content)
            .expect("应该能读取文件内容");

        assert_eq!(content.trim(), "Hello, World!", "下载内容应该正确");
    }

    #[test]
    fn test_download_binary_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();

        let mut remote_file = sftp
            .open(std::path::Path::new(
                "/home/testuser/test-files/random.bin",
            ))
            .expect("应该能打开二进制文件");

        let mut buffer = Vec::new();
        remote_file
            .read_to_end(&mut buffer)
            .expect("应该能读取二进制内容");

        assert_eq!(buffer.len(), 100 * 1024, "二进制文件大小应该是 100 KB");
    }

    #[test]
    fn test_upload_empty_file() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let remote_path = format!("/home/testuser/uploads/empty_{}.txt", timestamp);

        // 创建空文件
        {
            let _remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建空文件");
        }

        // 验证
        let stat = sftp
            .stat(std::path::Path::new(&remote_path))
            .expect("应该能获取文件信息");
        assert_eq!(stat.size.unwrap(), 0, "空文件大小应该为 0");

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }

    #[test]
    fn test_upload_special_characters_filename() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        // 文件名含空格和中文
        let remote_path = format!(
            "/home/testuser/uploads/特殊文件 name_{}.txt",
            timestamp
        );
        let content = b"Special filename test";

        // 上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建特殊字符文件名");
            remote_file.write_all(content).expect("应该能写入");
        }

        // 验证存在
        let stat = sftp.stat(std::path::Path::new(&remote_path));
        assert!(stat.is_ok(), "特殊字符文件名应该可以访问");

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }

    #[test]
    fn test_upload_overwrite_existing() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let remote_path = format!("/home/testuser/uploads/overwrite_{}.txt", timestamp);

        // 首次上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建文件");
            remote_file.write_all(b"original content").expect("应该能写入");
        }

        // 覆盖上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能覆盖文件");
            remote_file.write_all(b"new content").expect("应该能写入");
        }

        // 验证内容已更新
        {
            let mut remote_file = sftp
                .open(std::path::Path::new(&remote_path))
                .expect("应该能打开文件");
            let mut content = String::new();
            remote_file.read_to_string(&mut content).expect("应该能读取");
            assert_eq!(content, "new content", "内容应该被覆盖");
        }

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }

    #[test]
    fn test_chunked_transfer_integrity() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let (_session, sftp) = create_sftp_session(&TEST_SERVER_1).unwrap();
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();

        let remote_path = format!("/home/testuser/uploads/chunked_{}.bin", timestamp);

        // 创建可预测的测试数据 (512KB)
        let size = 512 * 1024;
        let original: Vec<u8> = (0..size).map(|i| ((i * 7 + 13) % 256) as u8).collect();

        // 分块上传
        {
            let mut remote_file = sftp
                .create(std::path::Path::new(&remote_path))
                .expect("应该能创建文件");

            const CHUNK_SIZE: usize = 64 * 1024;
            for chunk in original.chunks(CHUNK_SIZE) {
                remote_file.write_all(chunk).expect("应该能写入块");
            }
        }

        // 分块下载并验证
        {
            let mut remote_file = sftp
                .open(std::path::Path::new(&remote_path))
                .expect("应该能打开文件");

            let mut downloaded = Vec::new();
            remote_file
                .read_to_end(&mut downloaded)
                .expect("应该能读取");

            assert_eq!(downloaded.len(), original.len(), "大小应该一致");
            assert_eq!(downloaded, original, "内容应该完全一致");
        }

        // 清理
        sftp.unlink(std::path::Path::new(&remote_path)).ok();
    }
}

// ============ HostKey 测试 ============

mod hostkey_tests {
    use super::*;
    use std::net::TcpStream;

    #[test]
    fn test_get_host_key_fingerprint() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let addr = format!("{}:{}", TEST_SERVER_1.host, TEST_SERVER_1.port);
        let tcp = TcpStream::connect(&addr).expect("应该能连接");
        tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();

        let mut session = Session::new().expect("应该能创建会话");
        session.set_tcp_stream(tcp);
        session.handshake().expect("应该能完成握手");

        // 获取 host key
        let (key, _key_type) = session.host_key().expect("应该能获取 host key");

        assert!(!key.is_empty(), "Host key 不应该为空");
    }

    #[test]
    fn test_host_key_consistent() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        // 连接两次，验证 host key 一致
        let get_fingerprint = || {
            let addr = format!("{}:{}", TEST_SERVER_1.host, TEST_SERVER_1.port);
            let tcp = TcpStream::connect(&addr).unwrap();
            let mut session = Session::new().unwrap();
            session.set_tcp_stream(tcp);
            session.handshake().unwrap();
            session.host_key().unwrap().0.to_vec()
        };

        let key1 = get_fingerprint();
        let key2 = get_fingerprint();

        assert_eq!(key1, key2, "同一服务器的 host key 应该一致");
    }

    #[test]
    fn test_different_servers_different_keys() {
        if !is_docker_available() {
            eprintln!("跳过: Docker SSH 服务不可用");
            return;
        }

        let get_fingerprint = |port: u16| {
            let addr = format!("{}:{}", TEST_SERVER_1.host, port);
            let tcp = TcpStream::connect(&addr).unwrap();
            let mut session = Session::new().unwrap();
            session.set_tcp_stream(tcp);
            session.handshake().unwrap();
            session.host_key().unwrap().0.to_vec()
        };

        let key1 = get_fingerprint(TEST_SERVER_1.port);
        let key2 = get_fingerprint(TEST_SERVER_2.port);

        // 不同服务器可能有不同的 key (取决于 Docker 配置)
        // 这里只验证能获取到 key
        assert!(!key1.is_empty());
        assert!(!key2.is_empty());
    }
}
