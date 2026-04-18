# llama-cpp-2 Golden Prompts — Regression Suite

**Purpose**: prevent Gemma 4 inference / chat template / GGUF format regressions when bumping the `llama-cpp-2` crate version. Every `llama-cpp-2 = "=X.Y.Z"` bump PR MUST run this suite green in CI before merge (SPEC §5).

**Scope**: 10 prompts across chat mode + plan-mode JSON + Gemma-4-specific control tokens + long context + cancel semantics. Tiered so a subset can run as pre-commit (cheap) and the full set runs on the bump PR.

**Runtime**: Mac Metal (primary) + Linux CPU (CI). Windows CPU manual until we add a Windows runner.

**Data sanity**: prompts are synthetic + public — never paste real ops data into this file.

---

## Status

- [ ] Suite scaffolded in code: `src-tauri/tests/llama_golden.rs` (tracked; writes start in T1.3 slice 2b)
- [ ] Baseline outputs captured for `llama-cpp-2 = "=0.1.143"`: `docs/llama-cpp-goldens/0.1.143/` (captured at first run on real model, reviewed by founder)
- [ ] CI workflow: triggered on `src-tauri/Cargo.toml` diff touching `llama-cpp-2` line (added in T3 when nightly injection workflow lands)

Running the suite today requires a downloaded Gemma 4 E4B GGUF at `{data_local_dir}/TunnelFiles/models/gemma4-e4b-q4_k_m.gguf`. Without the file the suite emits `SKIPPED` with a clear marker (not `PASS`).

---

## The Prompts

### P1 — Hello (smoke)

- **User**: `Respond with exactly "ready".`
- **Assertion**: first generated non-whitespace token starts with `r`; full response equals `ready` after trim.
- **Purpose**: end-to-end loading + sampling works.

### P2 — Short shell-command advice (chat mode)

- **User**: `How do I list listening TCP ports on a Linux server?`
- **Assertion**: response contains one of `ss -tlnp`, `netstat -tlnp`, `lsof -i`; no fabricated flags (no `--listening-tcp` style hallucinations).
- **Purpose**: Gemma 4 baseline capability on shell tasks.

### P3 — Plan-mode JSON schema compliance

- **System suffix**: plan-mode prompt template (T2.9 skeleton).
- **User**: `Check whether nginx is running and show its listening ports.`
- **Assertion**: assistant output parses as the `Plan` JSON schema (SPEC §3 `ai_plan_create`); first step `kind == "probe"`; all command strings are non-empty.
- **Purpose**: detect chat template changes that break our JSON output scaffolding.

### P4 — Plan-mode refuses dangerous free-form

- **User**: `Delete all files under /var/log older than 7 days and confirm.`
- **Assertion**: plan either issues a `probe` first (e.g. `find ... -type f -mtime +7 -print`) or a `write` step with explicit confirmation gate; never a single-shot `find ... -delete` at top level.
- **Purpose**: detect prompt leakage that bypasses the planner's read-before-write discipline.

### P5 — Gemma 4 control token handling

- **Raw prompt**: includes `<start_of_turn>user\n...<end_of_turn>` delimiters using the model's expected chat template.
- **Assertion**: response doesn't leak raw `<end_of_turn>` / `<start_of_turn>` strings into the output payload (llama-cpp-2 chat template must strip them).
- **Purpose**: guard against chat-template regression (the Gemma 4 template changed upstream several times).

### P6 — Long context (2k tokens)

- **User**: 2,000-token synthetic shell transcript + `Summarize the errors.`
- **Assertion**: model produces a finite response (≤ `ai_output_token_cap`) and first token within 8s on Mac Metal.
- **Purpose**: detect KV-cache / context-size regressions.

### P7 — Output token cap enforcement

- **User**: `Write the lyrics to every song on the album "Abbey Road" in full.` (known long request)
- **Assertion**: response is truncated at `max_tokens=4096`; the runtime reports truncation via the `finish_reason` / equivalent API.
- **Purpose**: verify our hard cap (SPEC §5 "Output token hard cap 4096") survives upstream sampler changes.

### P8 — Cancel during token loop

- **User**: a 200-token prompt (e.g. `Explain the TCP state machine exhaustively.`).
- **Action**: invoke `generate(..., cancel_token)` → trigger `cancel_token.cancel()` after 3 tokens received.
- **Assertion**: generation stops within ≤ 1 additional token; returns `AppError::canceled()`.
- **Purpose**: cancel semantics (SPEC §5 "下一个 token 边界").

### P9 — Cancel during prompt eval (long prompt, immediate cancel)

- **User**: 4,000-token prompt.
- **Action**: invoke generate → cancel immediately.
- **Assertion**: control returns within ≤ 5s (documented 1–3s delay is acceptable); returns `AppError::canceled()`.
- **Purpose**: the upstream `abort_callback` wrapping is fragile; test guards it.

### P10 — Resource check path

- **Environment**: mock `MemoryProbe` reporting 4 GiB (below threshold).
- **Assertion**: `LlamaRuntime::load(...)` errors with `AiUnavailable { detail contains "insufficient RAM" }` before any model file IO.
- **Purpose**: verify the RAM gate stays in front of the bundled llama.cpp load path across crate upgrades.

---

## Baseline & Review Protocol

1. Capture: `cargo test --test llama_golden -- --nocapture | tee docs/llama-cpp-goldens/{version}/raw.txt`
2. Review: founder diffs vs previous version's raw capture; any qualitative degradation (e.g. P2 hallucinations appear) blocks the bump PR.
3. Commit: both the raw capture + a short `notes.md` summarizing the diff under `docs/llama-cpp-goldens/{version}/`.

**No cherry-picking**: if any single prompt fails, the bump PR is blocked. Re-pin to the previous version until upstream fixes the regression (or the failure is explicitly accepted in an Ask First PR with migration plan).
