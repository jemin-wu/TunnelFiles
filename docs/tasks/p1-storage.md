## 阶段 P1: 基础设施

### P1-1: 实现统一错误模型 AppError
- **状态**: [x]
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P0-5
- **描述**: 定义统一错误类型和错误码枚举
- **产出**:
  - 文件: `src-tauri/src/models/error.rs`
  - 错误码: AUTH_FAILED, HOSTKEY_MISMATCH, TIMEOUT, NETWORK_LOST, NOT_FOUND, PERMISSION_DENIED, DIR_NOT_EMPTY, LOCAL_IO_ERROR, REMOTE_IO_ERROR, CANCELED, INVALID_ARGUMENT
  - 实现 `From<ssh2::Error>`, `From<std::io::Error>` 等转换
  - 实现 `Serialize` 用于 IPC 传输
- **验收标准**:
  - 功能:
    - [x] 所有错误码枚举完整定义
    - [x] 序列化为 JSON `{code, message, detail?, retryable?}`
    - [x] `From` trait 覆盖: ssh2::Error, std::io::Error, rusqlite::Error
  - 错误处理:
    - [x] 每个错误码有明确的 `retryable` 标识
    - [x] `message` 面向用户，`detail` 面向开发者
  - 可维护:
    - [x] 错误码使用 `#[serde(rename)]` 确保序列化一致性
    - [x] 提供便捷构造函数 (如 `AppError::auth_failed()`)
  - 测试:
    - [x] 序列化输出格式测试
    - [x] From trait 转换测试
- **备注**:

---

### P1-2: 实现日志模块
- **状态**: [x]
- **类型**: 后端
- **等级**: L1 (基础层)
- **依赖**: P0-5
- **描述**: 配置 tracing 日志系统
- **产出**:
  - 文件: `src-tauri/src/utils/logging.rs`
  - 日志级别: error/warn/info/debug
  - 输出到文件: `~/.tunnelfiles/logs/`
  - 导出函数: `export_diagnostic_package()` 打包日志+配置摘要
- **验收标准**:
  - 功能:
    - [x] 日志按级别过滤 (error/warn/info/debug)
    - [x] 日志写入 `~/.tunnelfiles/logs/app.log`
    - [x] 日志轮转: 单文件 ≤10MB，保留最近 5 个
    - [x] `export_diagnostic_package()` 生成 zip 包
  - 安全:
    - [x] 诊断包自动脱敏 (密码、私钥路径等)
    - [x] 日志中敏感信息用 `***` 替代
  - 性能:
    - [x] 日志写入异步，不阻塞主线程
  - 可维护:
    - [x] 日志格式: `[时间] [级别] [模块] 消息`
    - [x] 结构化日志支持 (tracing span)
- **备注**:

---

### P1-3: 实现 SQLite 存储模块
- **状态**: [x]
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P1-1
- **描述**: 初始化 SQLite，创建表结构
- **产出**:
  - 文件: `src-tauri/src/services/storage_service.rs`
  - 数据库路径: `~/.tunnelfiles/data.db`
  - 表结构:
    ```sql
    profiles (id, name, host, port, username, auth_type, password_ref, private_key_path, passphrase_ref, initial_path, created_at, updated_at)
    recent_connections (id, profile_id, connected_at)
    transfer_history (id, task_id, direction, local_path, remote_path, status, error, created_at, completed_at) -- 可选
    ```
  - 迁移机制: 版本号 + 迁移脚本
- **验收标准**:
  - 功能:
    - [x] 数据库文件创建于 `~/.tunnelfiles/data.db`
    - [x] 所有表结构正确创建
    - [x] 迁移机制: user_version 记录版本号
    - [x] CRUD 操作正常 (profile_list/get/upsert/delete)
  - 安全:
    - [x] 使用参数化查询，防止 SQL 注入
    - [x] 数据库文件权限 600
    - [x] 不存储明文密码 (仅存 password_ref)
  - 性能:
    - [x] 关键字段建立索引 (id, profile_id)
    - [x] 连接池或单例模式，避免频繁打开
  - 错误处理:
    - [x] 数据库损坏时有明确错误提示
    - [x] 迁移失败时回滚
  - 测试:
    - [x] CRUD 操作单元测试
    - [x] 迁移升级测试
