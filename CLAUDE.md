# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TunnelFiles - 跨平台桌面 SSH/SFTP 可视化文件管理器

## 文档

- 产品需求: @docs/PRD.md
- 系统架构: docs/architecture.md
- 任务拆分: docs/tasks/ (按阶段拆分)
  - 状态索引: docs/tasks/status.yaml (快速查看进度)
  - P0-P8 阶段: docs/tasks/p*.md

## 开发命令

```bash
pnpm tauri dev      # 完整开发环境
pnpm tauri build    # 生产构建
pnpm lint           # ESLint 检查
pnpm format         # Prettier 格式化
```

## 核心规范

**注释原则**: 仅在关键位置注释，命名自解释，注释简短有意义

详细编码规范见 `.claude/rules/`

## 开发注意事项

**Rust/ssh2**:
- `ssh2::Sftp` 非 Send/Sync，不能跨线程传递
- 解决：用 `spawn_blocking` 并传入 `Arc<ManagedSession>`，在闭包内访问 `&session.sftp`

**Rust/错误处理**:
- `ErrorCode` 枚举无 Display trait，序列化用 `serde_json::to_string()`

**React 规范**:
- 弹窗状态重置用 `onOpenChange` 回调，不用 `useEffect`
- JSX 中引号用 `&ldquo;` `&rdquo;` 转义
- 事件回调中需要可变计数器时用 `useRef`，避免 `useState` 闭包陷阱

**ESLint**:
- 新增浏览器全局类型需在 `eslint.config.js` 的 globals 中添加

**IPC 命令**:
- 前后端命令名必须完全匹配，重命名时用 grep 检查一致性
- 已发现问题：`session_connect_trusted` vs `session_connect_after_trust`

**UI 状态持久化**:
- 简单 UI 偏好（折叠状态等）用 localStorage，参考 `src/lib/theme.tsx`
- 功能配置用后端 Settings 系统

## 开发流程建议

**任务状态同步**:
- 完成功能后及时更新 `docs/tasks/status.yaml`
- 实际代码与任务文件状态保持一致，避免重复工作

**依赖规划**:
- 开发前确认所需 Tauri 插件和 UI 组件已安装
- 已集成插件: `tauri-plugin-opener`, `tauri-plugin-dialog`
- UI 组件通过 `pnpm dlx shadcn@latest add <component>` 添加
