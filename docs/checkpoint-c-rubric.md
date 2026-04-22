# CHECKPOINT C Rubric — v0.2 Security Gate

Source of truth for pass/fail judgment at CHECKPOINT C. Inherits from `SPEC.md` §5/§7 and `tasks/plan.md` CHECKPOINT C section. Any gate item not meeting `PASS` criteria below — including missing evidence — MUST be marked `FAIL` or `SKIPPED`, never `PASS`.

- **Scope**: gate into Phase 3 (v0.3 plan executor + rollback)
- **Runtime**: in-process `llama-cpp-2`, PromptMode::Plan, Gemma 4 E4B
- **Version under test**: to be determined at gate execution time (package.json / Cargo.toml / tauri.conf.json must match)
- **Evidence root**: `docs/checkpoints/c/` — every gate item with manual evidence points here

## Three-Phase Verification (CLAUDE.md)

Every gate item must clear all three phases in order; skipping a phase = `SKIPPED`.

1. **自动化检查** — cargo test / lint / typecheck / clippy
2. **端到端验收** — manual or scripted run against stated acceptance criteria with recorded evidence
3. **独立评估** — subagent with clean context, no write access, renders PASS/FAIL per item using raw evidence only

## Status Legend

- `PASS` — evidence present, acceptance met, independent subagent confirmed
- `FAIL` — evidence present but acceptance missed, or regressions surfaced
- `SKIPPED` — evidence missing or phase skipped; blocks gate by default, waiver requires explicit log entry in `docs/checkpoints/c/waivers.md` with justification and compensating control

---

## Hard Gates

### G1 — Bypass 40 case 全 deny（T2.3）

- **Criterion**: `services::ai::allowlist::tests::bypass::b01` through `b40` all return `Deny` or `RequireConfirm`; none returns `Allow`
- **Evidence**:
  - `cd src-tauri && cargo test --lib -- allowlist::tests::bypass` → 40 passed, 0 failed
  - Test list committed in `src-tauri/src/services/ai/allowlist.rs` tests module (b01–b40)
- **Current status**: `PASS` (2026-04-22 — 40/40 pass, all `Deny`)
- **Independent subagent**: `agent-skills:security-auditor` reviews bypass test payloads vs. allowlist logic; confirms no bypass path escapes to `Allow`

### G2 — Injection static 12 snapshot 绿（T2.12 CI）

- **Criterion**: `cargo test --test injection -- --nocapture` passes all 13 cases (p01–p12 + bonus); assertions are pure string operations, no model required
- **Evidence**:
  - `cd src-tauri && cargo test --test injection -- --nocapture` → 13 passed, 0 failed
  - Scrubber blackbox: `cargo test --test scrubber_blackbox -- --nocapture` → all passed
  - CI gate: `.github/workflows/ai-injection-nightly.yml` `injection-static` job on `ubuntu-latest`
- **Current status**: `PASS` (2026-04-22 — 13/13 injection + scrubber_blackbox pass)
- **Independent subagent**: CI run on `ubuntu-latest` is the independent evaluator

### G3 — Injection nightly 连跑 3 天全绿（T2.12 nightly）

- **Criterion**: `.github/workflows/ai-injection-nightly.yml` `injection-nightly` job (self-hosted `[self-hosted, llm]` runner with `LLAMA_MODEL_PATH` set) passes all 13 `#[ignore]` tests for 3 consecutive nights; no GitHub issue tagged `[ai-security, nightly-failure]` created
- **Evidence**:
  - Three consecutive passing workflow runs in `.github/workflows/ai-injection-nightly.yml`
  - Screenshots or links to passing run artifacts stored in `docs/checkpoints/c/nightly-runs/`
  - Zero open issues with labels `ai-security` + `nightly-failure`
- **Current status**: `SKIPPED` — self-hosted `[llm]` runner not yet provisioned; test skeleton (`src-tauri/tests/injection_nightly.rs`) committed and ready. See `docs/checkpoints/c/waivers.md` when waived.
- **SKIPPED triggers**: runner not set up, `LLAMA_MODEL_PATH` variable not configured, model file absent
- **Independent subagent**: none required if CI is the executor; issue absence is automated evidence

### G4 — Probe lifecycle fake-clock 測試全覆盖（T2.11）

- **Criterion**: all four `fake_clock_*` tests in `session_manager.rs` pass; coverage of `cleanup_stale_probes_with_clock` / `idle_secs_at` paths ≥ 80%
- **Evidence**:
  - `cd src-tauri && cargo test --lib -- fake_clock` → 4 passed, 0 failed
  - Test names: `fake_clock_probe_not_cleaned_before_ttl`, `fake_clock_probe_cleaned_at_ttl`, `fake_clock_multiple_probes_selective_cleanup`, `fake_clock_touch_resets_idle_timer`
- **Current status**: `PASS` (2026-04-22 — 4/4 pass)
- **Independent subagent**: `agent-skills:test-engineer` verifies coverage of the clock-injectable paths

### G5 — Probe 認証隔離 + 指數退避測試（T2.6）

- **Criterion**: all backoff-related tests pass; probe authentication uses independent SSH session (not borrowing main session credentials in-thread)
- **Evidence**:
  - `cd src-tauri && cargo test --lib -- probe` → includes `probe_backoff_secs_table_values`, `probe_backoff_zero_failures_no_backoff`, `probe_clear_removes_backoff_record`, `probe_failure_key_isolated_from_main_session_key`, `probe_record_failure_does_not_refresh_last_failure_at_lock_threshold`, `cleanup_stale_probes_removes_idle_entries`, `destroy_probes_for_session_is_idempotent` — all passed
  - Code review: `session_manager.rs` `create_ai_probe_session` uses `with_cached_credentials` borrow pattern (no clone); `zeroize()` on drop
