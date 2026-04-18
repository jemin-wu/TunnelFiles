# SPEC: TunnelFiles Shell Copilot (v0.1–v0.3)

Source of truth for the Shell Copilot feature set. Inherits all conventions from `CLAUDE.md` and `.claude/rules/*`; only AI-specific deltas are re-stated here.

- **Design reference**: `~/.gstack/projects/jemin-wu-TunnelFiles/wuminjian-main-design-20260417-165646.md`
- **Status**: Phase 0 spike waived (2026-04-17). Runtime switched to in-process llama.cpp (`llama-cpp-2`). Phase 1 implementation in progress; gate moved to CHECKPOINT B.
- **Phase 1 progress (2026-04-18)**: T1.1 / T1.2 / T1.3 (1a/1b/2a/2b/3a/3b/4/5 + runtime_ready registry) / T1.4 (A/B/C) / T1.6 (full chat e2e: stub backend + frontend + ChatPanelLauncher + 3c real-vs-stub fork + prompt::build scrub) / T1.8 (cancel + entropy inline warnings) / T1.9 / T1.10 ✅ landed. **Remaining**: T1.0a (Ask First — unsafe Send/Sync), T1.5 (Ask First — reqwest), T1.7 (blocked on T1.0a), T-1 baseline recording (manual), real-model dogfood (blocked on T1.5). 后端 324 + 前端 499 = 823 tests green.
- **Owner**: solo (minjian-wu). Main-product new features & non-critical bugfix are paused for the duration of the AI sprint (critical security fixes excepted).

---

## 1. Objective

### Who

"不以 shell 为家"的开发者 / 业余 VPS 运维者。他们选择 TunnelFiles 而非纯 `ssh` CLI，是因为图形化让远程机器管理更轻松；但进入 shell 后仍卡在"命令记不住 / 查语法 / vim 手生 / 改错不会回滚"。Builder 模式下验证用户 = founder 自己（n=1，已知约束，不做外部访谈）。

### What

在每个终端 tab 内嵌对话式本地 AI 助手。用户用自然语言描述意图，AI 通过**独立只读 SSH 探针**收集远端状态，做多步规划（前端展示完整 plan card），后端**逐步执行**（每个写入独立确认 + 独立 snapshot + 文件级 rollback）。全程纯本地（llama.cpp + Gemma 4），无任何云依赖。

### Why

1. Gemma 4（2026-04-02 发布）+ Ollama day-one 支持 → 技术首次可行
2. 独立只读 SSH 探针是竞品（Warp / Wave / gh copilot）结构性做不到的差异化
3. 产品身份（keychain 凭据 + 严格 CSP + 无云依赖）与"纯本地 AI"天然对齐

### North Star

**完成一次远程变更所需的键盘敲击数**。v0.1 硬门槛：founder 本人 3 个真实任务前后对比，降幅 ≥ 50%。

### Non-Goals

- ❌ 云端模型 opt-in（产品身份优先于硬件覆盖率）
- ❌ 多用户 Unix 部署场景（本地 runtime 无多用户隔离）
- ❌ Windows/Linux 非 shell 的 AI 功能（v1.0 只做 Linux VPS）
- ❌ SFTP 编辑器内的 AI（战场在 shell tab，不在文件编辑）
- ❌ 命令片段库 / 社区模板（δ/ε approach rejected）
- ❌ 26B+ 更大模型（v1.0 不做）
- ❌ 跨 session snapshot 保留（v0.3 只 session-scope 保留，关 tab 即清）
- ❌ 服务状态 rollback（`systemctl reload` 后不反向，只提示）

---

## 2. Scope & Phases

### Phase 0 — Spike Waived (2026-04-17 decision)

**Decision**: Phase 0 手动 spike 跳过。理由：

- 运行时从 Ollama 切换到 in-process llama.cpp（`llama-cpp-2` 绑定），Ollama-based spike 手段需重做
- founder 承担"E4B 能胜任 planning"的先验风险，gate 后移到 CHECKPOINT B
- spike 原 10 任务清单（`docs/spike-tasks.md`）保留，repurposed 为 v0.1 dogfood 期任务套件

