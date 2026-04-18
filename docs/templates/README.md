# Templates

手工流程模板。复制后填数据，不要在 `templates/` 里直接写内容 —— 目录是只读
reference。

## 使用顺序

1. **`t-1-baseline-guide.md`** — 最早做，AI 启用前的 keystroke 基线封存
   操作手册。按步骤录 9 份 `.cast` → `docs/baselines/` + git tag
   `baseline-pre-ai-sprint`。一次性任务，一旦 tag 后不可改
2. **`v0.1-dogfood-log.md`** — CHECKPOINT B 通过后每日复制一份到
   `docs/v0.1-dogfood-log-{YYYYMMDD}.md`，连续 14 天
3. **`v0.1-dogfood-retro.md`** — 14 天末复制到 `docs/v0.1-dogfood-retro.md`，
   从 daily log 聚合数据，spawn 独立评估 subagent，写 Continue / Adjust /
   Stop 决策

## Related

- `docs/checkpoint-b-rubric.md` — 门槛定义
- `docs/checkpoints/b/result.md` — 最终 PASS/FAIL 矩阵
- `docs/checkpoints/b/waivers.md` — soft gate waiver 登记
- `docs/checkpoints/b/phase1-progress.md` — 当前代码完工状态
