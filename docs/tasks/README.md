# TunnelFiles 任务拆分文档

> **用途**：供 AI Agent 阅读和执行的任务清单
> **状态说明**：`[ ]` 待开始 | `[x]` 已完成 | `[-]` 进行中 | `[!]` 阻塞/问题

---

## 项目元信息

```yaml
project: TunnelFiles
type: 跨平台桌面 SSH/SFTP 文件管理客户端
tech_stack:
  frontend: React + TypeScript + TanStack Query + TailwindCSS
  backend: Rust + Tauri 2 + ssh2 + tokio
  storage: SQLite + JSON + Keychain
  build: pnpm + Vite + Tauri CLI
documents:
  prd: PRD.md
  architecture: 新架构文档.md
```

---

## 验收标准体系

### 质量维度模型 (FSPMET)

每个任务从六个维度进行验收：

| 维度 | 说明 | 关注点 |
|------|------|--------|
| **F** - Functionality | 功能正确性 | 正常路径、边界条件、错误路径 |
| **S** - Security | 安全性 | 输入验证、敏感数据保护、权限控制 |
| **P** - Performance | 性能 | 响应时间、内存占用、并发能力 |
| **M** - Maintainability | 可维护性 | 代码规范、复杂度、文档注释 |
| **E** - Error Handling | 错误处理 | 错误码完整、用户提示友好、日志可追溯 |
| **T** - Testing | 测试覆盖 | 单元测试、集成测试、覆盖率 |

### 通用基线（所有任务必须满足）

```bash
# Rust 后端
cargo build --release        # 无 warnings
cargo clippy -- -D warnings  # Clippy 无警告
cargo fmt --check            # 格式规范
cargo audit                  # 依赖无高危漏洞

# TypeScript 前端
pnpm tsc --noEmit            # 类型检查通过
pnpm lint                    # ESLint 无错误
pnpm format --check          # Prettier 格式规范
```

### 验收等级定义

#### Level 1 - 基础层
> 适用于：工具函数、配置模块、辅助组件

| 维度 | 要求 |
|------|------|
| 功能 | 正常路径测试通过 |
| 安全 | 基本输入验证 |
| 性能 | 无明显阻塞 |
| 可维护 | 函数 ≤50 行，无 TODO 遗留 |
| 错误 | 返回明确错误信息 |
| 测试 | 核心函数有单测 |

#### Level 2 - 标准层
> 适用于：核心业务功能、数据处理模块

| 维度 | 要求 |
|------|------|
| 功能 | Level 1 + 边界条件测试 + 错误路径覆盖 |
| 安全 | 输入参数严格校验，敏感数据不落日志 |
| 性能 | 无 N+1 查询，大数据流式处理，异步不阻塞 UI |
| 可维护 | 公共 API 有文档，圈复杂度 ≤10 |
| 错误 | 错误码完整，支持 retryable 标识 |
| 测试 | 单测覆盖率 ≥70%，错误场景测试 |

#### Level 3 - 高标准层
> 适用于：安全关键、性能敏感、核心传输模块

| 维度 | 要求 |
|------|------|
| 功能 | Level 2 + 并发安全 + 资源泄漏检查 |
| 安全 | SQL 参数化，路径遍历防护，凭据加密存储 |
| 性能 | 基准测试通过，内存占用可控，压力测试稳定 |
| 可维护 | 模块依赖无循环，接口符合 SOLID |
| 错误 | 失败注入测试，优雅降级 |
| 测试 | 单测覆盖率 ≥85%，集成测试覆盖关键路径 |

### 任务-等级映射

| 等级 | 任务类型 | 示例 |
|------|---------|------|
| L1 | 配置/工具 | P1-2 日志, P1-4 JSON配置, P7-11 样式主题 |
| L2 | 业务功能 | P2-1 Profile CRUD, P3-2 目录列表, P4-1 创建目录 |
| L3 | 安全关键 | P1-5 凭据存储, P2-4~P2-6 认证/HostKey |
| L3 | 性能敏感 | P5-1~P5-8 传输功能, P3-5 虚拟列表 |

---

