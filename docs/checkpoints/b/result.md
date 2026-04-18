# CHECKPOINT B Result (template — fill at gate time)

Final PASS/FAIL matrix for v0.1 α release gate.

- **Gate date**: YYYY-MM-DD
- **App version**: `3.2.0-alpha.1`
- **Commit**: `<hash>`
- **Rubric**: `docs/checkpoint-b-rubric.md`（不要 mid-gate 改）
- **Sign-off**: @minjian-wu

## Matrix

| Gate | Status                | Evidence path                                               | Independent subagent verdict |
| ---- | --------------------- | ----------------------------------------------------------- | ---------------------------- |
| G1   | PASS / FAIL / SKIPPED | `docs/keystroke-benchmarks-v0.1.md`                         |                              |
| G2   | deferred              | collected during dogfood → `docs/v0.1-dogfood-log-*.md`     |                              |
| G3   | PASS / FAIL / SKIPPED | `docs/checkpoints/b/netstat-{platform}.txt`                 |                              |
| G4   | PASS / FAIL / SKIPPED | `docs/checkpoints/b/ai-off/*` + unit test refs              |                              |
| G5   | PASS / FAIL / SKIPPED | `cargo test scrubber` log + `scrubber-coverage.txt`         |                              |
| G6   | PASS / FAIL / SKIPPED | `docs/checkpoints/b/ci-run.md` or quality-logs/             |                              |
| G7   | PASS / FAIL / SKIPPED | `docs/checkpoints/b/version-check.txt`                      |                              |
| G8   | PASS / FAIL / SKIPPED | bindings diff log                                           |                              |
| G9   | PASS / FAIL / SKIPPED | `docs/v0.1-perf.md`                                         |                              |
| G10  | PASS / FAIL / SKIPPED | `docs/checkpoints/b/onboarding/*.cast` + reducer test count |                              |
| G11  | PASS / FAIL / SKIPPED | `docs/checkpoints/b/context-snapshot/transcript.md`         |                              |

## Decision

- [ ] **GATE PASSED** — enter 2-week dogfood; no Phase 2 work permitted until retro
- [ ] **GATE FAILED** — list failed gates + recovery plan; no dogfood entry
- [ ] **PARTIAL + WAIVED** — hard gates all PASS, G10/G11 partially waived per
      `docs/checkpoints/b/waivers.md`; dogfood entry ok

## Notes

（任何不适合填进 matrix 的 context 写这里，例如跨平台 netstat 结果不同 /
某个 G9 延迟边缘超过门槛但有合理解释）