**Gate 后移判据**（移入 CHECKPOINT B，详见 `tasks/plan.md`）：

- Plan JSON schema 合规率 ≥ 80%（dogfood 期 ≥ 10 次 plan 生成统计）
- Allowlist deny 率 < 30%（dogfood 期 probe 步骤）
- 3 任务 keystroke benchmark ≥ 40% 降幅（已是 CHECKPOINT B 硬门槛）
- 任一不达标 → Dogfood Retro 决策降级 β-only，裁 Phase 2/3 scope

**接受的代价**：若 v0.1 CHECKPOINT B 发现 E4B 不达标，已投入的 Phase 1 代码（chat / scrubber / health check / runtime）仍可用；损失约等于 1 个 Phase 1 实现周。接受。

### Phase 1 — v0.1 α scope (3 周)

Chat panel + 凭证 scrub + 命令候选（不自动回车）+ keystroke benchmark。

### Phase 2 — v0.2 β scope (+3 周 = 6 周)

独立只读 probe + tree-sitter-bash AST allowlist + prompt injection 防御 + bypass 测试 ≥ 30 + injection 回归 10 payload。

### Phase 3 — v0.3 γ scope (+6 周 = 12 周)

**第三条路**：前端展示完整 plan card（保留多步 agent 视觉叙事），后端**逐步执行**（每个写入独立 pause + 独立 snapshot + 文件级 rollback，**不做 cross-step 组合回滚**）。AI 每步完成后可修改后续 plan（滚动 planning）。

Phase 3 切成两段分级交付（应 review 共识 "Phase 3 过载 85% 做不完"）：

- **v0.3a**（必须）：Plan JSON 模型 + snapshot 存储 + planner 状态机骨架 + write step（snapshot→execute→verify→rollback）+ PlanCard UI + ConfirmWriteDialog + RollbackButton + E2E demo 正反向。不含 rolling revise，plan 生成后固定执行。
- **v0.3b**（stretch goal，做不完可砍）：rolling planning（`ai_plan_step_revise`）+ model-agnostic 合同测试 + Docker E2E 回归自动化。

CHECKPOINT D 以 v0.3a 全绿为 ship gate；v0.3b 按剩余预算追加。

---

## 3. Commands (IPC)

所有命令走 `src/lib/ai.ts` → `timedInvoke` → Rust `#[tauri::command]`（见 `.claude/rules/stack-tauri.md`）。默认 30s 超时，长任务（pull 模型、rollback）显式 300_000ms。

### v0.1

```
ai_health_check       → AiHealthResult { runtimeReady, modelPresent, modelName, acceleratorKind }
                        acceleratorKind: "metal" | "cpu" | "none"（未来扩展 CUDA/Vulkan）
ai_license_accept     → () — records Gemma Terms of Use acceptance; required before ai_model_download
ai_model_download     → emits ai:download_progress event (percent, downloaded, total, phase)
                        phase: "fetching" | "verifying" | "loading"（sha256 + 载入 GGUF）
ai_chat_send          → ChatResponse { messageId, streamChannel }
                        实际 tokens 通过 ai:token event 流式推送
ai_chat_cancel        → () — 下一个 token 边界退出；prompt eval 阶段可能 1–3s 延迟（见 §5 Cancel 语义）
ai_context_snapshot   → { pwd, recentOutputLines } — 前端收集供 prompt 使用
```

### v0.2（新增）

```
ai_probe_command      → ProbeResult { stdout, stderr, exitCode, truncated }
                        命令必须先过 allowlist；否则返回 AllowlistDenied
ai_probe_session_status → { active, lastActivity, pendingCommands }
```

### v0.3（新增）

```
ai_plan_create        → PlanId — AI 生成初始 plan，前端展示 plan card
ai_plan_step_execute  → StepResult — 只执行下一步（非整 plan）；write step 返回 await_confirm
ai_plan_step_confirm  → () — 用户确认后继续执行当前 write step
ai_plan_step_revise   → () — AI 基于最新观察修订后续 plan（滚动 planning）
ai_plan_cancel        → () — 中断执行，保留已完成 snapshot
ai_plan_rollback      → RollbackResult — 回滚**指定 step**的文件变更（只文件级）
```

