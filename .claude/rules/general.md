# 通用规范

## 注释原则

- 仅在关键位置添加注释（复杂算法、非显而易见的业务逻辑）
- 命名保持自解释，避免冗余注释
- 注释简短有意义，说明"为什么"而非"是什么"
- 禁止提交注释掉的代码

## 项目架构

- 前端: React 19 + Vite 7 + TailwindCSS 4 + TypeScript 5.8
- 后端: Rust 2021 + Tauri 2
- 通信: Tauri IPC (invoke/listen)

## IPC 命令前缀

- `profile_*` - 连接配置
- `session_*` - SSH 会话
- `sftp_*` - 文件操作
- `transfer_*` - 传输队列
- `settings_*` - 用户设置
- `security_*` - 安全相关

## 数据存储

- SQLite: 连接配置、历史记录
- JSON: 用户偏好设置
- 系统钥匙串: 密码/口令（通过 `*Ref` 字段引用）
