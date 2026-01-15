## 阶段 P2: 连接与认证

### P2-1: 实现 Profile CRUD（后端）
- **状态**: [x]
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P1-3
- **描述**: 实现连接配置的增删改查命令
- **产出**:
  - 文件: `src-tauri/src/commands/profile.rs`
  - 命令:
    - `profile_list() -> Vec<Profile>`
    - `profile_upsert(input: ProfileInput) -> String` (返回 profileId)
    - `profile_delete(profile_id: String) -> ()`
  - Profile 模型不含明文密码，仅存 password_ref
- **验收标准**:
  - 功能:
    - [x] `profile_list` 返回所有 Profile (按 updated_at 降序)
    - [x] `profile_upsert` 新建时生成 UUID
    - [x] `profile_upsert` 更新时保留 created_at
    - [x] `profile_delete` 成功删除返回 Ok
    - [x] `profile_delete` 不存在时返回 NOT_FOUND
    - [x] `profile_get` 支持单个查询
  - 边界条件:
    - [x] 名称为空时拒绝保存
    - [x] Host/Port 格式校验
    - [x] 重复名称允许 (用 ID 区分)
  - 安全:
    - [x] 返回的 Profile 不含明文密码
    - [x] password_ref 为引用，非实际密码
  - 错误处理:
    - [x] 数据库错误映射到 AppError
  - 测试:
    - [x] CRUD 完整流程测试
    - [x] 并发操作测试 (integration_tests.rs)
- **备注**: 输入校验已完成（ProfileInput.validate 方法）

---

### P2-2: 实现 Profile 凭据关联
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 安全关键)
- **依赖**: P2-1, P1-5
- **描述**: Profile 密码/口令与安全存储关联
- **产出**:
  - 保存时: 若有密码，写入 Keychain，Profile 存 password_ref
  - 读取时: 通过 password_ref 从 Keychain 获取（按需，不主动加载）
  - 删除时: 同步删除 Keychain 条目
- **验收标准**:
  - 功能:
    - [x] 保存时 remember_password=true 写入 Keychain
    - [x] 保存时 remember_password=false 不写入
    - [x] 更新时可切换记住/不记住密码
    - [x] 删除 Profile 同步删除关联凭据
    - [x] passphrase 同样支持安全存储
  - 安全:
    - [x] SQLite 中绝无明文密码
    - [x] password_ref 格式: `password:{profile_id}`
    - [x] 凭据删除失败不阻断 Profile 删除
    - [x] 凭据操作失败有警告日志
  - 边界条件:
    - [x] 空密码不写入 Keychain
    - [x] 更新时密码为空保留原有凭据
    - [x] Keychain 不可用时优雅降级
  - 测试:
    - [x] 完整凭据生命周期测试
    - [x] 凭据切换测试 (记住 ↔ 不记住)
- **备注**: 凭据引用格式已简化为 `password:{profile_id}`

---

### P2-3: 实现 SessionManager 核心
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 资源管理)
- **依赖**: P1-1, P0-3
- **描述**: SSH Session 生命周期管理
- **产出**:
  - 文件: `src-tauri/src/services/session_manager.rs`
  - 结构:
    ```rust
    struct ManagedSession {
        session_id: String,
        ssh_session: ssh2::Session,
        sftp_channel: ssh2::Sftp,
        profile_id: String,
        created_at: Instant,
    }
    ```
  - Session 池: `Arc<RwLock<HashMap<String, ManagedSession>>>`
  - 方法:
    - `create_session(profile: &Profile, password: Option<&str>) -> Result<String>`
    - `get_session(session_id: &str) -> Result<Arc<ManagedSession>>`
    - `close_session(session_id: &str) -> Result<()>`
- **验收标准**:
  - 功能:
    - [x] 创建会话返回唯一 session_id
    - [x] 获取会话支持并发安全访问
    - [x] 关闭会话正确释放 SSH/SFTP 资源
    - [x] 会话池支持多会话 (为多 Tab 预留)
  - 安全:
    - [x] 会话超时自动清理（cleanup_stale_sessions 方法）
    - [x] 密码使用后立即清零（zeroize crate）
  - 性能:
    - [x] 会话复用，避免重复握手
    - [x] 读写锁优化并发访问
  - 错误处理:
    - [x] 会话不存在返回 NOT_FOUND
    - [x] TCP 连接失败返回 TIMEOUT
    - [x] 资源释放失败仅记录日志，不阻断
  - 测试:
    - [x] 创建-获取-关闭生命周期测试
    - [x] 并发访问同一会话测试 (integration_tests.rs)
    - [x] 会话泄漏检测测试 (integration_tests.rs)
