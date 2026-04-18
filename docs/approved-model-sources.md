# Approved Third-Party GGUF Sources

SPEC §Never 要求：三方 GGUF 仓库必须登记在本文件。新增源 = Ask First 审批 +
本文件追加一节 + SPEC §Never 的允许清单同步。

---

## `unsloth/gemma-4-E4B-it-GGUF`

| 字段            | 值                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 上游仓库        | https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF                                                                                                                                                                                         |
| 默认变体        | `gemma-4-E4B-it-Q4_K_M.gguf`                                                                                                                                                                                                               |
| sha256 (pinned) | `dff0ffba4c90b4082d70214d53ce9504a28d4d8d998276dcb3b8881a656c742a`                                                                                                                                                                         |
| 字节数          | `4_977_169_088`（4.64 GiB / 4.98 GB）                                                                                                                                                                                                      |
| License         | Apache 2.0（仓库 metadata） + Gemma Terms of Use（权重继承）                                                                                                                                                                               |
| Gated           | 否（无需 HF token）                                                                                                                                                                                                                        |
| 维护方          | Unsloth AI（19k followers 的公司组织）                                                                                                                                                                                                     |
| 最近核查 commit | `main`，2026-04-11 chat template 修复（https://huggingface.co/blog/gemma4）                                                                                                                                                                |
| 审核人          | @minjian-wu                                                                                                                                                                                                                                |
| 审核日期        | 2026-04-18                                                                                                                                                                                                                                 |
| 信任依据        | 1) 公司组织而非个人；2) 2026-04-11 主动跟进上游 llama.cpp chat template 修复，说明维护活跃；3) Q4_K_M 使用 imatrix calibration；4) 与 LM Studio Community、Bartowski 三家变体体积 (4.98/5.34/5.41 GB) 差异可由重量化方法解释，非刻意替换。 |

### Bump checklist（升级新变体 / 新 commit 时）

1. 拉新文件 sha256：`curl -sL https://huggingface.co/api/models/unsloth/gemma-4-E4B-it-GGUF/tree/main | jq '.[] | select(.path == "gemma-4-E4B-it-Q4_K_M.gguf") | .lfs.oid'`
2. 本地 `shasum -a 256 gemma-4-E4B-it-Q4_K_M.gguf` 交叉验证
3. 更新本文件 sha256 pinned 字段 + `src-tauri/src/services/ai/model_download.rs` 常量
4. 更新"最近核查 commit" + 审核日期
5. `docs/llama-cpp-golden-prompts.md` 的 10 个回归 prompt 跑全绿
6. commit 信息模板：`chore(ai): bump Gemma 4 E4B Q4_K_M sha256 to <新 hash>`