### 事件（推送）

```
ai:token              — chat 流式 token
ai:thinking           — AI 进入 planning
ai:step               — step 开始/完成/失败
ai:await_confirm      — write step 阻塞等待用户确认
ai:rollback_progress  — rollback 进度
ai:download_progress  — 模型下载进度（phase: fetching | verifying | loading）
ai:error              — 任意失败（含 llama.cpp 生成中断 / 模型载入失败）
```

所有 payload 走 ts-rs 生成（`.claude/rules/workflow-generated-code.md`），**禁止**手写 bindings。

---

## 4. Project Structure

### Backend (`src-tauri/src/`)

```
commands/ai.rs                            # IPC 入口，只做参数解析 + spawn_blocking + 错误包装
services/ai/
  mod.rs                                  # 对外 re-export
  llama_runtime.rs                        # llama-cpp-2 封装 (load model / generate / cancel)
  model_download.rs                       # HuggingFace GGUF 下载 + sha256 校验 + license accept 记录
  prompt.rs                               # system prompt 模板 + chat/plan mode 切换
  scrubber.rs                             # 正则 + entropy + URI scrub（v0.1）
  allowlist.rs                            # tree-sitter-bash AST 白名单（v0.2）
  executor.rs                             # 独立只读 SSH probe channel 管理（v0.2）
  planner.rs                              # 滚动 planning + 单步执行状态机（v0.3）
  rollback.rs                             # SFTP snapshot + 文件级回滚（v0.3）
models/
  ai_message.rs                           # ChatMessage, Role
  ai_plan.rs                              # Plan, PlanStatus
  ai_step.rs                              # Step, StepKind (Probe | Write | Verify), StepStatus
  ai_policy.rs                            # AllowlistDecision, ScrubRecord（审计用）
```

### Frontend (`src/`)

```
components/ai/
  ChatPanel.tsx                           # 右侧折叠面板，Ctrl/Cmd+Shift+A 展开
  MessageList.tsx                         # 流式渲染，react-markdown
  PlanCard.tsx                            # 单个 step 卡片（read-only 绿 / write 红）
  ConfirmWriteDialog.tsx                  # write step pause 对话框 + diff 预览
  ModelOnboardingDialog.tsx               # Runtime 健康检查 + GGUF 下载引导
  RollbackButton.tsx                      # session-scope 可用的回滚按钮
hooks/
  useAiChat.ts                            # chat 发送 + token 订阅
  useAiPlan.ts                            # plan 状态机订阅（v0.3）
  useAiHealthCheck.ts                     # Runtime + 模型状态轮询（5s 间隔）
stores/
  useAiSessionStore.ts                    # per-tab 对话历史、plan 状态（Zustand）
lib/
  ai.ts                                   # IPC wrapper + Zod schema
pages/
  SettingsPage.tsx                        # 新增 AI tab（模型选择、RAM 检测、pull、删除）
```

### 依赖流向

严格遵守 `pages → features → shared`（`.claude/rules/stack-react.md`）。AI 模块**不**跨 feature import `terminal/*` 或 `connections/*`，通过 `stores/useAiSessionStore` 或 props 交互。

---

## 5. Code Style

### 继承（不重述）

- Rust: `.claude/rules/stack-rust.md`（ssh2 spawn_blocking / unsafe impl Send/Sync 不变量 / tracing 日志 / unwrap 仅 test）
- TypeScript: `.claude/rules/stack-react.md`（shadcn/ui / cn() / 路径别名 / 无 barrel）
- 错误: `.claude/rules/domain-errors.md`（AppError + 13 ErrorCode 枚举，新增 2 类见下）
- 样式: `.claude/rules/domain-styling.md`（OKLCH tokens only / 5 档 icon / 3 档 duration）
- 表单: `.claude/rules/domain-forms.md`（RHF + Zod，禁手写 interface）
- 生成代码: `.claude/rules/workflow-generated-code.md`（ts-rs #[cfg_attr(test, derive(TS))]）

### AI 增量

- **新增 ErrorCode**: `AiUnavailable`（retryable）+ `AllowlistDenied`（非 retryable）。必须同步 `ERROR_MESSAGES` 表 + ts-rs regen。

