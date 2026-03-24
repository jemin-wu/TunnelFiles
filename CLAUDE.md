# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TunnelFiles — Cross-platform desktop SSH/SFTP visual file manager built with Tauri 2 (Rust) + React 19 + TypeScript + TailwindCSS 4 + shadcn/ui.

## Development Workflow

| Task             | Skill               | Description                                             |
| ---------------- | ------------------- | ------------------------------------------------------- |
| New feature      | `/feature-dev`      | Six-phase TDD workflow with acceptance                  |
| Bug fix          | `/bug-fix`          | Four-phase: Reproduce → Investigate → Fix → Validate    |
| Quality check    | `/acceptance`       | Code review + UX review + Tests + Contract verification |
| Product planning | `/product-planning` | Competitive analysis → Feature roadmap                  |
| Auto-repair      | `/self-heal`        | Run tests → Diagnose → Fix → Verify                     |
| CI checks        | `/ci`               | Run all lint/format/test checks locally                 |
| Release          | `/release`          | Version bump + CHANGELOG + git tag                      |

## Agents

| Agent                | Purpose                                                       |
| -------------------- | ------------------------------------------------------------- |
| `code-explorer`      | Deep codebase analysis, execution path tracing                |
| `code-architect`     | Architecture design, implementation blueprints                |
| `code-reviewer`      | Code review, security audit, convention compliance            |
| `contract-verifier`  | IPC contract alignment between Rust commands and TS types/Zod |
| `competitor-analyst` | Market research, competitive feature analysis                 |
| `ux-reviewer`        | UI/UX consistency, accessibility, design system audit         |
| `test-runner`        | Test execution, failure collection, result reporting          |

## Quick Commands

```bash
pnpm tauri dev                        # Full dev environment
pnpm lint && pnpm format:check        # Frontend lint + format check
pnpm test:run                         # Frontend tests (Vitest)
cd src-tauri && cargo test --lib --bins  # Backend tests
```

## Critical Rules

1. **Security** — System keychain only for credentials, never plaintext. Never log passwords.
2. **IPC** — Always use `src/lib/` wrappers, never `invoke()` directly in components.
3. **State** — TanStack Query for server data, Zustand for real-time events only.
4. **Rust** — No `unwrap()` in production. Use `spawn_blocking` for CPU work and `ssh2` ops.
5. **TDD** — Write tests BEFORE implementation when using `/feature-dev`.
6. **Full-stack order** — Types → Rust commands → lib/ wrappers → hooks → UI components.

## Key Gotchas

- `ssh2::Sftp` is not Send/Sync — must use `spawn_blocking` with `Arc<Session>`
- Terminal and SFTP require separate SSH sessions (cannot share one Session)
- Event listeners need React StrictMode-safe cleanup pattern
- Tauri `State<T>` type must exactly match `.manage()` registration
- E2E: WebKitWebDriver doesn't support `text=`/`button=` selectors — use XPath (`//button[contains(., 'X')]`)
- E2E: `browser.url("/")` is invalid for WebKitWebDriver — use absolute URLs via `browser.getUrl()`
