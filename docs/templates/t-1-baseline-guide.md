# T-1 Baseline Recording Guide

> 怎么把 T-1 "AI 启用前基线封存" 做干净。CHECKPOINT B G1（keystroke benchmark
> ≥ 40% 降幅）唯一的参照系。做错了就要从头再来 —— 一次性任务，认真对待。

## 为什么这件事必须你本人做

- 我（Claude）不能登录你的 VPS、不能按键、不能用 QuickTime 录屏 —— 所以没法
  代做
- 基线的 **同一人 + 同一硬件 + 同一任务定义 + 同一计数工具** 是数据有效性的
  核心约束；换人做测量立刻失效

## Prerequisites

- [ ] 一台真实 VPS（Linux，有 nginx + systemd + 一些日志），你平时在用的，不是
      ad-hoc 仓促配置的。CHECKPOINT B 之后你会在启 AI 的前提下跑同一套任务做
      对比，VPS 要稳定可用 4 周以上
- [ ] macOS Terminal.app 或 iTerm2 —— **不**要用 TunnelFiles 自己的 terminal
      （否则 v0.1 运行时会有 AI 介入可能影响计数）
- [ ] 计数工具：推荐 `asciinema` (`brew install asciinema`) —— 录制
      `.cast` 文件可用 `asciinema play` 回放 + grep `\b(?:[a-zA-Z0-9])\b` 事后
      统计按键数。**不**用 QuickTime 屏幕录像 + 肉眼数 —— 数不准
- [ ] 停一切 AI 辅助：关闭 Claude / Copilot / GPT 浏览器 tab；手机静音放一边
- [ ] 新建 `docs/baselines/` 目录（仓库已有）

## 3 个任务定义（**不要**事后改题目）

这三个任务一旦开始录就锁定。CHECKPOINT B 会用相同题目再跑一次启 AI 的版本
对比。若你中途觉得题目不好想换题 → 已录的所有数据作废，从头来。

### Task A: 给 nginx 加 gzip 并验证

- 目标：在 `/etc/nginx/nginx.conf` 里开启 gzip，`nginx -t` 通过，`systemctl
reload nginx` 成功
- 不提供线索，不查资料之外的步骤，全程独立操作
- 期望完成态：`curl -H "Accept-Encoding: gzip" -I <server>` 能看到
  `Content-Encoding: gzip`

### Task B: 某服务为什么没起来

- **准备**：开始录制**前**故意把 `/etc/systemd/system/some.service` 改坏
  （例如 ExecStart 路径写错），`systemctl daemon-reload`，不启动
- 目标：诊断服务失败原因并修正（看 `systemctl status` / `journalctl`）
- 期望完成态：`systemctl is-active some.service` 返回 `active`

### Task C: 清理 7 天前的日志

- 目标：`/var/log/myapp/*.log` 中 mtime 超过 7 天的清理掉（删除或 truncate）
- 期望完成态：`find /var/log/myapp -name '*.log' -mtime +7` 返回空

## 录制协议

```bash
# 每个任务录 3 遍；每遍命名：task-{a,b,c}-run-{1,2,3}.cast
asciinema rec docs/baselines/task-a-run-1.cast

# 运行时你在 SSH 到 VPS 的状态下做所有工作
# 完成后 Ctrl-D 或 exit 退出

# 重复直到 9 份录制齐
```

**每次录制前**：

- [ ] 硬件 state 一致（同一台 Mac、同一个网络环境、VPS 无残留 state）
- [ ] 间隔 ≥ 24h（短期记忆防污染）
- [ ] 每次跑前把 VPS 恢复到同一个 "问题态"（对 Task B 特别重要 —— 每跑一遍
      都要故意改坏一次 systemd unit）
- [ ] 不复制粘贴别的 shell 历史

## 按键计数

录制完成后用一个脚本把 asciinema cast 的 stdin 事件 `x` 字段累加：

```bash
# 粗糙版本 —— 把每条 stdin 事件的长度加起来（方向键 / 回车 / 普通字符都算 1）
jq -s 'map(select(.[1] == "i")) | map(.[2] | length) | add' docs/baselines/task-a-run-1.cast
```

> cast 文件第一行是 header JSON，后续是 `[ts, "o"|"i", data]`。上面 jq 命令
> 会漏掉 header —— 实战用 `tail -n +2 | jq …`。

每个任务把 3 次的按键数取中位数，写进 `docs/baselines/raw-counts.md`：

```markdown
# T-1 Raw Keystroke Counts

## Task A (nginx gzip)

| Run | Date | Keystrokes | Wall-clock | Errors | Google queries |
| --- | ---- | ---------- | ---------- | ------ | -------------- |
| 1   | ...  | 342        | 4m12s      | 1      | 2              |
| 2   | ...  | 358        | 3m48s      | 0      | 1              |
| 3   | ...  | 325        | 3m55s      | 0      | 1              |

**Median**: 342 keystrokes, 3m55s, 0-1 errors per run.

## Task B (service debug)

...

## Task C (log cleanup)

...
```

## Git 打 tag 锁定

9 份录制 + raw-counts.md 全部 commit 后：

```bash
git add docs/baselines/
git commit -m "docs(baseline): T-1 keystroke recordings pre-AI-sprint"
git tag baseline-pre-ai-sprint
git push --tags  # 若 remote 存在
```

**之后 `docs/baselines/` 只读**。CHECKPOINT B 时独立 subagent 会 diff
`baseline-pre-ai-sprint` tag 和 HEAD 目录，任何改动 = gate 失败（tampering
防护）。

## CHECKPOINT B 对比阶段（启 AI 后）

T-1 完成后放一段时间。等 T1.5 真模型跑通 + 你实际用 AI 做事 3 天以上，再安排
CHECKPOINT B 的 benchmark 对比：

1. 启 AI，打开 ChatPanel
2. 跑同 3 任务各 3 遍（同样 asciinema 录）→ `docs/benchmarks/v0.1/`
3. 按键计数同样脚本跑一遍
4. 写 `docs/keystroke-benchmarks-v0.1.md` 对比表 + 百分比降幅
5. spawn `agent-skills:code-reviewer` 独立复核

合格线：每个任务 ≥ 40% 降幅。不合格 → Dogfood Retro 走 `Adjust` 决策。

## 常见误区

- **别挑熟悉任务**：挑你平时手顺的任务，baseline 数字已经很低，启 AI 后降幅
  达不到 40% 的概率大。挑有 "查文档 / 调试 / 试错" 成分的
- **别中途补录**：录第 2 轮时发现第 1 轮有问题 → 重录所有 3 轮，不要单独换
  第 1 轮
- **别跨机器**：基线在 Mac 录，对比时也 Mac；换成 Windows 立刻失效
- **别解释给自己听**："这一轮键盘坏了数偏高" 之类的说辞 = 数据污染；如实记
  录即使看起来不利

## 交付清单

- [ ] `docs/baselines/task-{a,b,c}-run-{1,2,3}.cast`（9 个文件）
- [ ] `docs/baselines/raw-counts.md`
- [ ] `docs/baseline-methodology.md`（简短一页，题目定义 + 禁改声明）
- [ ] git tag `baseline-pre-ai-sprint` 存在
- [ ] 三个 commit（录制 / raw counts / methodology）可追溯