- **allowlist AST（deny-list expansion 节点）**：禁止字符串 match / regex。用 tree-sitter-bash parse AST，按强类型 `Command { name, args[] }` 判定。**硬性：任何 expansion 节点一律 Deny**，不尝试递归解析内部：
  - `command_substitution`（`$(...)` / `` `...` ``）
  - `process_substitution`（`<(...)` / `>(...)`）
  - `ansi_c_string`（`$'\x72m'`）
  - `brace expansion`（`{rm,-rf,/}`）
  - `expansion` with vars referencing external（`$CMD` where CMD unbound at check time）
  - `here_string` / `heredoc` pipes into shell
  - 任何 redirect 到非 stdout/stderr / 任何 pipe 的目标是 shell-like（sh/bash/zsh/eval/source/`.`）
  - parse 失败 → Deny（fail-closed）

- **Argv 粒度传递 + 远端硬化**（S2 防御，T2.7）：executor 层**不**把 AI 的原始 string 喂给 `exec`。把 AST 解析后的 argv 逐个 shell-quote 后拼接：`'ls' '-la' '/etc/nginx'`。远端 probe 启动时注入：

  ```bash
  set -f                   # 关闭 pathname expansion
  unalias -a               # 清 alias
  unset HISTFILE           # 防写 history
  export PATH=/usr/bin:/bin
  ```

  保证客户端 AST 的语义和远端执行一致。

- **Check-then-exec TOCTOU 防护**（S3 防御，T2.10）：`allowlist.check()` 返回结构化的 `CheckedCommand { argv[] }`，executor 只接受 `CheckedCommand`，**不**接受 raw string。confirm dialog 展示给用户的也是 argv（不是 AI 原始输出）。`ai_plan_step_revise` 后的 command 必须重新走 `check()` + 重新 confirm。

- **Scrubber 双策略**（S5 防御）：
  - **user-input 路径**（chat input / pasted text）：正则 → entropy → URI 分层，entropy 误伤"继续送但标记"（用户可见，敏感度低）
  - **probe-output / 文件内容路径**：entropy 命中**硬擦** `<REDACTED>`（AI 看不到、不会放大到下轮 prompt），不走"标记继续"
  - 正则层必补：`Authorization: Bearer ...`、`Authorization: Basic ...`、`X-Api-Key:`、JWT 模式（`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`）

- **Output token hard cap**：llama.cpp 生成 token 数上限 4096（单次响应），超限强制截断 + 返回 `AiUnavailable { detail: "output truncated" }`。防恶意 prompt 让 E4B 吐长响应把 RSS 打爆。

- **prompt JSON schema 失败重试**：最多 2 次，失败后降级为"AI 无法理解此请求，请改述"。**禁止**静默吞错。

- **`<untrusted>` wrap**：所有来自 terminal_output / 文件内容 / probe stdout 的文本必须在 system prompt 里包裹 `<untrusted>...</untrusted>`。wrap 前先对 untrusted 字节过滤 `</untrusted>` 字面量 + zero-width / RLI 等 Unicode 干扰字符（NFKC 规范化后再 wrap）。

- **probe executor 权威判定**：`StepKind::ReadOnly` 的判定权威是 executor 的 allowlist 匹配器，**不是** AI 自己的声明。声明与判定不一致 → 按更危险的处理（走 AwaitingConfirm）。verify step 的命令**不**由 AI 自由生成，来自内置模板（`nginx -t`、`systemctl is-active`、`curl -I` 等），或必须过 allowlist + 用户 confirm。

- **推理运行时**：`llama-cpp-2`（llama.cpp Rust binding）in-process 推理，**无对外端口**。Backend：macOS 启 `metal` feature；Windows/Linux v0.1 默认 CPU（feature `default`）；CUDA/Vulkan v0.2+ 评估（Ask First §7）。feature flag 白名单仅允许 `metal` / `cpu`，构建脚本 assert 非白名单 feature 未启用。