- **备注**:

---

### P1-4: 实现 JSON 配置存储
- **状态**: [x]
- **类型**: 后端
- **等级**: L1 (基础层)
- **依赖**: P1-1
- **描述**: 实现 settings.json 读写（原子写入）
- **产出**:
  - 文件路径: `~/.tunnelfiles/settings.json`
  - Settings 结构:
    ```rust
    struct Settings {
        default_download_dir: Option<String>,
        max_concurrent_transfers: u8,  // 1-6, 默认 3
        connection_timeout_secs: u64,  // 默认 30
        transfer_retry_count: u8,      // 默认 2
        log_level: String,             // error/warn/info/debug
    }
    ```
  - 原子写入: 写临时文件 → rename
- **验收标准**:
  - 功能:
    - [x] 首次运行自动创建默认配置
    - [x] 读取配置正确解析所有字段
    - [x] 部分更新 (patch) 不影响其他字段
    - [x] 配置值范围校验 (如 max_concurrent: 1-6)
  - 安全:
    - [x] 配置文件权限 600
    - [x] 无敏感信息存储于此文件
  - 性能:
    - [x] 配置缓存，避免频繁读取文件
  - 错误处理:
    - [x] 文件损坏时降级使用默认值
    - [x] 原子写入: 先写临时文件再 rename
    - [x] 字段缺失时使用默认值 (serde default)
  - 测试:
    - [x] 读写往返测试
    - [x] 损坏文件恢复测试
- **备注**:

---

### P1-5: 实现系统安全存储接口
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 安全关键)
- **依赖**: P1-1
- **描述**: 封装 keyring 库，实现凭据安全存储
- **产出**:
  - 文件: `src-tauri/src/services/security_service.rs` (部分)
  - 函数:
    - `store_secret(key: &str, secret: &str) -> Result<()>`
    - `read_secret(key: &str) -> Result<Option<String>>`
    - `delete_secret(key: &str) -> Result<()>`
  - key 格式: `tunnelfiles:{profile_id}:password` 或 `tunnelfiles:{profile_id}:passphrase`
- **验收标准**:
  - 功能:
    - [x] macOS Keychain 存取正常
    - [x] Windows Credential Manager 存取正常 (跨平台)
    - [x] Linux secret-service 存取正常 (跨平台)
    - [x] 密钥不存在时返回 None (非错误)
    - [x] 删除不存在的密钥静默成功
  - 安全:
    - [x] 密码绝不以明文写入任何文件
    - [x] 密钥名称不可预测 (含 profile_id)
    - [x] 凭据删除时同步清理引用
    - [x] 操作失败不泄露凭据内容到日志
  - 错误处理:
    - [x] Keychain 被锁定时明确提示
    - [x] 权限不足时返回 PERMISSION_DENIED
    - [x] 系统不支持时有降级策略说明
  - 测试:
    - [x] 存储-读取-删除完整流程测试
    - [x] 并发存取测试
    - [x] 跨平台 CI 测试
- **备注**:

---

### P1-6: 前端错误处理与 Toast 组件
- **状态**: [x]
- **类型**: 前端
- **等级**: L2 (标准层)
- **依赖**: P0-4
- **描述**: 实现前端统一错误处理和提示
- **产出**:
  - `src/components/ui/Toast.tsx` - Toast 组件
  - `src/hooks/useToast.ts` - Toast 状态管理
  - `src/lib/errorHandler.ts` - 解析 AppError，返回用户友好提示
  - 根据 `retryable` 显示重试按钮
- **验收标准**:
  - 功能:
    - [x] Toast 支持 success/error/warning/info/loading 类型
    - [x] 错误码到用户友好消息的映射完整
    - [x] `retryable=true` 时显示重试按钮
    - [x] 重试按钮点击触发回调
    - [x] Toast 自动消失 (成功 3s, 错误 5s)
  - 边界条件:
    - [x] 未知错误码显示通用错误消息
    - [x] 多个 Toast 堆叠显示
    - [x] loading Toast 手动关闭
  - 可维护:
    - [x] 错误消息支持 i18n 扩展
    - [x] Toast 样式符合设计规范
  - 测试:
    - [x] 各类型 Toast 渲染测试
    - [x] 重试回调触发测试
- **备注**:

---

