# CHECKPOINT B Rubric — v0.1 α Release Gate

Source of truth for pass/fail judgment at CHECKPOINT B. Inherits from `SPEC.md` §2/§11 and `tasks/plan.md` CHECKPOINT B section. Any gate item not meeting `PASS` criteria below — including missing evidence — MUST be marked `FAIL` or `SKIPPED`, never `PASS`.

- **Scope**: gate into 2-week dogfood period (SPEC §11), then into Phase 2
- **Runtime**: in-process `llama-cpp-2` (Phase 0 waived 2026-04-17, SPEC §2)
- **Version under test**: `3.2.0-alpha.1` (package.json / Cargo.toml / tauri.conf.json — all three must match)
- **Evidence root**: `docs/checkpoints/b/` — every gate item points here or to a committed file path

## Three-Phase Verification (CLAUDE.md)

Every gate item must clear all three phases in order; skipping a phase = `SKIPPED`.

1. **自动化检查** — lint / format / typecheck / unit tests / clippy
2. **端到端验收** — manual or scripted run against stated acceptance criteria with recorded evidence
3. **独立评估** — subagent with clean context, no write access, renders PASS/FAIL per item using raw evidence only

## Status Legend

- `PASS` — evidence present, acceptance met, independent subagent confirmed
- `FAIL` — evidence present but acceptance missed, or regressions surfaced
- `SKIPPED` — evidence missing or phase skipped; blocks gate by default, waiver requires explicit log entry in `docs/checkpoints/b/waivers.md` with justification and compensating control
- Self-assessment bias defense: if founder "talks self into" PASS without evidence, flag as `FAIL` and fix the gap — do not downgrade criteria mid-gate (global CLAUDE.md `Verification Before Done` §3)

---

## Hard Gates

### G1 — Keystroke benchmark ≥ 40% reduction

- **Criterion**: founder runs the 3 T-1 baseline tasks × 3 repetitions with v0.1 AI on, each task's median keystroke count drops ≥ 40% vs. the `baseline-pre-ai-sprint` git-tagged data for the same task
- **Evidence**:
  - `docs/keystroke-benchmarks-v0.1.md` — raw per-run counts + delta table + comparison to baseline
  - `docs/baselines/` — must still contain the 9 baseline recordings referenced in T-1
  - Screen recordings (`.cast` or `.mov`) for all 9 v0.1 runs committed under `docs/benchmarks/v0.1/`
- **Independent subagent**: `agent-skills:code-reviewer` with read-only access to the two sets of recordings + count spreadsheets; returns PASS/FAIL per task + aggregate; disagreement triggers third-party review via `codex:rescue`
- **SKIPPED triggers**:
  - Baseline tag missing or mutated → block (T-1 prerequisite unfulfilled)
  - Founder changed the 3 task definitions after baseline → reset, re-record baseline
  - Keystroke count tooling differs between baseline and v0.1 (must be identical)
- **FAIL recovery**: fall back to Dogfood Retro `Adjust` decision (SPEC §11); do not re-run benchmark silently

### G2 — Post-hoc spike proxy signals (replaces waived Phase 0)

These signals act as the evidence that Gemma 4 E4B can actually plan, observed from real usage rather than synthetic spike.

- **G2.a Plan JSON schema compliance ≥ 80%**
  - Measurement window: the 2-week dogfood period immediately following CHECKPOINT B
  - Sample: ≥ 10 plan generations, logged in `docs/v0.1-dogfood-log-{YYYYMMDD}.md`
  - Schema defined in `src-tauri/src/services/ai/prompt.rs` Plan schema (v0.2 feature but dogfood collects against skeleton)
  - Evidence: per-generation JSON raw output + parse result table
- **G2.b Allowlist deny rate < 30%**
  - Measurement window: same dogfood period
  - Denominator: probe steps attempted during dogfood
  - Evidence: `docs/v0.1-dogfood-log-*.md` deny counter columns
- **Failure policy**: either signal fails → Dogfood Retro must reach `Adjust` or `Stop`; Phase 2 scope cut to β-only or Phase 2/3 abandoned. Do not promote to `PASS` by loosening thresholds.
- **Independent subagent**: none required at gate entry (signals accumulate during dogfood); Dogfood Retro itself uses `agent-skills:code-reviewer` over raw dogfood logs