- **模型文件存储**：`{data_local_dir}/TunnelFiles/models/gemma-4-E4B-it-Q4_K_M.gguf`（~4.98 GB，源自 `unsloth/gemma-4-E4B-it-GGUF`）。首次启用 AI 走 `ai_model_download` 从 §Never "三方源允许清单" 中的仓库下载，落盘后校验 sha256（固定常量 `dff0ffba4c90b4082d70214d53ce9504a28d4d8d998276dcb3b8881a656c742a`，跟随 TunnelFiles release 锁定）。下载前先做磁盘空间 gate（≥ 7GB 空闲）。

- **Google Gemma license accept**：首次下载前弹 Dialog 展示 Gemma Terms of Use 链接 + checkbox 确认，accept 写入 `settings.ai_license_accepted_at: Option<DateTime>`。未 accept → `ai_model_download` 返回 `AiUnavailable { detail: "license not accepted" }`。三方量化仓库本身 Apache 2.0 / 非 gated，但权重仍受 Gemma ToU 约束，UI 必须显式展示。

- **运行时资源限制**：加载前检查可用 RAM ≥ 8GB（E4B Q4_K_M 载入 ~5GB + KV cache ~1.5GB + 余量；注：Gemma 4 E4B 是 MoE 架构，参数实际 ~8B）。不足 → `AiUnavailable { detail: "insufficient RAM" }`；`num_ctx` 默认 4096；`settings.ai_output_token_cap` 默认 4096。

- **进程端口约束**：TunnelFiles 进程全程不监听任何 TCP/UDP 端口，CI/CHECKPOINT 验证 `netstat -an | grep LISTEN | grep <pid>` 空集。

- **`llama-cpp-2` 版本 pin**：`Cargo.toml` 严格固定版本（`llama-cpp-2 = "=X.Y.Z"`，**非 caret range**）。版本 bump 前必须跑 `docs/llama-cpp-golden-prompts.md` 的回归套件全绿才合入。理由：bundled llama.cpp 常态升级会引入 GGUF 格式 / chat template / Gemma 4 推理回归（参考上游 issue ggml-org/llama.cpp#21726），严格 pin + 回归测试是唯一防线。

- **Cancel 语义**：`ai_chat_cancel` 在 **下一个 token 边界** 退出。prompt eval 阶段（长上下文首次处理）可能有 1–3s 延迟，期间取消请求会排队。UI 必须展示"取消中..."状态避免"按了没反应"的断崖体验。上游 `llama_context` 的 `abort_callback` 目前 `llama-cpp-2` 包装不完整，v0.2+ 评估自写 unsafe 对接或提 PR。

### 日志脱敏（`.claude/rules/core-security.md` 的 AI 延伸）

- **禁止**日志 prompt 全文 / 模型输出全文。只记录 `{role, token_count, had_scrub, scrub_count}`。
- snapshot 文件路径 log OK（但内容不 log）。
- llama.cpp 生成输出不进 tracing（只记 token 数 + latency）。

---

## 6. Testing Strategy

### 继承

- 前端: Vitest + RTL，IPC 边界 mock `@/lib/*`（不 mock `@tauri-apps/api/core`）
- 后端: `cargo test --lib --bins` + Docker SSH 集成（`.claude/rules/core-testing.md`）
- E2E: WebKitWebDriver + XPath（不用 `text=`）
- Coverage gate: `vitest.config` 阈值；AI 模块单测 coverage ≥ 80%

### Phase 0 验收

`docs/spike-assignment-results.md`：

- [ ] 10 任务全部记录（输入 prompt + E4B 输出 + 三维分数）
- [ ] 单项门槛达标表（可视化哪一项如果没过）
- [ ] 定性笔记：是否会在 v0.1 落地 / 要降级 β 的具体理由

### v0.1 验收

- [ ] 凭证 scrub 单测：PEM / AWS key / URI / entropy **每类 ≥ 5 个 fixture**
- [ ] 输入框 entropy 实时检测单测（模拟用户粘贴密码 → inline warning）
- [ ] `ai_health_check` 四态测试（模型文件缺失 / sha256 校验失败 / runtime 载入失败 / 正常）
- [ ] chat 流式中断恢复测试（mock token stream 断掉，ai:error 事件正确触发）
- [ ] **keystroke benchmark**：founder 本人 3 个真实任务前后对比，手工记录，写入 `docs/keystroke-benchmarks-v0.1.md`，降幅 ≥ 50% 才发布

