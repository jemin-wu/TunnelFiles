# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TunnelFiles - Cross-platform desktop SSH/SFTP visual file manager

**Tech Stack:**

- Frontend: React 19 + TypeScript + TailwindCSS 4 + shadcn/ui
- Backend: Rust + Tauri 2 + ssh2 + tokio
- State: TanStack Query (server) + Zustand (real-time)
- Testing: Vitest (frontend) + cargo test (backend)

## Development Workflow

Use skills to drive development:

| Task             | Skill               | Description                                             |
| ---------------- | ------------------- | ------------------------------------------------------- |
| New feature      | `/feature-dev`      | Six-phase TDD workflow with acceptance                  |
| Bug fix          | `/bug-fix`          | Four-phase: Reproduce -> Investigate -> Fix -> Validate |
| Quality check    | `/acceptance`       | Multi-mode: Code review + UX review + Tests + Contract  |
| Product planning | `/product-planning` | Competitive analysis -> Feature roadmap                 |
| Auto-repair      | `/self-heal`        | Run tests -> Diagnose -> Fix -> Verify                  |

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
pnpm tauri dev      # Full development environment
pnpm tauri build    # Production build
pnpm lint           # ESLint check
pnpm format         # Prettier format
pnpm test:run       # Frontend tests
cd src-tauri && cargo test  # Backend tests
```

## Critical Rules

1. **Security**: Use system keychain for credentials, never plaintext
2. **IPC**: Always use lib/ wrappers, never direct invoke() in components
3. **State**: Query for server data, Zustand for real-time events
4. **Rust**: Never use unwrap() in production, use spawn_blocking for CPU work
5. **TDD**: Write tests BEFORE implementation when using feature-dev skill

## Key Gotchas

- `ssh2::Sftp` is not Send/Sync - use spawn_blocking with Arc<Session>
- Terminal and SFTP need separate sessions
- Event listeners need StrictMode-safe cleanup pattern
- Tauri State type must exactly match .manage() registration

## Configuration Structure

```
.claude/
├── agents/          # 7 specialized agents
├── hooks/           # Formatting scripts (prettier, rustfmt)
├── rules/           # Coding rules by domain
│   ├── rust/        # Rust backend rules
│   ├── react/       # React frontend rules
│   ├── shared/      # Cross-cutting rules
│   └── workflow/    # Development process rules
├── settings.json    # Project-level hook configuration
└── skills/          # 5 development workflow skills
    ├── feature-dev/ # TDD feature development
    ├── bug-fix/     # Bug diagnosis and fix
    ├── acceptance/  # Quality verification
    ├── product-planning/  # Competitive analysis
    └── self-heal/   # Auto test and repair
```