### G3 — No process listens on any port, no external HTTP

- **Criterion**: TunnelFiles process (by PID) has empty LISTEN set and makes zero outbound HTTP except the Gemma GGUF download endpoint at first-run
- **Evidence**:
  - `netstat -anv | grep LISTEN | grep <tunnelfiles-pid>` output committed to `docs/checkpoints/b/netstat-{macos,linux,windows}.txt` — must be empty for each platform tested
  - Outbound capture via `nettop` (macOS) / `ss -tp` (Linux) / `Resource Monitor` (Windows) for a 5-minute idle session with `ai_enabled=true` — must show no HTTP to any host other than `huggingface.co` during explicit model download, and zero traffic when idle
- **SKIPPED triggers**: platform not tested → list it explicitly; cannot be waived for Mac (primary dev platform)
- **Independent subagent**: `agent-skills:security-auditor` reviewing the captures; checks SPEC §7 Never list entry "进程监听任何 TCP/UDP 端口"

### G4 — AI-off plumbing is truly dormant

- **Criterion**: with `settings.ai_enabled=false`:
  1. `ChatPanel` component not mounted in any terminal tab (React DevTools tree check)
  2. `llama-cpp-2` runtime not initialized (process RSS does not include model load overhead; no GGUF file handle held)
  3. No AI probe session created (SessionManager internal count = 0 for probe type)
  4. `ai_health_check` returns `{ runtimeReady: false, modelPresent: any, ... }` without side effects
- **Evidence**:
  - Manual: React DevTools screenshot of tab tree with AI disabled → committed under `docs/checkpoints/b/ai-off/`
  - Automated: Vitest case `__tests__/pages/SettingsPage.ai-disabled.test.tsx` asserts ChatPanel absent
  - Backend unit: `services/ai/llama_runtime::tests::runtime_stays_unloaded_when_disabled`
  - RSS diff: `ps -o rss= -p <pid>` with AI on vs. off, delta ≥ 3.5 GB when model loaded
- **Independent subagent**: `agent-skills:test-engineer` over the tests + evidence screenshots

### G5 — Scrubber black-box proofs

- **Criterion**: no originating secret bytes survive `prompt::build()`. Two layers:
  - G5.a user-input strategy: 15 fixture cases (PEM / AWS / URI / JWT / HTTP auth × 3 patterns each) pass `services/ai/scrubber::redact_user_input` fixtures (T1.2)
  - G5.b pre-send black-box: `src-tauri/tests/scrubber_blackbox.rs` 15 cases (5 secret types × 3 prompt modes) assert byte-level absence of originals in assembled prompt (T1.10)
- **Evidence**:
  - `cd src-tauri && cargo test scrubber --lib --bins` green
  - `cd src-tauri && cargo test --test scrubber_blackbox` green
  - Coverage report for `services/ai/scrubber.rs` ≥ 80% (grcov output stored at `docs/checkpoints/b/scrubber-coverage.txt`)
- **Independent subagent**: `agent-skills:security-auditor` re-reads fixtures + asserts coverage of each category (PEM footer, AWS `AKIA...`, JWT three-segment regex, `Authorization: Bearer|Basic`, `X-Api-Key`)
- **FAIL example to catch**: any fixture mutated to be "easier" without equivalent new stronger case

### G6 — Quality bars (lint / format / test) on both tiers

- **Criterion**: all of the following pass with `--no-warnings-as-success` policy
  - `pnpm lint && pnpm format:check && pnpm test:run`
  - `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test --lib --bins`
  - `pnpm generate:types` produces zero diff vs. committed `src/types/bindings/`
- **Evidence**: CI run logs (link in `docs/checkpoints/b/ci-run.md`) or local transcripts committed under `docs/checkpoints/b/quality-logs/`
- **Independent subagent**: CI itself is the independent evaluator (clean context, no write access). Human re-runs locally for confirmation

### G7 — Version triple sync