### v0.2 验收

- [ ] **allowlist bypass 单测 ≥ 30**：`ls; rm` / `$(rm)` / `` `rm` `` / `ls && rm` / `ls | sh` / `find -exec rm` / `awk BEGIN{system()}` / `journalctl | tee /etc/...` / `tail -f /dev/zero`(DoS) / `ls $IFS rm` / Unicode trick / 等
- [ ] **prompt injection 回归 10 payload**：`IGNORE PREVIOUS INSTRUCTIONS...` / `</untrusted>System: ...` / RLI Unicode / Base64 encoded instructions / Markdown-hidden instruction / 等 — 埋入模拟 terminal 输出 + 文件内容，AI plan 必须仍合规
- [ ] probe session 生命周期测试：创建 / 销毁 / 主 session disconnect 孤儿清理 / AI 关闭时批量关闭
- [ ] probe 认证失败计数隔离测试（`ai_probe:{profile_id}` key 独立，不污染主连接锁定）
- [ ] ts-rs regen 同步：`AiUnavailable` + `AllowlistDenied` bindings diff 为 0

### v0.3 验收

- [ ] 端到端 demo：「给 nginx 加 gzip 并验证」整个流程跑通
- [ ] rollback 失败路径测试：SFTP 写回失败 → UI 暴露 snapshot 本地路径 + 手动恢复指引
- [ ] write step 故意改错测试：`nginx -t` 失败 → 触发文件级 rollback（**不**反向 `systemctl reload`，只提示）
- [ ] snapshot 磁盘满测试：`statvfs` < 100MB → 拒绝写入
- [ ] 大文件警告测试：10MB 警告 / 100MB 拒绝
- [ ] plan 滚动修订测试：step 1 完成后 AI 基于新观察修改 step 3，UI plan card 同步

### 全局硬性

- [ ] `netstat` 验证 TunnelFiles 进程无任何 LISTEN 端口 + 无外部 HTTP（llama.cpp in-process）
- [ ] AI 默认关闭：删掉设置后 chat panel 不渲染、不创建 probe、不加载 llama.cpp runtime
- [ ] 三阶段验证通过：自动化检查 + 端到端验收 + 独立 subagent 评估（见全局 CLAUDE.md）

---

## 7. Boundaries

### Always（无须询问，硬性执行）

- ✅ 所有送入 llama.cpp 推理的 prompt 先过 `scrubber::redact()`（user-input 用宽松策略；probe-output / 文件内容用硬擦策略，entropy 命中 → `<REDACTED>`）
- ✅ 所有 probe 命令先过 `allowlist::check()`（服务端权威判定，返回 `CheckedCommand { argv[] }`，executor 只接受 argv 不接受 raw string）
- ✅ 所有远端 probe 执行前注入 `set -f; unalias -a; unset HISTFILE; export PATH=/usr/bin:/bin` 硬化 shell 环境
- ✅ 所有 write step 前先 `rollback::snapshot()`
- ✅ 所有 `ssh2::*` / `sftp::*` 调用进 `tokio::task::spawn_blocking`
- ✅ Rust struct 改动后跑 `pnpm generate:types`
- ✅ 提交前 `pnpm lint && pnpm format:check && pnpm test:run` + `cargo fmt --check && cargo clippy -- -D warnings && cargo test --lib --bins`
- ✅ 新增 ErrorCode 同步 `ERROR_MESSAGES` 默认文案
- ✅ StrictMode 安全 listener 模式（cancelled-flag + handler 用 ref）
- ✅ prompt 中所有 untrusted 内容先 NFKC 规范化 + 擦 `</untrusted>` 字面量 + 擦 zero-width/RLI，再用 `<untrusted>...</untrusted>` 包裹
- ✅ probe session 连接数上限检查（Settings `max_concurrent_ai_probes`, 默认 3）
- ✅ llama.cpp 加载模型前校验 GGUF 文件 sha256 + Gemma license accept 记录，任一失败拒绝启动
- ✅ TunnelFiles 进程全程不监听任何 TCP/UDP 端口（CI 验证 `netstat -an | grep LISTEN | grep <pid>` 空集）
- ✅ llama.cpp 单次生成硬 cap 4096 output tokens（防 OOM DoS）
- ✅ `ai_plan_step_revise` 产生的新 command 必须重新过 `check()` + 重新 confirm（防 TOCTOU）
- ✅ ConfirmWriteDialog 展示的是 `CheckedCommand.argv[]`，**不**是 AI 原始 string（防 confused deputy）
- ✅ verify step command 来自服务端内置模板（`nginx -t` / `systemctl is-active` / `curl -I` ...），禁止 AI 自由生成