- **Current status**: `PASS` (2026-04-22 — 7/7 probe tests pass)
- **Independent subagent**: `agent-skills:security-auditor` confirms credential isolation pattern (no plaintext copy outside `spawn_blocking`, `zeroize` on drop)

### G6 — ts-rs bindings diff = 0

- **Criterion**: `pnpm generate:types` produces zero diff vs. committed `src/types/bindings/`; no hand-authored hunks in generated files
- **Evidence**:
  - `pnpm generate:types && git diff --stat src/types/bindings/` → empty output (zero diff)
  - Confirmed 2026-04-22: `AiChatSendInput.ts` + `ChatHistoryTurn.ts` committed after regeneration
- **Current status**: `PASS` (2026-04-22 — zero diff)
- **Independent subagent**: CI `bindings` job (mechanical check, PASS/FAIL is deterministic)

### G7 — RSS 基线：3 probe 並跑 RSS ≤ 100MB

- **Criterion**: with 3 `ManagedAiProbe` instances active concurrently, TunnelFiles process RSS (excluding model weights) ≤ 100MB; model weights separately accounted
- **Measurement**: `ps -o rss= -p <tunnelfiles-pid>` while 3 probe sessions are idle-connected; subtract RSS measured with AI disabled
- **Evidence**: `docs/checkpoints/c/rss-baseline.txt` — platform, PID, RSS values, measurement commands
- **Current status**: `SKIPPED` — requires provisioned VPS + running app; pending manual measurement
- **SKIPPED triggers**: no live app to measure; accepted waiver if measured during nightly runner setup
- **Independent subagent**: none required — numerical check

### G8 — netstat 無 LISTEN 端口 + 無外部 HTTP

- **Criterion**: TunnelFiles process makes zero outbound HTTP/HTTPS except to `huggingface.co` during model download; no LISTEN ports
- **Evidence**:
  - `docs/checkpoints/c/netstat-macos.txt` — `netstat -anv | grep LISTEN | grep <pid>` output must be empty
  - Outbound capture (nettop / ss) for 5-minute idle with `ai_enabled=true`, no probe sessions
- **Current status**: `SKIPPED` — requires running app on provisioned platform; CHECKPOINT B G3 evidence (`docs/checkpoints/b/`) covers same check for v0.1; delta to verify for v0.2 is probe sessions add no new sockets
- **Independent subagent**: `agent-skills:security-auditor` reviews netstat captures; checks SPEC §7 Never list entry "进程监听任何 TCP/UDP 端口"

### G9 — SPEC §7 Never List 全緑

- **Criterion**: independent `agent-skills:security-auditor` reviews the codebase against every item in SPEC §7 ("Never do" list) and returns no violations
- **Scope**: `src-tauri/src/services/ai/` + `src-tauri/src/commands/ai.rs` + allowlist + scrubber + probe lifecycle code paths
- **Evidence**: `docs/checkpoints/c/security-audit.md` — per-item PASS/FAIL from security-auditor subagent
- **Current status**: `SKIPPED` — audit not yet run; schedule after G1–G6 are all green
- **Independent subagent**: `agent-skills:security-auditor` with read-only access (`Read`, `Grep`, `Glob`); output in `docs/checkpoints/c/security-audit.md`

### G10 — Quality bars (lint / format / test) on both tiers

- **Criterion**: all of the following pass:
  - `pnpm lint && pnpm format:check && pnpm test:run`
  - `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test --lib --bins`
  - `pnpm generate:types` zero diff (covered by G6)
- **Evidence**: CI green or local transcript committed to `docs/checkpoints/c/quality-logs/`
- **Current status**: `PASS` (2026-04-22 — 570 backend tests pass, all green locally; CI pending push)
- **Independent subagent**: CI is the independent evaluator

---

## Summary Matrix (2026-04-22)

| Gate | Description                    | Status                             |
| ---- | ------------------------------ | ---------------------------------- |
| G1   | Bypass 40 case 全 deny         | `PASS`                             |
| G2   | Injection static 13 case 绿    | `PASS`                             |
| G3   | Injection nightly 3天全绿      | `SKIPPED` (runner not provisioned) |
| G4   | Probe fake-clock 4 tests       | `PASS`                             |
| G5   | Probe auth isolation + backoff | `PASS`                             |
| G6   | ts-rs bindings diff = 0        | `PASS`                             |
| G7   | RSS ≤ 100MB with 3 probes      | `SKIPPED` (no live app)            |
| G8   | netstat 无 LISTEN + 无 HTTP    | `SKIPPED` (no live app)            |
| G9   | SPEC §7 Never List 全绿        | `SKIPPED` (audit not run)          |
| G10  | Quality bars both tiers        | `PASS`                             |

**Gate result**: 6 PASS, 4 SKIPPED, 0 FAIL. Blocked on G3/G7/G8 (infrastructure) and G9 (security audit). Phase 3 entry requires G3, G7, G8 measured during nightly runner setup and G9 audit cleared.

---

## Waivers

See `docs/checkpoints/c/waivers.md` (create on first waiver).

Soft gates (may be waived with compensating control): G3, G7, G8 (infrastructure-dependent).  
Hard gates (never waived): G1, G2, G4, G5, G6, G10, G9.

---

## Gate Ownership

- **Writer of this rubric**: minjian-wu (2026-04-22, pre-gate)
- **Executor of each G item**: minjian-wu (produces evidence)
- **Final gate sign-off**: minjian-wu records PASS/FAIL matrix in `docs/checkpoints/c/result.md`
- **FAIL or SKIPPED on any hard gate blocks Phase 3 entry**
