# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TunnelFiles - Cross-platform desktop SSH/SFTP visual file manager

**Tech Stack:**
- Frontend: React 19 + TypeScript + TailwindCSS 4 + shadcn/ui
- Backend: Rust + Tauri 2 + ssh2 + tokio
- State: TanStack Query (server) + Zustand (real-time)
- Testing: Vitest (frontend) + cargo test (backend)

## Documentation

- Detailed guidelines: `.claude/CLAUDE.md`
- Coding rules: `.claude/rules/`
- Expert agents: `.claude/agents/`
- Workflow skills: `.claude/skills/`

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

## Key Gotchas

- `ssh2::Sftp` is not Send/Sync - use spawn_blocking with Arc<Session>
- Terminal and SFTP need separate sessions
- Event listeners need StrictMode-safe cleanup pattern
- Tauri State type must exactly match .manage() registration

See `.claude/CLAUDE.md` for comprehensive documentation.
