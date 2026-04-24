# Changelog

## 3.2.0-beta.1 - 2026-04-24

### Added

- Local AI plan execution flow with plan cards, per-step confirmation, normalized argv display, file snapshots, and file-level rollback.
- Rolling plan revise support through `ai_plan_step_revise`.
- Docker nginx E2E regression coverage for probe, write, verify, action, and rollback paths.
- Model contract tests for Gemma 4 E4B plan schema compliance and injection safety.
- Documentation for local AI hardware requirements, GGUF model path, Gemma license acceptance, and snapshot storage.

### Changed

- Release gate documentation now treats T-1 baseline, keystroke benchmark, dogfood retro, and post-hoc spike proxy signals as closed product decisions rather than release blockers.
- Version bumped from `3.2.0-alpha.1` to `3.2.0-beta.1`.

### Security

- Snapshot path components are constrained to safe slug characters before they are used as local path segments.
- Probe execution status cleanup is guarded so failed SSH/channel paths do not leave the probe stuck in `Running`.
- Real-model tests avoid registering a global runtime so Metal resources are dropped before test process exit.