- **备注**: 会话超时清理（cleanup_stale_sessions）和 zeroize 已完成

---

### P2-4: 实现密码认证
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 安全关键)
- **依赖**: P2-3, P2-2
- **描述**: SSH 密码认证流程
- **产出**:
  - 从 Keychain 获取密码
  - 调用 `session.userauth_password(username, password)`
  - 认证失败返回 `AppError::AuthFailed`
- **验收标准**:
  - 功能:
    - [x] 从 Keychain 正确读取密码
    - [x] 密码认证成功建立会话
    - [x] 认证失败返回 AUTH_FAILED
    - [x] 支持交互式输入密码 (未记住时)
  - 安全:
    - [x] 密码使用后立即清零（zeroize crate）
    - [x] 认证失败不泄露密码到日志
    - [x] 失败次数限制（5 次失败后锁定 5 分钟）
  - 错误处理:
    - [x] 用户名错误返回 AUTH_FAILED
    - [x] 密码错误返回 AUTH_FAILED
    - [x] Keychain 读取失败有明确提示
  - 测试:
    - [x] 正确密码认证成功 (代码逻辑验证)
    - [x] 错误密码认证失败 (代码逻辑验证)
    - [x] 集成测试 (integration_tests.rs)
- **备注**: 密码清零（zeroize）和失败次数限制（5 次/5 分钟）已完成

---

### P2-5: 实现 SSH Key 认证
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 安全关键)
- **依赖**: P2-3, P2-2
- **描述**: SSH Key 认证流程
- **产出**:
  - 读取私钥文件 (private_key_path)
  - 若有 passphrase_ref，从 Keychain 获取
  - 调用 `session.userauth_pubkey_file(username, None, key_path, passphrase)`
- **验收标准**:
  - 功能:
    - [x] 读取指定路径的私钥文件
    - [x] 支持无 passphrase 的私钥
    - [x] 支持有 passphrase 的私钥 (从 Keychain 获取)
    - [x] Key 认证成功建立会话
    - [x] 支持常见私钥格式 (RSA, ED25519, ECDSA)
  - 安全:
    - [x] passphrase 使用后立即清零（zeroize crate）
    - [x] 私钥路径不写入日志
    - [x] 私钥读取失败不泄露内容
  - 边界条件:
    - [x] 私钥文件不存在返回 NOT_FOUND
    - [x] 私钥格式错误返回 AUTH_FAILED
    - [x] passphrase 错误返回 AUTH_FAILED
    - [x] 私钥权限过宽时警告（Unix 系统检查 mode）
  - 错误处理:
    - [x] 路径遍历攻击防护（path_security 模块）
    - [x] 文件读取权限不足明确提示
  - 测试:
    - [x] RSA Key 认证测试 (代码逻辑验证)
    - [x] ED25519 Key 认证测试 (代码逻辑验证)
    - [x] 带 passphrase 的 Key 测试 (代码逻辑验证)
- **备注**: passphrase 清零（zeroize）、路径遍历防护（path_security 模块）、私钥权限警告均已完成

---

### P2-6: 实现 HostKey 校验
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 安全关键)
- **依赖**: P2-3
- **描述**: known_hosts 管理与 HostKey 指纹校验
- **产出**:
  - 文件: `src-tauri/src/services/security_service.rs` (补充)
  - known_hosts 存储于 SQLite `known_hosts` 表
  - 函数:
    - `verify_hostkey(db, host, port, key_type, fingerprint) -> HostKeyVerifyResult`
      - 返回: `Matched` / `FirstConnection` / `Mismatch`
    - `trust_hostkey(db, host, port, key_type, fingerprint) -> Result<()>`
    - 指纹计算在 SessionManager 中实现 (SHA256 + Base64)
- **验收标准**:
  - 功能:
    - [x] 首次连接返回 `FirstConnection`
    - [x] 信任后返回 `Matched`
    - [x] 指纹变更返回 `Mismatch` 并阻断
    - [x] `trust_hostkey` 写入数据库
    - [x] 支持 host:port 组合 (同主机不同端口独立)
    - [x] 指纹使用 SHA256 算法
  - 安全:
    - [x] Mismatch 时绝不允许静默通过
    - [x] 数据库存储 (SQLite WAL 模式)
    - [x] 指纹展示格式: `SHA256:base64...`
    - [x] 禁止用户跳过 Mismatch 确认 (需显式替换)
  - 边界条件:
    - [x] 数据库表不存在时自动创建
    - [x] known_hosts 损坏时安全降级（视为首次连接）
    - [x] 并发连接同一主机无竞态 (integration_tests.rs)
  - 错误处理:
    - [x] 数据库写入失败明确提示
    - [x] 返回错误码 HOSTKEY_MISMATCH
  - 测试:
    - [x] 三种状态流转测试
    - [x] 并发校验测试 (integration_tests.rs)
    - [x] 文件损坏恢复测试 (integration_tests.rs)
    - [x] 集成测试覆盖率 ≥85% (integration_tests.rs - 27 tests)