### Ask First（动手前必须确认）

- ⚠️ 扩展 allowlist（新增命令 / 放宽参数 pattern）— 安全影响
- ⚠️ 修改 `SessionManager` / `ManagedTerminal` / `ManagedAiProbe` 的 `unsafe impl Send/Sync` 不变量
- ⚠️ 修改凭据借用模式 `with_cached_credentials`（zeroize 路径）
- ⚠️ 新增 Rust 依赖 / 前端依赖
- ⚠️ 修改 snapshot 存储路径 / retention 策略
- ⚠️ 修改 prompt JSON schema（影响模型输出兼容）
- ⚠️ 动用 CSP 放宽（`src-tauri/tauri.conf.json`）
- ⚠️ 修改 Phase 阶段门槛（推迟 / 降级）
- ⚠️ 修改 `ManagedTerminal` 新增/扩展输出 buffer 字段（触发 unsafe Send/Sync 重审）
- ⚠️ 修改 allowlist expansion deny-list（安全策略核心）
- ⚠️ 修改远端 shell 硬化脚本（`set -f; unalias -a; ...`）
- ⚠️ 修改 Output token hard cap / probe 输出 64KB 上限（DoS 防线）

### Never（硬禁令，见 `.claude/rules/core-dont.md` 的 AI 延伸）

- ❌ 云端模型 fallback / opt-in（任何形式的 HTTP 到外部 AI 服务）
- ❌ AI 自主执行任何未经 allowlist 匹配的命令
- ❌ 跳过 write step 的 pause 直接执行（即使 AI"非常确信"）
- ❌ 跨 step 组合回滚（第三条路决策：只做文件级 rollback）
- ❌ 持久化未 scrub 的对话历史到磁盘
- ❌ AppError.message 暴露 prompt 内容 / 模型输出 / 文件路径（放 `.detail`）
- ❌ 使用 regex 作为 allowlist 主判定（必须 AST）
- ❌ 把 password/passphrase 作为 `Clone` 传递（用 `&str` 借用 + zeroize）
- ❌ 启用 llama.cpp backend whitelist 外的 feature flag（只允许 `metal` / `cpu`，其他必须 Ask First）
- ❌ 从未经审核的第三方 GGUF 仓库下载权重。原因：Google 官方 `google/gemma-4-*` 仓库只发 safetensors，不直接发 GGUF（2026-04 核查）。v0.1 允许清单（每项须明确 pin URL + sha256 + commit 来源）：
  - `unsloth/gemma-4-E4B-it-GGUF`（Unsloth AI 官方组织仓，Apache 2.0 metadata + Gemma ToU 权重；2026-04-11 主动跟进 chat template 修复）
  - 新增三方源须 Ask First 审批 + 在 `docs/approved-model-sources.md` 记录（维护方身份、最近 commit、审核人、日期）
- ❌ AI 对话共享跨 tab 上下文（per-tab 隔离，防串扰）
- ❌ 手写 `src/types/bindings/*.ts`（ts-rs 自动生成）
- ❌ v0.3 做服务状态 rollback（systemctl reload 后只提示）
- ❌ 把 AI 原始 shell string 直接喂给 `Channel::exec`（必须先 AST parse → argv → shell-quote 拼接）
- ❌ AST 遇到 expansion 节点（`$()` / `<()` / `{a,b}` / `$'...'` / 变量间接）尝试递归解析内部（一律 Deny）
- ❌ probe-output / 文件内容走 scrubber 的 entropy 误伤 "标记继续送" 策略（必须硬擦 `<REDACTED>`）
- ❌ verify step command 由 AI 自由生成（必须模板或过 allowlist + confirm）
- ❌ snapshot 目录放在 `~/` 或任何可能被云盘同步的路径（用 `dirs::data_local_dir()`，Windows 下显式 SetSecurityInfo 限当前 SID）
- ❌ 12 周 AI 冲刺期间主产品 CVE 不响应（必须走 Emergency Lane §10）

