# Todo: Shell Copilot — Task Checklist (v2, after review)

详细说明在 `tasks/plan.md`。此文件跟状态。

Status: `[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成 · `[!]` 阻塞

## Phase 1 状态快照（2026-04-18 更新）

**已落地（代码）**: T1.0a / T1.1 / T1.2 / T1.3 (1a/1b/2a/2b/3a/3b/4/5 + runtime_ready) /
T1.4 (A/B/C) / T1.5 (A/B/C/D1-D3) / T1.6 (prep + stub + 3c-1b + 3c-2) /
T1.7 (A/B/C) / T1.8 / T1.9 / T1.10。后端 411 + 前端 541 = 952 tests 全绿。

**Phase 1 α 代码完工**；CHECKPOINT B 门槛 **未过**（手工 / dogfood 事项）：

- T-1 baseline keystroke 录制 — 手工（founder 操作 VPS 3 任务 × 3 次）
- 真模型 dogfood — 跑 `cargo test --test llama_load_real -- --ignored` + 实际下 GGUF 跑 chat
- ModelOnboardingDialog 浏览器 UI 验证（`pnpm tauri dev` 手工流）
- CHECKPOINT B rubric 各项人工审阅（见下方 gate 清单）

---

## T-1 — AI 启用前基线封存（先做！）

- [ ] **T-1** 3 任务 × 3 次 pre-baseline keystroke 录制 + git tag `baseline-pre-ai-sprint`

---

## Phase 0 — Spike Gate

- [ ] **T0.1** 环境 + 10 任务清单（`docs/spike-tasks.md` + `docs/spike-prompt-template.md`）
- [ ] **T0.2** 跑 10 任务 + 打分（`docs/spike-assignment-results.md`）
- [ ] **T0.3** Gate 决策 + subagent 独立复核（差异 > 1 走保守）

### ✅ CHECKPOINT A

- [ ] 10 任务评分完整（双轮）
- [ ] 三维门槛达标 且 双评分差异 ≤ 1
- [ ] SPEC Status 更新
- [ ] `docs/checkpoint-a-rubric.md` 全 PASS

---

## Phase 1 — v0.1 α scope (3 周)

### Foundation（可并行）

- [x] **T1.0a** ManagedTerminal recent_output ring buffer（T1.7 前置，Ask First 通过 — Mutex<VecDeque<u8>> 自身 Send+Sync，不扩展现有 unsafe 不变量）
- [x] **T1.1** AI-off plumbing: Settings + `AiUnavailable` ErrorCode + Settings UI
- [x] **T1.2** Scrubber 双策略（user-input 宽松 / probe-output 硬擦），每类 ≥ 5 fixtures + HTTP auth headers
- [x] **T1.3** llama.cpp runtime（`llama-cpp-2` in-process，Mac Metal / Win+Linux CPU，无对外端口）— sub-slices:
  - [x] 1a RAM gate trait + resource_check
  - [x] 1b dep landing + cmake CI/README + cargo tree audit
  - [x] 2a GGUF sha256 verifier
  - [x] 2b LlamaRuntime::load 三道 gate 组合
  - [x] 3a generate orchestration (TokenSource trait + run_generation_loop)
  - [x] 3b prep TokenSource Result-aware
  - [x] 3b proper LlamaTokenLoop FFI + LlamaRuntime::generate
  - [x] 4 SystemRamProbe via libc sysctl / /proc/meminfo
  - [x] 5 ignored real-model integration test
  - [x] runtime_ready AtomicBool + LOADED_RUNTIME registry

### IPC + UI 垂直切片

- [x] **T1.4** Health check 端到端（A: model + service · B: IPC + TS wrapper · C: useAiHealthCheck hook + AiHealthBadge UI）
- [x] **T1.5** Model pull onboarding — A: SPEC §Never + license accept IPC · B: sha256 + disk gate 纯函数 · C: reqwest + fs4 + download_gguf 流式 + 进度 payload · D1+D2: ai_model_download IPC + events + 前端 wrapper · D3: ModelOnboardingDialog + Settings 按钮。代码已落，⚠️ 真下载 + 浏览器 UI 验证待 dogfood 手工完成。
- [x] **T1.6** Chat 流式 + `ai:thinking` 事件 — sub-slices:
  - [x] prep: untrusted-wrap primitives, useAiSessionStore, MessageList, ChatInput, ChatPanel
  - [x] stub backend: ai_chat_send + 4 events ts-rs
  - [x] stub frontend: useAiChat hook + ChatPanel IPC default + Settings AI section
  - [x] wiring: ChatPanelLauncher + Cmd/Ctrl+Shift+A + FileManagerPage 集成
  - [x] 3c-1b: chat::run_chat_stream forks real generate vs stub echo
  - [x] 3c-2: prompt::build (scrubber + system prompt) wraps user_text into real path
- [x] **T1.7** Context snapshot 自动注入（A: compose_snapshot + ai_context_snapshot IPC · B: chat send 自动 gather + prompt 注入 · C: aiContextSnapshot 前端 wrapper）
- [x] **T1.8** Safety UX: entropy inline warning + cancel button + ai_chat_cancel command
- [x] **T1.9** 命令候选注入（fenced code block parser + Insert to terminal button + getTerminalBySession wiring）
- [x] **T1.10** Scrubber pre-send 黑盒集成测试（5 secret types × 3 placements = 15 cases + negative control + smoke）

### ✅ CHECKPOINT B — v0.1 Release Gate

- [ ] Keystroke benchmark 对比 T-1 基线降幅 ≥ 40%（由独立 subagent 审）
- [ ] `docs/keystroke-benchmarks-v0.1.md` 完成
- [ ] **事后 spike 代理信号**（替代 waived Phase 0）:
  - [ ] Plan JSON schema 合规率 ≥ 80%（dogfood ≥ 10 次）
  - [ ] Allowlist deny 率 < 30%（dogfood probe）
  - [ ] 任一不达标 → Dogfood Retro 降级 β-only
- [ ] netstat 验证进程无任何 LISTEN 端口 + 无外部 HTTP（llama.cpp in-process）
- [ ] `ai_enabled=false` 时不挂载 ChatPanel、不加载 llama.cpp runtime、不创建 probe
- [ ] Scrub 黑盒 15 case + fixture 双策略全绿
- [ ] 全量 lint/format/test 绿（前后端）
- [ ] 版本号三处同步 → `3.2.0-alpha.1`
- [ ] `docs/checkpoint-b-rubric.md` 全 PASS

### 🐕 Dogfood Gate — v0.1 ship 后强制 2 周

- [ ] 每日 `docs/v0.1-dogfood-log-{YYYYMMDD}.md`
- [ ] 2 周末 `docs/v0.1-dogfood-retro.md`，决策 Continue / Adjust / Stop
- [ ] Continue 才进 Phase 2

---

## Phase 2 — v0.2 β scope (+3 周 = 6 周)

### Foundation（可并行）

- [ ] **T2.0a** REMOVED — 运行时切到 in-process llama.cpp（见 SPEC §2 / plan.md T2.0a），无外部 daemon 需审计
- [ ] **T2.1** `AllowlistDenied` ErrorCode + ERROR_MESSAGES
- [ ] **T2.2** tree-sitter-bash AST + **expansion 节点 deny-list** + 10 rules（⚠️ 新依赖 Ask First）

### Security 测试套件

- [ ] **T2.3** Bypass 测试 ≥ 40（含 expansion/ANSI-C/brace/var-indirect 覆盖，← T2.2）
- [ ] **T2.4** `<untrusted>` wrap + NFKC 规范化 + 12 payload（含 multi-round / zero-width 闭合标签，← T2.2）

### Probe 基础设施

- [ ] **T2.5** ManagedAiProbe 轻量版（无 PTY/reader thread/generation，← T2.2，⚠️ unsafe Send/Sync Ask First）
- [ ] **T2.6** Probe 生命周期 + 认证隔离 + **指数退避**（← T2.5）
- [ ] **T2.7** `ai_probe_command` + argv 硬化（shell_quote + 远端 `set -f; unalias -a; PATH`，← T2.5）
- [ ] **T2.8** Probe 并发 + 队列 UI（← T2.7）

### Plan mode + 权威判定

- [ ] **T2.9** Plan JSON schema + 重试 + output token cap 4096（← T2.4）
- [ ] **T2.10** Executor 权威判定：`CheckedCommand { argv[] }`，UI 展示 argv（← T2.2, T2.9）

### 测试基础设施

- [ ] **T2.11** Probe lifecycle fake-clock 单测（Clock trait 注入，← T2.6）
- [ ] **T2.12** Injection nightly workflow：static snapshot CI + nightly self-hosted Ollama（← T2.4）

### ✅ CHECKPOINT C — v0.2 Security Gate

- [ ] Bypass 40 case 全 deny
- [ ] Injection static 12 CI 绿
- [ ] Injection nightly 连跑 3 天全绿
- [ ] Probe lifecycle fake-clock 全覆盖
- [ ] Probe 认证隔离 + 指数退避测试
- [ ] ts-rs bindings diff = 0
- [ ] RSS（3 probe 并跑）≤ 100MB
- [ ] netstat 验证进程无任何 LISTEN 端口 + 无外部 HTTP
- [ ] `docs/checkpoint-c-rubric.md` 全 PASS
- [ ] 独立 security-auditor subagent 过 SPEC §7 Never

---

## Phase 3a — v0.3a must (6 周主线)

### Foundation（可并行）

- [ ] **T3.1** Plan / Step / Policy / VerifyTemplate 模型 + ts-rs
- [ ] **T3.2** Snapshot 存储（`dirs::data_local_dir()` + Win ACL + statvfs gating，⚠️ 依赖 Ask First）
- [ ] **T3.2a** Snapshot orphan 启动清理 TTL 24h
- [ ] **T3.3** `similar` crate + diff 生成（⚠️ 新依赖 Ask First）

### Planner + Write

- [ ] **T3.4** Planner 状态机（**无 rolling revise**，plan 固定，← T3.1；现实 10–14 天）
- [ ] **T3.6** Write step: snapshot → execute → verify(template) → rollback（← T3.2, T3.4）
- [ ] **T3.7** `ai_plan` IPC 套件 + events（ai:step/await_confirm/rollback_progress/done/service_state_warning，← T3.4）

### UI

- [ ] **T3.8** PlanCard + react-diff-viewer theme 适配（← T3.7，⚠️ 新依赖 Ask First，现实 6 天，可能 fork）
- [ ] **T3.9** ConfirmWriteDialog（**展示 argv**，非原始 string）+ RollbackButton（← T3.8）
- [ ] **T3.10** E2E demo nginx gzip 正反向手工验收（← T3.9；现实 5 天）

### ✅ CHECKPOINT D — v0.3a Release Gate

- [ ] E2E demo 正向 + 反向通过（手工）
- [ ] Rollback 失败路径 UI 展示 snapshot 路径
- [ ] Snapshot 磁盘满 / 大文件 gating 测试
- [ ] Snapshot orphan 启动清理测试
- [ ] 三平台 snapshot 权限手工验证
- [ ] 独立 security-auditor subagent 再过 Never list
- [ ] netstat 验证进程无任何 LISTEN 端口 + 无外部 HTTP
- [ ] 版本号 → `3.2.0-beta.1`
- [ ] README 硬件门槛 / GGUF 下载路径 / Gemma license accept / snapshot 路径
- [ ] CHANGELOG + release notes
- [ ] `docs/checkpoint-d-rubric.md` 全 PASS

---

## Phase 3b — v0.3b stretch（砍无损）

- [ ] **T3.5** Rolling planning `ai_plan_step_revise`（revise 后重新 check + confirm，← T3.4）
- [ ] **T3.11** E2E Docker 回归（`docker/nginx-test/` + `cargo test --test e2e_nginx`，← T3.10）
- [ ] **T3.12** Model-agnostic 合同测试（100 prompt schema pass ≥ 95% + 12 injection + 3 keystroke task 不退化）

---

## Emergency Lane（全程开启）

- [ ] `tasks/slippage.log` 文件存在
- [ ] Critical CVE 定义写进 SPEC §10
- [ ] 触发 3 次 → 强制主产品稳定性周

---

## Checkpoint Rubrics（gate 前必写）

- [ ] `docs/checkpoint-a-rubric.md`
- [ ] `docs/checkpoint-b-rubric.md`
- [ ] `docs/checkpoint-c-rubric.md`
- [ ] `docs/checkpoint-d-rubric.md`

---

## Ask First 集中清单（实现前必问）

新依赖：

- `llama-cpp-2` (T1.3, pin `=X.Y.Z`, feature whitelist `metal`/`cpu`)
- `reqwest` (T1.5, GGUF 下载, `default-features=false` + `json`/`stream`)
- `react-markdown` (T1.6)
- `tree-sitter` + `tree-sitter-bash` (T2.2)
- `dirs` (T3.2)
- `windows-acl` (T3.2, Windows 才需要)
- `similar` (T3.3)
- `react-diff-viewer-continued` (T3.8)

unsafe impl Send/Sync 不变量新增 / 修改：

- T1.0a `ManagedTerminal` 扩字段
- T2.5 `ManagedAiProbe` 新类型

Phase 门槛推迟 / 降级 / Phase 3a ↔ 3b 迁移任务。

---

## Never（全程硬禁令，见 SPEC §7）

- 云端模型 fallback / opt-in
- AI 原始 shell string → `Channel::exec`（必须 AST → argv → quote）
- AST 对 expansion 节点递归解析（一律 Deny）
- probe-output 走 entropy "标记继续送"（必须硬擦）
- AI 自由生成 verify command（必须模板）
- snapshot 放 `~/` 或云盘同步路径
- 跨 step 组合 rollback
- llama.cpp backend whitelist 外的 feature flag（只允许 `metal`/`cpu`）
- 非官方 `google/gemma-*-GGUF` HuggingFace 仓库下载权重
- TunnelFiles 进程监听任何 TCP/UDP 端口（CI netstat 验证）
- 12 周 AI 冲刺不响应 CVE（必须走 Emergency Lane）