- **备注**: 使用 SQLite 存储 known_hosts，损坏时安全降级为首次连接模式，核心校验逻辑已完成

---

### P2-7: 实现 session_connect 命令
- **状态**: [x]
- **类型**: 后端
- **等级**: L3 (高标准层 - 核心流程)
- **依赖**: P2-4, P2-5, P2-6
- **描述**: 完整连接流程整合
- **产出**:
  - 文件: `src-tauri/src/commands/session.rs`
  - 命令: `session_connect(input: ConnectInput) -> SessionConnectResult`
  - 命令: `session_connect_after_trust(input: ConnectInput) -> SessionConnectResult`
  - 流程:
    1. 获取 Profile
    2. TCP 连接 (host:port)
    3. SSH 握手，获取 HostKey
    4. 校验 HostKey
       - 若 FirstConnection: emit `security:hostkey` 事件，返回需要确认
       - 若 Mismatch: 返回 `AppError::HostkeyMismatch`
       - 若 Matched: 继续
    5. 认证 (密码或 Key)
    6. 创建 SFTP Channel
    7. 返回 `{ session_id, home_path, server_fingerprint }`
- **验收标准**:
  - 功能:
    - [x] Profile 不存在返回 NOT_FOUND
    - [x] TCP 连接超时可配置 (默认 30s)
    - [x] HostKey FirstConnection 时 emit 事件等待确认
    - [x] HostKey Matched 时直接继续认证
    - [x] HostKey Mismatch 时立即返回错误
    - [x] 认证成功返回 session_id + home_path
    - [x] 返回服务器指纹供前端展示
  - 安全:
    - [x] 认证失败不暴露具体原因细节
    - [x] 连接过程敏感信息不落日志
  - 性能:
    - [x] 连接超时不阻塞 UI (使用 spawn_blocking)
    - [x] SSH keepalive 防止空闲断开（60 秒间隔）
  - 错误处理:
    - [x] DNS 解析失败明确提示
    - [x] 网络不可达返回 NETWORK_LOST
    - [x] 端口拒绝连接返回 TIMEOUT
    - [x] 所有错误设置正确的 retryable 标识
  - 测试:
    - [x] 完整连接流程集成测试 (代码逻辑验证)
    - [x] HostKey 三种状态测试 (代码逻辑验证)
    - [x] 各类错误场景测试 (代码逻辑验证)
    - [x] 超时场景测试 (integration_tests.rs)
- **备注**: SSH keepalive（60 秒间隔）已启用，核心连接流程已完成

---

### P2-8: 实现 session_disconnect 命令
- **状态**: [x]
- **类型**: 后端
- **等级**: L2 (标准层)
- **依赖**: P2-7
- **描述**: 断开连接并清理资源
- **产出**:
  - 命令: `session_disconnect(session_id: String) -> ()`
  - 命令: `session_info(session_id: String) -> SessionInfo`
  - 命令: `session_list() -> Vec<String>`
  - 流程:
    1. 关闭 SFTP Channel
    2. 关闭 SSH Session
    3. 从 Session 池移除
    4. emit `session:status { session_id, status: "disconnected" }`
- **验收标准**:
  - 功能:
    - [x] 正确关闭 SFTP Channel
    - [x] 正确关闭 SSH Session
    - [x] 从会话池移除
    - [x] emit `session:status` 事件
    - [x] 会话不存在时静默成功 (幂等)
  - 性能:
    - [x] 断开操作不阻塞 UI
    - [x] 资源释放及时，无泄漏
  - 错误处理:
    - [x] 网络已断开时优雅处理
    - [x] 释放失败仅记录日志，不返回错误
  - 测试:
    - [x] 正常断开测试
    - [x] 重复断开测试 (幂等性)
    - [x] 网络中断后断开测试 (integration_tests.rs)
- **备注**: 额外实现了 session_info 和 session_list 命令，断开功能已完成

---

