# Phase 1 Progress Snapshot

Tracked record of v0.1 α implementation status. Updated as commits land. Used by CHECKPOINT B rubric (`docs/checkpoint-b-rubric.md`) and as the next-session continuity anchor.

## Snapshot (2026-04-18)

### Tests

- Backend: **324** unit + **1** ignored integration (`cargo test --lib --bins`)
- Frontend: **499** Vitest specs (`pnpm test:run`)
- Quality gates: `cargo fmt --check`, `cargo clippy --lib --bins -- -D warnings`, `pnpm lint`, `pnpm format:check`, `pnpm tsc --noEmit` — all clean
- `cargo audit`: 0 vulnerabilities, 20 transitive `unmaintained` warnings (gtk-rs / proc-macro-error), pre-existing

### Landed Tasks

| Task                           | Notes                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| T1.1 AI-off plumbing           | Settings field + `AiUnavailable` ErrorCode + Settings AI section                                                                        |
| T1.2 Scrubber 双策略           | user-input warn + probe-output hard-erase, regex + Shannon entropy, HTTP auth headers                                                   |
| T1.3 1a RAM gate               | `MemoryProbe` trait + `resource_check` (≥6 GB)                                                                                          |
| T1.3 1b llama-cpp-2 dep        | `=0.1.143` strict pin, target-conditional Metal feature, `cmake` system prereq, CI updated, `docs/llama-cpp-golden-prompts.md` skeleton |
| T1.3 2a GGUF sha256            | streaming verifier + `compute_gguf_sha256` helper                                                                                       |
| T1.3 2b LlamaRuntime::load     | three gates compose (RAM → sha → backend init → FFI), Debug impl                                                                        |
| T1.3 3a generate orchestration | `GenerateOptions` / `GenerationOutcome` / `TokenSource` trait / `run_generation_loop`                                                   |
| T1.3 3b prep                   | `TokenSource::next_token -> AppResult<Option<String>>` for FFI error propagation                                                        |
| T1.3 3b proper                 | `LlamaTokenLoop` FFI (context + greedy sampler + LlamaBatch + accumulating decoder) + `LlamaRuntime::generate`                          |
| T1.3 3c-1a                     | `LOADED_RUNTIME` OnceLock + `loaded_runtime()` + load returns `Arc<LlamaRuntime>`                                                       |
| T1.3 3c-1b                     | `chat::run_chat_stream` forks real (`spawn_blocking`) vs stub echo                                                                      |
| T1.3 3c-2                      | `assemble_prompt` runs user_text through `prompt::build` (scrubber + system prompt)                                                     |
| T1.3 4 SystemRamProbe          | macOS `sysctlbyname("hw.memsize")` + Linux `/proc/meminfo`, libc promoted to direct dep                                                 |
| T1.3 5 ignored real-model test | `cargo test --test llama_load_real -- --ignored` exercises load + generate smoke                                                        |
| T1.3 runtime_ready             | `IS_LOADED` AtomicBool + `health::check` parametric on bool                                                                             |
| T1.4 A/B/C                     | `AiHealthResult` + `AcceleratorKind` (ts-rs) → `ai_health_check` IPC → `useAiHealthCheck` (5s poll) → `AiHealthBadge` 4-state           |
| T1.6 prep                      | untrusted-wrap primitives, `useAiSessionStore` (per-tab, full streaming lifecycle), `MessageList`, `ChatInput`, `ChatPanel`             |
| T1.6 stub backend              | `ai_chat_send` + `ai:thinking`/`ai:token`/`ai:done`/`ai:error` payloads (ts-rs) + 20ms-paced echo                                       |
| T1.6 stub frontend             | `useAiChat` (StrictMode-safe listener) + `ChatPanel` defaults to IPC                                                                    |
| T1.6 wiring                    | `ChatPanelLauncher` (Cmd/Ctrl+Shift+A) mounted in `FileManagerPage` toolbar                                                             |
| T1.8 cancel                    | `ai_chat_cancel` IPC + `CANCEL_REGISTRY` + `ChatInput` Stop button + `useAiChat.cancel`                                                 |
| T1.8 entropy                   | `detectInputWarnings` mirrors Rust scrubber + `ChatInput` aria-live chip panel                                                          |
| T1.9 命令注入                  | `parseMessageBlocks` fenced parser + Insert button + `getTerminalBySession` wiring (no newline)                                         |
| T1.10 scrubber blackbox        | 5 secret types × 3 placements + negative control + smoke (`tests/scrubber_blackbox.rs`)                                                 |

### Remaining (Ask First or manual)

| Item                                | Blocker                                                                  | Notes                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| T1.0a `ManagedTerminal` ring buffer | Ask First — extends unsafe Send/Sync invariant                           | Prereq for T1.7 context snapshot                                                                        |
| T1.5 model download onboarding      | Ask First — `reqwest` direct dep + `windows-acl` (T3.2 territory) future | Gemma ToU accept dialog + GGUF download with sha256 verify + progress bar                               |
| T1.7 context snapshot auto-inject   | Blocked on T1.0a                                                         | `assemble_prompt` already accepts `context: Option<ContextSnapshot>` — wiring trivial once buffer lands |
| T-1 baseline keystroke recording    | Manual founder action                                                    | 3 tasks × 3 runs without AI; tag `baseline-pre-ai-sprint`                                               |
| Real-model dogfood                  | Blocked on T1.5                                                          | Run `cargo test --test llama_load_real -- --ignored` after Gemma 4 E4B GGUF downloaded                  |