---

## 8. Open Questions (推迟决策，列表保留)

1. v0.2 后 allowlist 扩展集（当前 10 条起步，基于真实使用数据补充到 v0.4）
2. Gemma 5 / Llama 4.5 发布后 prompt schema 兼容（设计为 model-agnostic，通过 config 切换）
3. probe session RSS 基线（v0.2 benchmark 门槛 ≤ 100MB，超出触发连接数下调）
4. v1.0 是否支持 Windows PowerShell / non-bash shell（目前明示 Linux VPS）

## 9. References

- Design doc: `~/.gstack/projects/jemin-wu-TunnelFiles/wuminjian-main-design-20260417-165646.md`
- Autoplan restore point: `~/.gstack/projects/jemin-wu-TunnelFiles/main-autoplan-restore-20260417-172025.md`
- Test plan: `~/.gstack/projects/jemin-wu-TunnelFiles/wuminjian-main-test-plan-20260417-172025.md`
- Global conventions: `CLAUDE.md` + `.claude/rules/*.md`
- Failure modes registry: 见 design doc §Failure Modes Registry（12 条）

---

## 10. Main Product Emergency Lane

12 周 AI 冲刺期间"暂停主产品新功能 / 非关键 bugfix"不含**安全级应急**。定义：

**Critical（必须 48h 内响应）**：

- 远程代码执行 / 权限提升 / 认证绕过 CVE
- Keychain 凭证泄漏相关 bug
- 数据损坏（profile DB / 配置）相关 bug
- 严重回归导致用户无法连接任何已有 profile

**响应协议**：

1. 暂停当前 AI task，开新分支从 `main` 拉
2. 48h 内发 patch release（版本 `3.1.N+1`，AI 冲刺分支独立走 `3.2.0-*`）
3. 合回 AI 冲刺分支
4. 记录 slippage（天数）到 `tasks/slippage.log`，但**不重置** 12 周倒计时
5. 3 次以上 Emergency Lane 触发 → 强制暂停 AI 冲刺做"主产品稳定性周"

**非 Critical**（功能请求 / UX 小 bug / 文档）：进 issue tracker，冲刺结束后处理。

---

## 11. Dogfood Gate（v0.1 ship 后）

CHECKPOINT B（v0.1 release gate）通过后**不立即**进 Phase 2。强制 **2 周 dogfood 期**（吸收 autoplan 决策 #21）：

- founder 本人每日用 v0.1 做真实 VPS 运维，记录：
  - 哪些任务 AI 帮上忙（keystroke benchmark 之外的场景）
  - 哪些场景 AI 答错、拒答、卡壳
  - Scrub 是否误伤导致体验差
  - llama.cpp runtime 崩溃 / 载入失败的实际频率
- 2 周末写 `docs/v0.1-dogfood-retro.md`，决策：
  - **Continue**：按原 plan 进 Phase 2
  - **Adjust**：基于真实数据裁剪 Phase 2/3 scope（比如不做 probe，只扩 chat 能力）
  - **Stop**：v0.1 已足够，不做 probe + agent（沉没成本接受）

---

## 12. Immediate Next Action

**Phase 1 T1.1 起步**。Phase 0 spike waived（见 §2）。按 `tasks/plan.md` 的 T1.1 AI-off plumbing → T1.3 llama.cpp runtime 集成 → T1.4 health check → T1.5 model download onboarding 顺序推进。

**T1.3 `llama-cpp-2` 新依赖触发 §7 Ask First**：首次引入时另起 PR 走依赖审批，论证 feature flag whitelist（`metal` / `cpu`）和 CI 构建矩阵。

**Gate 后移**：原 spike 三维门槛迁移至 CHECKPOINT B 的"事后 spike 代理信号"（plan JSON 合规率 ≥ 80% / allowlist deny 率 < 30% / keystroke benchmark ≥ 40% 降幅）。
