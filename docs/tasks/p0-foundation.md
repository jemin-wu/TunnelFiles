## 阶段 P0: 项目初始化

### P0-1: 初始化 Tauri 2 项目
- **状态**: [x]
- **类型**: 后端 + 配置
- **依赖**: 无
- **描述**: 使用 `pnpm create tauri-app` 创建 Tauri 2 项目
- **产出**:
  - 项目目录结构
  - `tauri.conf.json` 基础配置
  - `Cargo.toml` 依赖配置
- **验收**: `pnpm tauri dev` 可启动空白应用
- **备注**:

---

### P0-2: 配置前端开发环境
- **状态**: [x]
- **类型**: 前端 + 配置
- **依赖**: P0-1
- **描述**: 配置 React + TypeScript + Vite + TailwindCSS + ESLint/Prettier
- **产出**:
  - `vite.config.ts`
  - `tsconfig.json`
  - `tailwind.config.js`
  - `.eslintrc.js` / `.prettierrc`
- **验收**: 前端热更新正常，样式生效
- **备注**:

---

### P0-3: 添加 Rust 核心依赖
- **状态**: [x]
- **类型**: 后端
- **依赖**: P0-1
- **描述**: 在 Cargo.toml 添加核心依赖
- **产出**:
  ```toml
  ssh2 = "0.9"
  tokio = { version = "1", features = ["full"] }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  rusqlite = { version = "0.31", features = ["bundled"] }
  uuid = { version = "1", features = ["v4"] }
  thiserror = "1"
  tracing = "0.1"
  tracing-subscriber = "0.3"
  keyring = "2"
  ```
- **验收**: `cargo build` 编译通过
- **备注**:

---

### P0-4: 定义前端 IPC 类型
- **状态**: [x]
- **类型**: 前端
- **依赖**: P0-2
- **描述**: 定义 TypeScript 类型，与后端接口对齐
- **产出**:
  - `src/types/profile.ts` - Profile, ProfileInput
  - `src/types/file.ts` - FileEntry, SortSpec
  - `src/types/transfer.ts` - TransferTask, TransferStatus
  - `src/types/error.ts` - AppError, ErrorCode
  - `src/types/settings.ts` - Settings
  - `src/types/events.ts` - 事件 payload 类型
- **验收**: 类型定义完整，无 any
- **备注**:

---

### P0-5: 搭建 Rust 模块骨架
- **状态**: [x]
- **类型**: 后端
- **依赖**: P0-3
- **描述**: 创建后端模块目录结构和空文件
- **产出**:
  ```
  src-tauri/src/
  ├── lib.rs
  ├── commands/
  │   ├── mod.rs
  │   ├── profile.rs
  │   ├── session.rs
  │   ├── sftp.rs
  │   ├── transfer.rs
  │   ├── settings.rs
  │   └── security.rs
  ├── services/
  │   ├── mod.rs
  │   ├── session_manager.rs
  │   ├── sftp_service.rs
  │   ├── transfer_manager.rs
  │   ├── security_service.rs
  │   └── storage_service.rs
  ├── models/
  │   ├── mod.rs
  │   ├── profile.rs
  │   ├── file_entry.rs
  │   ├── transfer_task.rs
  │   └── error.rs
  └── utils/
      ├── mod.rs
      └── logging.rs
  ```
- **验收**: 模块引用正确，编译通过
- **备注**:

---