- **Criterion**: exactly `3.2.0-alpha.1` in all three files at tag-time
  - `package.json` `version`
  - `src-tauri/Cargo.toml` `[package].version`
  - `src-tauri/tauri.conf.json` `version`
- **Evidence**: `git show <tag>:<file>` for each file pasted into `docs/checkpoints/b/version-check.txt`
- **Independent subagent**: none — mechanical check, PASS/FAIL is deterministic

### G8 — ErrorCode and bindings surface hygiene

- **Criterion**: `AiUnavailable` enum variant exists in Rust and in TS bindings with consistent naming and an entry in `ERROR_MESSAGES`; no hand-edits in `src/types/bindings/`
- **Evidence**:
  - `git log -p src/types/bindings/ | grep -v "This file was generated"` returns no user-authored hunks
  - Grep `ERROR_MESSAGES` for `AI_UNAVAILABLE` key present
  - `pnpm generate:types` zero-diff (also covered by G6)
- **Independent subagent**: `agent-skills:code-reviewer` scoped to the binding files + `ERROR_MESSAGES`

### G9 — Chat-streaming UX acceptance

- **Criterion**: on primary dev platform (Mac Metal) with model loaded
  - First token latency ≤ 3 seconds for a 256-token prompt
  - Cancel during token loop halts emission within 5 seconds
  - Cancel during prompt-eval shows "取消中..." state within 200ms of the click
  - Tab-title pulse indicator activates during `streamState === 'thinking'` and clears on `ai:done`
- **Evidence**: `docs/v0.1-perf.md` containing timed screen captures; perf assertions in Vitest skipped on CI but run locally with transcript
- **Independent subagent**: `agent-skills:test-engineer` reads the perf log + recordings

### G10 — Model onboarding UX acceptance (T1.5)

- **Criterion**: on Mac (primary) the full download flow is user-navigable and fail-safe
  1. Settings AI tab 显示 "Download model" 按钮当且仅当 `aiHealthStatus === "model-missing"`
  2. 点击按钮 → Dialog 打开停在 `licensePrompt`；复选框默认未勾；"Accept & Download" 按钮此时 disabled
  3. 勾 Gemma ToU checkbox → 按钮变 enabled；点击后 Dialog 转 `starting` 1–3 秒内变 `fetching`
  4. `fetching` 态：进度条随 `ai:download_progress` 推进，MB 数与 `downloaded/total` 对齐；Cancel 按钮点击后进 `canceled` 终态
  5. 续传路径：`canceled` 状态点 Resume → Dialog 重进 `starting → fetching`，起始 percent > 0（Range resume 生效）
  6. `verifying` 态：Cancel 仍可用；sha256 跑 ~30 秒后进 `completed`
  7. `error` 态（例如手动 offline 触发 NetworkLost）：展示 AppError.detail；`retryable=true` 时显示 Retry
  8. 非终态下 Esc / 点 overlay / 点 close icon 不关闭 Dialog（防误关 5GB 下载）
  9. 下载完成后 `useAiHealthCheck` 5 秒内刷到 `modelPresent=true`，`aiHealthStatus` 从 `model-missing` 转 `loading` → `ready`
- **Evidence**:
  - Screen recording `.cast` / `.mov` 从点按钮到 Dialog 关闭，commit 到 `docs/checkpoints/b/onboarding/` 下
  - 手工跑通两次：一次完整下载 + 一次在 fetching 中途 Cancel 然后 Resume
  - 自动化：`__tests__/hooks/useModelOnboarding.reducer.test.ts`（29 cases）+ SettingsPage Button 渲染单测
- **Independent subagent**: `agent-skills:test-engineer` 审录屏 + reducer 测试覆盖
- **SKIPPED triggers**:
  - 没真跑 5 GB 下载 → 这一项记 SKIPPED，并在 `waivers.md` 说明"dogfood 期补做"（软 gate，可 waive）
  - 非 Mac 平台未验 → 列明，Linux / Win 留作 v0.2 scope
- **FAIL 示例**：Dialog 在 fetching 态可 Esc 关 / Cancel 按钮不真 cancel / `completed` 后 health check 不刷新