### Known Gaps (non-blocking, follow-up tickets)

- **Gemma chat template not applied**. `assemble_prompt` produces `User:\n...` instead of `<start_of_turn>user\n...<end_of_turn>`. Gemma 4 may behave acceptably without it but won't be optimal. Fix: use `model.apply_chat_template_oaicompat` or write a hand-rolled template wrapper. Defer until first dogfood reveals quality issue.
- **Pre-existing test-only clippy warnings** in `services/transfer_manager.rs` (manual_range_contains style). CLAUDE.md gate uses `cargo clippy -- -D warnings` (no `--tests`), so commit-time gate stays green. Optional cleanup later.

### Commits Log (Phase 1)

Most recent first; truncated for snapshot, see `git log --oneline` for full history.

```
bc5eeb4 feat(ai): chat real path runs user_text through prompt::build (slice 3c-2)
674b628 feat(ai): chat module forks real generate vs stub echo (slice 3c-1b)
ac81d34 feat(ai): LOADED_RUNTIME registry, load returns Arc<LlamaRuntime> (slice 3c-1a)
06ee0e8 feat(ai): real LlamaTokenLoop FFI + LlamaRuntime::generate (slice 3b)
44a102c refactor(ai): TokenSource returns AppResult so FFI errors propagate
eb139a5 feat(ai): generate orchestration layer (slice 3a)
2094289 feat(ai): wire runtime_ready from atomic flag (slice 3 prep)
e253726 feat(ai): inline safety warnings in ChatInput (T1.8 entropy UX)
441c932 feat(ai): cancel UX — Stop button + useAiChat.cancel (T1.8 frontend)
00ed703 feat(ai): ai_chat_cancel + cancel registry (T1.8 backend)
f4a920d feat(ai): "insert to terminal" button for code blocks (T1.9)
d96593f feat(ai): mount ChatPanelLauncher in FileManagerPage toolbar (T1.6 wiring)
d36230d feat(ai): useAiChat hook wires events to store; ChatPanel uses IPC by default
111c118 feat(ai): ai_chat_send IPC + event scaffold (T1.6 stub)
eeea07a feat(ai): ChatPanel composition (T1.6 prep)
284aa39 feat(ai): ChatInput component with Enter-submit semantics (T1.6 prep)
dadb675 feat(ai): MessageList component for chat history (T1.6 prep)
f09ee68 feat(ai): prompt::build + T1.10 scrubber pre-send blackbox test
d4ac288 feat(ai): per-tab chat session store (T1.6 prep)
0879f23 feat(ai): wrap untrusted content for prompt injection defense (T1.6 prep)
cbba43f feat(ai): useAiHealthCheck + AiHealthBadge (T1.4 slice C)
a917ce7 feat(ai): expose ai_health_check via IPC + TS wrapper (T1.4 slice B)
25770fb feat(ai): add health check model and service (T1.4 slice A)
fce7615 feat(ai): SystemRamProbe via libc sysctlbyname / proc meminfo
dc7f537 feat(ai): compute_gguf_sha256 + ignored real-model load test
21ece74 feat(ai): LlamaRuntime::load composition (T1.3 slice 2b)
87606b7 feat(ai): land llama-cpp-2 dependency (T1.3 slice 1b)
a522e7d feat(ai): verify GGUF sha256 before model load (T1.3 slice 2a)
c741bb5 feat(ai): add llama runtime RAM gate skeleton (T1.3 slice 1a)
a5b7ac4 docs(sprint): add checkpoint-b rubric for v0.1 release gate
d675508 feat(security): add credential scrubber with dual strategy (T1.2)
15a58b6 feat(settings): add AI-off plumbing (T1.1)
```

## CHECKPOINT B Distance

Hard gates from `docs/checkpoint-b-rubric.md` and their current status:

- G1 keystroke benchmark — **blocked** on T-1 baseline recording
- G2 spike proxy signals — collected during dogfood, post-CHECKPOINT B
- G3 no listening port / no external HTTP — **likely PASS** (in-process llama.cpp; verify with netstat at gate)
- G4 AI-off plumbing dormant — **PASS** (Settings disable hides ChatPanelLauncher; runtime not loaded; tests confirm)
- G5 scrubber blackbox proofs — **PASS** (T1.10 + T1.2 fixtures green)
- G6 lint/format/test — **PASS** (all green at HEAD)
- G7 version triple sync — **not started** (need bump to `3.2.0-alpha.1`)
- G8 ErrorCode + bindings hygiene — **PASS** (`AiUnavailable` + ts-rs bindings auto-generated)
- G9 chat-streaming UX perf — **blocked** on real model + perf measurement run

To advance to CHECKPOINT B: T1.5 (real download) → real-model dogfood → benchmark + `docs/v0.1-perf.md`.
