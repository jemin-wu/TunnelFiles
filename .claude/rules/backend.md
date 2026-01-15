---
paths:
  - "src-tauri/**/*.rs"
---

# 后端规范

## 技术栈

- Rust 2021 edition + Tauri 2
- ssh2 (SSH/SFTP)
- tokio (异步运行时)
- rusqlite (SQLite)
- keyring (系统安全存储)
- tracing (结构化日志)

## 命名规范

- 模块/文件: snake_case (`storage_service.rs`)
- 函数/变量: snake_case (`list_dir`)
- 结构体/枚举: PascalCase (`TransferTask`)
- 常量: UPPER_SNAKE_CASE (`DEFAULT_PORT`)

## 目录结构

- `commands/` - IPC 命令入口，一个文件对应一个领域
- `services/` - 业务逻辑，单一职责
- `models/` - 数据结构，与前端 `types/` 对应
- `utils/` - 工具函数

## 错误处理

使用统一错误码:
- `AUTH_FAILED` / `HOSTKEY_MISMATCH` / `TIMEOUT` / `NETWORK_LOST`
- `NOT_FOUND` / `PERMISSION_DENIED` / `DIR_NOT_EMPTY`
- `LOCAL_IO_ERROR` / `REMOTE_IO_ERROR` / `CANCELED`

## 事件推送

- `transfer:progress` - 传输进度
- `transfer:status` - 任务状态
- `session:status` - 会话状态
- `security:hostkey` - HostKey 确认
