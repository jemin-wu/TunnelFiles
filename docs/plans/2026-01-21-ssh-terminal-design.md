# SSH 终端功能设计文档

## 一、需求总结

- **完整交互式终端** - 支持 vim、top、tmux 等交互式程序（PTY 支持）
- **独立标签页** - 终端和文件管理器是同级页面，通过标签切换
- **单终端模式** - 每个 SSH 连接只能开一个终端
- **按需创建** - 用户首次进入终端标签时创建 PTY 会话，之后保持直到断开连接
- **复用 SSH 连接** - 在现有 ManagedSession 上开新的 PTY channel
- **前端终端模拟器** - 使用原生 `@xterm/xterm` 库

---

## 二、架构概览

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │ 连接管理页   │    │ 文件管理页   │    │  终端页     │ │
│  └─────────────┘    └─────────────┘    └─────────────┘ │
│                                              │          │
│                                        xterm.js        │
│                                              │          │
├──────────────────────────────────────────────┼──────────┤
│                    Tauri IPC                 │          │
│              invoke() ↑↓ emit()              │          │
├──────────────────────────────────────────────┼──────────┤
│                      Backend                 │          │
│  ┌─────────────────────────────────────┐     │          │
│  │           SessionManager            │     │          │
│  │  ┌─────────────────────────────┐    │     │          │
│  │  │      ManagedSession         │    │     │          │
│  │  │  ├── sftp: Sftp            │    │     │          │
│  │  │  └── terminal: Option<Pty> │◄───┼─────┘          │
│  │  └─────────────────────────────┘    │               │
│  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## 三、后端设计

### 3.1 核心数据结构

```rust
// src-tauri/src/services/terminal_manager.rs

pub struct ManagedTerminal {
    pub terminal_id: String,
    pub session_id: String,
    pub channel: Arc<RwLock<ssh2::Channel>>,  // PTY channel
    pub cols: u16,
    pub rows: u16,
    pub created_at: Instant,
    pub last_activity: RwLock<Instant>,
}

pub struct TerminalManager {
    terminals: RwLock<HashMap<String, Arc<ManagedTerminal>>>,
    session_to_terminal: RwLock<HashMap<String, String>>,  // 保证单终端
}
```

### 3.2 IPC 命令

| 命令 | 说明 |
|------|------|
| `terminal_open` | 打开终端（已存在则返回现有实例） |
| `terminal_input` | 写入用户输入（Base64 编码） |
| `terminal_resize` | 调整尺寸 |
| `terminal_close` | 关闭终端 |
| `terminal_get_by_session` | 查询是否已有终端 |

### 3.3 事件推送

| 事件 | Payload | 说明 |
|------|---------|------|
| `terminal:output` | `{ terminalId, data }` | 终端输出（Base64，50ms 节流） |
| `terminal:status` | `{ terminalId, status, message? }` | 状态变化 |

### 3.4 关键实现细节

- PTY 类型：`xterm-256color`（支持全彩色）
- 输出节流：50ms 间隔或 4KB 缓冲区
- 线程模型：独立线程读取 PTY 输出，通过事件推送到前端

---

## 四、前端设计

### 4.1 目录结构

```
src/
├── types/terminal.ts          # 类型定义
├── lib/terminal.ts            # IPC 调用封装
├── hooks/
│   ├── useTerminal.ts         # 终端生命周期管理
│   └── useTerminalEvents.ts   # 事件监听
└── components/terminal/
    └── Terminal.tsx           # XTerm 封装组件
```

### 4.2 核心 Hook - useTerminal

```typescript
interface UseTerminalReturn {
  terminalInfo: TerminalInfo | null;
  isOpening: boolean;
  error: unknown;
  open: () => Promise<void>;
  close: () => Promise<void>;
  writeInput: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}
```

### 4.3 XTerm 组件

- 使用 `@xterm/addon-fit` 自动适配容器尺寸
- 监听 `window.resize` 事件自动调整
- 主题：深色背景（#1e1e1e）

### 4.4 依赖

```bash
pnpm add @xterm/xterm @xterm/addon-fit
```

---

## 五、数据流

```
用户输入 → XTerm.onData → useTerminal.writeInput → IPC terminal_input
         → 后端 channel.write → 远程 shell

远程输出 → 后端 channel.read → emit terminal:output
         → useTerminalEvents → XTerm.write → 渲染
```

---

## 六、错误处理

| 场景 | 处理方式 |
|------|---------|
| 会话断开 | PTY 读取线程退出，推送 `terminal:status` (disconnected) |
| 重复打开 | 返回现有 `terminalId`，不创建新实例 |
| 网络中断 | PTY read() 返回错误，推送 disconnected 事件 |
| Base64 解码失败 | 返回 `INVALID_ARGUMENT` 错误 |

---

## 七、验收标准

- [ ] 可运行 `vim` 并正常编辑保存
- [ ] 可运行 `top`/`htop` 实时刷新
- [ ] 可运行 `tmux` 分屏操作
- [ ] 窗口尺寸调整时终端自动适配
- [ ] 会话断开时显示 disconnected 状态
- [ ] 同一 session 只允许一个终端
- [ ] 中文输入/输出正常显示

---

## 八、文件清单

### 新增文件

**后端**
- `src-tauri/src/services/terminal_manager.rs`
- `src-tauri/src/commands/terminal.rs`

**前端**
- `src/types/terminal.ts`
- `src/lib/terminal.ts`
- `src/hooks/useTerminal.ts`
- `src/hooks/useTerminalEvents.ts`
- `src/components/terminal/Terminal.tsx`
- `src/components/terminal/index.ts`

### 修改文件

- `src-tauri/src/lib.rs` - 注册 TerminalManager 和命令
- `src-tauri/src/services/mod.rs` - 导出 terminal_manager
- `src-tauri/src/commands/mod.rs` - 导出 terminal 模块
- 页面文件（由 designer agent 决定具体实现）

---

## 九、技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| PTY 类型 | `xterm-256color` | 支持全彩色，兼容性最佳 |
| 输出节流 | 50ms 或 4KB | 平衡性能与实时性 |
| Base64 编码 | 是 | Tauri IPC 不支持二进制 |
| 单终端限制 | 是 | 简化状态管理，MVP 友好 |
| 按需创建 | 是 | 节省资源 |
| 生命周期 | 跟随 session | session 断开时自动关闭 |

---

## 十、备注

页面布局设计由 designer agent 后续完成。