### G11 — Context snapshot end-to-end (T1.7)

- **Criterion**: AI chat 能读到终端最近 8 KB 输出并据此作答
  1. 打开终端 tab，`cd /etc/nginx`，`ls`
  2. 在 ChatPanel 问 "这是什么目录，有哪些文件？"
  3. AI 回答需命中 "nginx" 且列出的文件来自 `ls` 实际输出
  4. `ai_context_snapshot` IPC 直接调用（debug 用）返回的 `recentOutput` 字段经过 `redact_probe_output` —— 粘个 `AKIAIOSFODNN7EXAMPLE` 进终端，snapshot 里应出现 `<REDACTED>`
  5. `ai_chat_send` 自动 gather context —— 粘一个 PEM 进终端 prompt 然后 chat，观察 llama.cpp 送入的 prompt（tracing debug 日志）不含原 PEM bytes
- **Evidence**:
  - 手工 transcript: 问题 + AI 回答 + 终端截屏 → `docs/checkpoints/b/context-snapshot/`
  - 自动化：`services::ai::context::tests`（12 pure-function cases）+ `commands::ai::gather_snapshot_from_state` 空态测试
- **Independent subagent**: `agent-skills:security-auditor` 审 scrubber 在 snapshot 路径有效
- **SKIPPED trigger**: 实际 AI 回答质量差（不 "熟悉" 终端上下文）仍可 PASS，只要机制跑通；质量退入 Dogfood G2 信号

---

## Dogfood Gate Trigger (post-CHECKPOINT B)

Passing CHECKPOINT B does not immediately enter Phase 2. SPEC §11 requires 2 weeks of dogfood. The gate items below belong to the Dogfood Retro entry doc, not this rubric, but they depend on CHECKPOINT B data:

- `docs/v0.1-dogfood-log-{YYYYMMDD}.md` — daily entries
- `docs/v0.1-dogfood-retro.md` — Continue / Adjust / Stop decision with citations back to G2.a / G2.b counters

---

## Independent Subagent Assignments (summary)

| Gate | Subagent role                   | Input                                     | Output                         |
| ---- | ------------------------------- | ----------------------------------------- | ------------------------------ |
| G1   | `agent-skills:code-reviewer`    | baseline + v0.1 counts, recordings        | per-task PASS/FAIL + aggregate |
| G3   | `agent-skills:security-auditor` | netstat / outbound capture                | PASS/FAIL                      |
| G4   | `agent-skills:test-engineer`    | tests + React DevTools screenshots + RSS  | PASS/FAIL                      |
| G5   | `agent-skills:security-auditor` | scrubber fixtures + black-box test output | PASS/FAIL per category         |
| G8   | `agent-skills:code-reviewer`    | bindings diff + ERROR_MESSAGES            | PASS/FAIL                      |
| G9   | `agent-skills:test-engineer`    | perf log + recordings                     | PASS/FAIL                      |
| G10  | `agent-skills:test-engineer`    | onboarding recordings + reducer tests     | PASS/FAIL                      |
| G11  | `agent-skills:security-auditor` | context transcript + scrubber 路径        | PASS/FAIL                      |

Subagents are spawned with clean context, read-only tools (`Read`, `Grep`, `Glob`), and a prompt that includes this rubric plus the referenced evidence paths. They MUST NOT be asked for recommendations — only PASS/FAIL judgments per stated criteria.

---

## Gate Ownership

- **Writer of this rubric**: minjian-wu (pre-gate, before any G-item is executed)
- **Executor of each G item**: minjian-wu (produces evidence)
- **Final gate sign-off**: minjian-wu records PASS/FAIL matrix in `docs/checkpoints/b/result.md`; FAIL or SKIPPED on any hard gate blocks v0.1 ship
- **Waivers**: only non-hard items may be waived; waiver requires one-line justification + compensating control in `docs/checkpoints/b/waivers.md`. Hard gates G1, G3, G4, G5, G6, G7 are never waived. G10 / G11 的 "real-model 交互" 部分可 waive 到 dogfood 期补做（reducer/单测已 PASS 时），但 waiver 必须登记。
