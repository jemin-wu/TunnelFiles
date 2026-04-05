# Design System

## Project Context

- **Framework**: React 19 + TypeScript
- **CSS Approach**: Tailwind CSS 4 (via `@tailwindcss/vite` plugin) + CSS custom properties (oklch color space)
- **Component Library**: shadcn/ui (Radix UI primitives + CVA variants)
- **Build Tool**: Vite 7 (Tauri 2 desktop app)
- **Styling Utilities**: `class-variance-authority`, `tailwind-merge`, `clsx`, `tw-animate-css`
- **Theming**: Dark-first with light theme toggle, CSS custom properties on `:root` / `.light`
- **Reference Template**: Microsoft Fluent UI (desktop-native feel, motion system, interaction patterns)

## Design Tokens Baseline

### Typography

| Token             | Value                            | Usage Count       | Notes                                                |
| ----------------- | -------------------------------- | ----------------- | ---------------------------------------------------- |
| **Sans font**     | `Inter` (400, 500, 600)          | Default body font | CDN-loaded, system-ui fallback                       |
| **Mono font**     | `JetBrains Mono` (400, 500, 600) | 18 `font-mono`    | IBM Plex Mono as fallback                            |
| Root font-size    | `16px`                           | 1 (`:root`)       | Fixed 16px, never change (breaks Tailwind rem scale) |
| Root line-height  | `1.6`                            | 1 (`:root`)       |                                                      |
| `text-xs`         | 0.75rem / 12px                   | 121               | Dominant size - metadata, labels, tooltips           |
| `text-sm`         | 0.875rem / 14px                  | 82                | Secondary - body text, form labels                   |
| `text-base`       | 1rem / 16px                      | 7                 | Section headings                                     |
| `text-lg`         | 1.125rem / 18px                  | 3                 | Dialog/card titles                                   |
| `text-xl`         | 1.25rem / 20px                   | 1                 | Error boundary heading                               |
| `text-5xl`        | 3rem / 48px                      | 1                 | 404 page only                                        |
| `text-[10px]`     | 10px                             | 4                 | Bracket value - tiny labels                          |
| `font-medium`     | 500                              | 38                | Primary weight for UI                                |
| `font-semibold`   | 600                              | 16                | Headings, emphasis                                   |
| `font-normal`     | 400                              | 4                 | Overrides in tables                                  |
| `font-bold`       | 700                              | 2                 | Rare, used in 404 + permission display               |
| `leading-none`    | 1.0                              | 4                 | Tight leading for badges/titles                      |
| `leading-relaxed` | 1.625                            | 2                 | Host key fingerprint display                         |
| `tracking-wider`  | 0.05em                           | 2                 | Column headers                                       |
| `tracking-widest` | 0.1em                            | 2                 |                                                      |
| `tracking-tight`  | -0.025em                         | 1                 | Empty state title                                    |

### Colors

All colors use CSS custom properties mapped through `@theme inline`. No hardcoded hex values in TSX components (hex values confined to terminal colors in CSS for xterm.js compatibility).

**Core palette** (oklch color space, hue 260 base):

| Token           | Dark Value              | Role                       |
| --------------- | ----------------------- | -------------------------- |
| `--background`  | `oklch(0.13 0.005 260)` | App background             |
| `--foreground`  | `oklch(0.93 0.005 260)` | Primary text               |
| `--card`        | `oklch(0.16 0.005 260)` | Elevated surface           |
| `--popover`     | `oklch(0.18 0.006 260)` | Floating surface           |
| `--primary`     | `oklch(0.65 0.14 250)`  | Steel blue accent          |
| `--secondary`   | `oklch(0.2 0.005 260)`  | Neutral gray surface       |
| `--muted`       | `oklch(0.18 0.005 260)` | Subtle background          |
| `--accent`      | `oklch(0.6 0.12 230)`   | Teal-blue secondary action |
| `--destructive` | `oklch(0.58 0.18 22)`   | Red for danger/errors      |
| `--border`      | `oklch(0.25 0.008 260)` | Borders                    |
| `--input`       | `oklch(0.18 0.005 260)` | Input backgrounds          |
| `--ring`        | `oklch(0.65 0.14 250)`  | Focus ring                 |

**Semantic colors**:

| Token                                                   | Role                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `--success`                                             | Green - connected, upload complete                     |
| `--warning`                                             | Amber - pending, caution                               |
| `--info`                                                | Blue - informational                                   |
| `--file-folder/document/image/code/archive/audio/video` | File type indicators                                   |
| `--transfer-upload/download/pending`                    | Transfer status                                        |
| `--selection` / `--selection-active`                    | File selection highlights (primary at 12%/22% opacity) |
| `--terminal-*`                                          | 16-color ANSI palette (hex for xterm.js)               |
| `--chart-1` through `--chart-5`                         | Data visualization                                     |
| `--sidebar-*`                                           | Sidebar surface/text/accent variants                   |

### Spacing

Base unit: 4px (Tailwind default scale). All spacing uses Tailwind classes.

| Class     | Value | Usage Count | Role                    |
| --------- | ----- | ----------- | ----------------------- |
| `gap-2`   | 8px   | 82          | Dominant gap            |
| `gap-1`   | 4px   | 19          | Tight gap               |
| `gap-3`   | 12px  | 14          | Medium gap              |
| `gap-4`   | 16px  | 11          | Section gap             |
| `gap-1.5` | 6px   | 8           |                         |
| `gap-0.5` | 2px   | 11          | Icon-text gap           |
| `gap-6`   | 24px  | 3           | Large gap               |
| `p-2`     | 8px   | 96          | Dominant padding        |
| `p-3`     | 12px  | 19          |                         |
| `p-4`     | 16px  | 17          |                         |
| `p-6`     | 24px  | 7           | Dialog/section          |
| `px-3`    | 12px  | 27          | Button/input horizontal |
| `py-1.5`  | 6px   | 21          | Menu item vertical      |

### Border Radius

| Token          | Value                   | Usage Count       | Notes                                 |
| -------------- | ----------------------- | ----------------- | ------------------------------------- |
| `--radius`     | `0.375rem` (6px)        | Base token        |                                       |
| `--radius-sm`  | `4px`                   | 9 (`rounded-sm`)  | Menu items, compact elements          |
| `--radius-md`  | `0.375rem` (6px)        | 28 (`rounded-md`) | **Dominant** - buttons, inputs, cards |
| `--radius-lg`  | `0.375rem + 2px` (8px)  | 11 (`rounded-lg`) | Dialogs, larger cards                 |
| `--radius-xl`  | `0.375rem + 4px` (10px) | 2 (`rounded-xl`)  | Cards, inset sidebar                  |
| `rounded-full` | 9999px                  | 9                 | Badges, status dots, progress bars    |
| `rounded-xs`   | (Tailwind default)      | 3                 | Close buttons                         |

### Motion

| Token             | Value          | Usage Count | Role                                          |
| ----------------- | -------------- | ----------- | --------------------------------------------- |
| `duration-100`    | 100ms          | 13          | **Dominant** - hover states, quick feedback   |
| `duration-200`    | 200ms          | 9           | Expand/collapse, dialogs, sidebar transitions |
| `duration-150`    | 150ms          | 3           | Sonner toast actions                          |
| `duration-300`    | 300ms          | 1           | Sheet close                                   |
| `duration-500`    | 500ms          | 1           | Sheet open                                    |
| `fadeIn` keyframe | 200ms ease-out | 1           | Custom `.animate-fade-in`                     |

Easing: `ease-linear` (sidebar), `ease-in-out` (sheet), `ease-out` (fade-in). Most transitions use Tailwind's default `ease` (cubic-bezier(0.4, 0, 0.2, 1)).

### Shadows

| Token                  | Usage Count | Notes                            |
| ---------------------- | ----------- | -------------------------------- |
| `shadow-xs`            | 4           | Input fields, outline buttons    |
| `shadow-sm`            | 7           | Cards, floating sidebar, sliders |
| `shadow-md`            | 3           | Context menus                    |
| `shadow-lg`            | 5           | Dialogs, alert dialogs           |
| `shadow-card` (custom) | 0 in TSX    | Defined in CSS utilities         |

### Icon Sizes

| Token      | Value | Usage Count | Role                        |
| ---------- | ----- | ----------- | --------------------------- |
| `size-3`   | 12px  | 17          | Metadata icons              |
| `size-3.5` | 14px  | 55          | **Dominant** - inline icons |
| `size-4`   | 16px  | 33          | Standard icons              |
| `size-5`   | 20px  | 7           | Toast/larger context        |
| `size-8`   | 32px  | 5           | Empty state icons           |
| `size-10`  | 40px  | 5           | Large decorative            |

### Breakpoints

| Breakpoint | Usage Count | Role                                  |
| ---------- | ----------- | ------------------------------------- |
| `sm:`      | 22          | Dialog max-widths, show/hide elements |
| `md:`      | 14          | Sidebar visibility, input text size   |
| `lg:`      | 3           | Rare layout adjustments               |

Desktop-first app (Tauri) - breakpoints primarily used for sheet/dialog responsive sizing, not mobile layout.

### Bracket Values (Non-Scale)

| Value                     | Count | Context                                      |
| ------------------------- | ----- | -------------------------------------------- |
| `ring-[3px]`              | 7     | Focus ring width (shadcn standard)           |
| `text-[10px]`             | 4     | Sub-xs text                                  |
| `h-[300px]`               | 4     | Fixed-height containers                      |
| `w-[130px]` - `w-[720px]` | 5     | Fixed-width containers (dialog widths, etc.) |
| `min-w-[140px]`           | 2     | Column minimum widths                        |
| `max-w-[calc(100%-2rem)]` | 2     | Dialog max-width (shadcn standard)           |

## Design Principles

Synthesized from code patterns across the codebase. Each principle cites specific evidence.

1. **Information Density** -- Pack maximum useful data into minimum space.
   - Evidence: Dominant font sizes are `text-xs` (121 uses) and `text-sm` (82 uses). Dominant gap is `gap-2`/8px (82 uses) with `gap-1`/4px (19 uses). File list uses `@tanstack/react-virtual` for virtualized scrolling. `text-[10px]` used for ultra-compact metadata (4 uses). Toolbar buttons are 28px (`h-7 w-7`), not the default 36px.

2. **Keyboard-First** -- Every primary action reachable without a mouse.
   - Evidence: 14 keyboard shortcut bindings across FileList, FileManagerPage, Breadcrumb, and Terminal. Platform-aware `formatShortcut()` utility in `lib/platform.ts` converts `Mod+` to platform symbols. Context menu items display shortcut hints. Arrow/Enter/Space/Escape navigation on file list rows and connection items. `useFileSelection` implements full Finder/Explorer keyboard selection model (Arrow Up/Down, Shift+Arrow range extend).

3. **Native Desktop Feel** -- Behave like a native file manager, not a web app.
   - Evidence: Tauri 2 desktop shell with window drag region (`data-tauri-drag-region`). Platform-aware modifier keys (`metaKey || ctrlKey` in 8 handlers). OS-native file drop via Tauri webview drag events (`useDropUpload`). Resizable panels with persistent collapsed state in localStorage. System keychain credential storage. `user-select: none` by default with selective `.selectable` override.

4. **Dark-First** -- Designed for dark environments, light as secondary.
   - Evidence: `:root` block defines dark theme with oklch color space (hue 260). Light theme applied via `.light` class toggle. `bg-background` resolves to `oklch(0.13 0.005 260)` in dark. Status bar, toolbar, and sidebar all use dark-optimized opacity patterns (`bg-card/80`, `bg-card/50`, `bg-card/30`).

5. **Progressive Disclosure** -- Show essentials first, reveal details on interaction.
   - Evidence: 11 hover-reveal opacity transitions (`opacity-0` to `hover:opacity-100`) on action buttons in connection items and file list rows. Collapsible transfer sidebar with persistent toggle. Context menus expose secondary actions. Accordion sections in settings. `sr-only` DialogDescriptions (3 dialogs) keep visual UI minimal while maintaining accessibility.

6. **Composition over Configuration** -- Small, composable primitives over monolithic prop-heavy components.
   - Evidence: shadcn/ui compound component pattern throughout (Dialog + DialogContent + DialogHeader + DialogTitle + DialogDescription). `asChild` slot pattern on ContextMenuTrigger, TooltipTrigger. CVA variant system with focused variant surfaces (Button: 6 variants x 5 sizes; Badge: 4 variants; EmptyMedia: 2 variants; SidebarMenuButton: 2 variants x 3 sizes). Named barrel exports in feature directories (4 index.ts files, no `export *`).

## Voice and Tone

### Message Style

| Category                  | Convention                                           | Example                                                                     |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Success toast             | Past tense, terse (2-4 words)                        | "Folder created", "Renamed successfully", "Path copied", "Host key removed" |
| Error toast               | Structured `AppError` message, optional retry action | `showErrorToast(error, { onRetry })`                                        |
| Confirmation dialog title | Question or imperative                               | "Confirm delete", "Remove trusted host?"                                    |
| Confirmation dialog body  | Full sentence, `text-xs`, explains consequence       | "This will permanently delete the connection profile..."                    |
| Empty state title         | Declarative, sentence case                           | "No connections yet", "No transfer history"                                 |
| Empty state description   | Imperative suggestion                                | "Add a remote server to get started"                                        |
| Loading text              | Present participle + ellipsis                        | "Loading profiles...", "Loading settings...", "Connecting..."               |
| Status text               | Terse, sentence case                                 | "Ready", "Connected", "Disconnected"                                        |
| Button labels             | Imperative verb, sentence case                       | "Back", "Save", "Cancel", "Connect"                                         |
| Placeholder text          | Lowercase examples or instructions                   | "production-server", "192.168.1.100", "Search connections..."               |
| Dialog action text        | Imperative, single verb or verb+noun                 | "Delete", "Remove", "Save changes"                                          |
| Batch operation label     | Template: `{verb} {count} items`                     | "Download 3 items", "Delete 5 items", "Chmod 2 items"                       |
| Keyboard shortcut display | Platform-formatted via `formatShortcut()`            | "⌘N" (Mac) / "Ctrl+N" (Win)                                                 |

### Writing Rules

- **Capitalization**: Sentence case for all UI text. No Title Case ("New folder", not "New Folder"). Exception: product name "TunnelFiles".
- **Verb form**: Imperative for actions ("Delete", "Save"), past tense for success confirmation ("Deleted successfully"), present participle for progress ("Connecting...", "Uploading 3 files").
- **Tone**: Terse-technical. Labels are 1-3 words. Descriptions are one sentence max. No conversational filler ("please", "sorry").
- **Language**: Primary UI language is English. Code comments use Chinese (Simplified). No i18n library present (17 Chinese strings found, all in comments/dev-only code, zero in user-facing UI).
- **Message structure**: Success toasts are text-only (no actions). Error toasts may include a retry button via `onRetry` option. Confirmation dialogs use AlertDialog with Cancel + destructive Action. Toast durations: success 2s, error 5s, warning 3s, info 3s.

## Component Catalog

### Architecture Layers

| Layer                     | Count | Components                                                                                                                                                                                                                                                                 | Source                                                           |
| ------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **UI Primitives**         | 28    | Accordion, AlertDialog, Badge, Button, Card, Checkbox, Collapsible, ContextMenu, Dialog, DropdownMenu, Empty, ErrorState, Form, Input, Label, LoadingSpinner, Progress, Resizable, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Table, Tooltip | shadcn/ui (Radix) + 3 custom (Empty, ErrorState, LoadingSpinner) |
| **Feature: connections**  | 6     | AuthTypeSelector, ConnectionItem, ConnectionSheet, HostKeyDialog, PasswordDialog, PasswordInput                                                                                                                                                                            | Custom                                                           |
| **Feature: file-browser** | 9     | Breadcrumb, ChmodDialog, CreateFolderDialog, FileContextMenu, FileIcon, FileList, FileListContainer, PermissionMatrix, PreviewDialog, RenameDialog                                                                                                                         | Custom                                                           |
| **Feature: terminal**     | 1     | Terminal                                                                                                                                                                                                                                                                   | Custom (wraps xterm.js)                                          |
| **Feature: transfer**     | 2     | DropZone, TransferQueue                                                                                                                                                                                                                                                    | Custom                                                           |
| **Feature: settings**     | 1     | KnownHostsList                                                                                                                                                                                                                                                             | Custom                                                           |
| **Pages**                 | 4     | ConnectionsPage, FileManagerPage, SettingsPage, NotFoundPage                                                                                                                                                                                                               | Custom                                                           |
| **Layouts**               | 1     | MainLayout                                                                                                                                                                                                                                                                 | Custom                                                           |

### Variant System (CVA)

| Component             | Variant Axis | Values                                                            | Default   |
| --------------------- | ------------ | ----------------------------------------------------------------- | --------- |
| **Button**            | `variant`    | `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` | `default` |
| **Button**            | `size`       | `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (size-9)         | `default` |
| **Badge**             | `variant`    | `default`, `secondary`, `destructive`, `outline`                  | `default` |
| **EmptyMedia**        | `variant`    | `default` (transparent), `icon` (bg-muted, size-10 container)     | `default` |
| **SidebarMenuButton** | `variant`    | `default`, `outline`                                              | `default` |
| **SidebarMenuButton** | `size`       | `default` (h-8), `sm` (h-7), `lg` (h-12)                          | `default` |

### Composition Patterns

- **Compound components**: Dialog (6 parts), AlertDialog (8 parts), Sheet (7 parts), ContextMenu (16 parts), DropdownMenu, Select, Form, Accordion, Sidebar (12+ parts). Each part has a `data-slot` attribute for styling hooks.
- **Slot pattern**: `asChild` via Radix `Slot` on triggers (ContextMenuTrigger, TooltipTrigger, DropdownMenuTrigger). Allows custom trigger elements without wrapper divs.
- **Barrel exports**: 4 feature directories use named re-exports via `index.ts` (file-browser: 4 exports, terminal: 1, transfer: 2, settings: 1). No `export *` anywhere.
- **Lazy loading**: Terminal component lazy-loaded via `React.lazy()` + `Suspense` in FileManagerPage. All page routes lazy-loaded in router.

### Icon System

- **Library**: `lucide-react` exclusively (46 unique icons across 33 files)
- **Size scale**: `size-3` (12px, metadata) -> `size-3.5` (14px, dominant inline) -> `size-4` (16px, standard) -> `size-5` (20px, toast) -> `size-8` (32px, empty state) -> `size-10` (40px, decorative)
- **Convention**: Icons inside `h-7 w-7` ghost buttons in toolbars. Context menu icons at `size-3.5`. File type icons via dedicated `FileIcon` component with type-based color mapping.

## Layout System

### Page Templates

| Template            | Structure                                                                                                   | Used By                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **App Shell**       | `h-screen flex-col`: Header (h-11, drag region) + Main (flex-1, overflow-hidden) + Footer (h-6, status bar) | MainLayout                     |
| **Connection List** | ScrollArea with filtered/sorted list + FloatingActionButton (add connection) + Sheet (create/edit form)     | ConnectionsPage                |
| **File Manager**    | Toolbar (h-9) + ResizablePanelGroup (main 75% + sidebar 25%) or collapsed sidebar (40px fixed)              | FileManagerPage                |
| **Terminal Mode**   | Toolbar (h-9) + full-width Terminal (no sidebar)                                                            | FileManagerPage (tab=terminal) |
| **Settings**        | Left nav (icon+label buttons) + right content (form sections)                                               | SettingsPage                   |

### Panel System

| Panel             | Default Size | Min | Max | Notes                                        |
| ----------------- | ------------ | --- | --- | -------------------------------------------- |
| Main content      | 75%          | 55% | 82% | File list + breadcrumb                       |
| Transfer sidebar  | 25%          | 18% | 35% | Collapsible, state persisted to localStorage |
| Collapsed sidebar | 40px fixed   | --  | --  | Fixed width, not resizable                   |

### Toolbar Conventions

| Convention            | Value                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Toolbar height        | `h-9` (36px) for file/terminal toolbar, `h-11` (44px) for app header                        |
| Toolbar button size   | `h-7 w-7` (28px) ghost icon buttons                                                         |
| Toolbar icon size     | `size-3.5` (14px)                                                                           |
| Toolbar padding       | `px-3` horizontal                                                                           |
| Toolbar border        | `border-b border-border`                                                                    |
| Toolbar background    | `bg-card/30` (translucent) for inner toolbars, `bg-card/80 backdrop-blur-sm` for app header |
| Toolbar separator     | `bg-border h-4 w-px` vertical                                                               |
| Status bar height     | `h-6` (24px)                                                                                |
| Status bar background | `bg-card/50`                                                                                |

### Sidebar Patterns

- Transfer sidebar: collapsible via toggle button, persisted in `localStorage` key `tunnelfiles-sidebar-collapsed`
- Expanded: resizable panel (18-35% width) with its own `h-9` header row
- Collapsed: fixed 40px column with rotate-to-vertical icon

## Interaction Patterns

### Keyboard Shortcuts

| Scope               | Key                        | Action                                   | Platform-Aware |
| ------------------- | -------------------------- | ---------------------------------------- | -------------- |
| **Global**          | `Escape`                   | Prevent default (block native behaviors) | No             |
| **Global**          | `Mod+B`                    | Toggle sidebar                           | Yes            |
| **File Manager**    | `Mod+T`                    | Switch to terminal tab                   | Yes            |
| **File Manager**    | `Mod+1`                    | Switch to files tab                      | Yes            |
| **File Manager**    | `Mod+2`                    | Switch to terminal tab                   | Yes            |
| **File List**       | `Mod+A`                    | Select all files                         | Yes            |
| **File List**       | `Escape`                   | Clear selection                          | No             |
| **File List**       | `Delete` / `Mod+Backspace` | Delete selected files                    | Yes            |
| **File List**       | `Mod+N`                    | Create new folder                        | Yes            |
| **File List**       | `Mod+R` / `F2`             | Rename selected file                     | Yes            |
| **File List**       | `Mod+ArrowUp`              | Navigate to parent directory             | Yes            |
| **File List**       | `Space`                    | Toggle file preview                      | No             |
| **File List**       | `ArrowUp` / `ArrowDown`    | Move selection up/down                   | No             |
| **File List**       | `Enter`                    | Open directory / preview file            | No             |
| **File List**       | `Backspace` (no mod)       | Delete last filter character             | No             |
| **File List**       | Alphanumeric               | Type-ahead filter                        | No             |
| **Breadcrumb**      | `Mod+L`                    | Enter address bar edit mode              | Yes            |
| **Breadcrumb**      | `Enter` (in edit)          | Navigate to typed path                   | No             |
| **Breadcrumb**      | `Escape` (in edit)         | Cancel path edit                         | No             |
| **Terminal**        | `Mod+=` / `Mod++`          | Increase font size                       | Yes            |
| **Terminal**        | `Mod+-`                    | Decrease font size                       | Yes            |
| **Terminal**        | `Mod+0`                    | Reset font size                          | Yes            |
| **Connection Item** | `Enter`                    | Connect to server                        | No             |
| **Connection Item** | `Delete`                   | Delete connection                        | No             |
| **Connection Item** | `Mod+E`                    | Edit connection                          | Yes            |

All `Mod+` shortcuts use `(e.metaKey || e.ctrlKey)` for cross-platform support. Display formatted via `formatShortcut()` from `@/lib/platform`.

### Selection Model

- **Type**: Multi-select with Finder/Explorer conventions via `useFileSelection` hook
- **Data structure**: `Set<string>` (paths) with anchor/focus tracking for range selection
- **Click**: Single click selects one, deselects others
- **Cmd/Ctrl+Click**: Toggle individual file in/out of selection
- **Shift+Click**: Range select from anchor to clicked file
- **Shift+Cmd/Ctrl+Click**: Add range to existing selection
- **Arrow keys**: Move focus and selection (single)
- **Shift+Arrow**: Extend selection range from anchor
- **Cmd+A**: Select all files in current directory
- **Escape**: Clear all selection
- **Visual feedback**: `aria-selected` attribute on rows, `bg-selection`/`bg-selection-active` background colors

### Context Menus

| Trigger                 | Items                                                                              | Shortcut Hints                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **File (single)**       | Open (dir only), Download, Copy path, Copy name, New folder, Rename, Chmod, Delete | Open: `Enter`, New folder: `Mod+N`, Rename: `Mod+R`, Delete: `Mod+Backspace` |
| **File (multi-select)** | Download N items, Copy path, New folder, Chmod N items, Delete N items             | New folder: `Mod+N`, Delete: `Mod+Backspace`                                 |
| **Connection Item**     | Connect, Edit, Delete (via dropdown menu, not context menu)                        | --                                                                           |

Context menu structure:

- Separator-grouped sections: navigation | download | clipboard | editing | destructive
- Destructive item always last, uses `variant="destructive"` red styling
- Batch operations show count: `"Delete 3 items"` pattern
- Icons at `size-3.5`, shortcut hints as `text-muted-foreground text-xs` right-aligned

### Drag and Drop

| Source                        | Target                  | Feedback                                                                         |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| OS files (Tauri webview drag) | File browser `DropZone` | Full-overlay with backdrop-blur, dashed border, Upload icon, target path display |

- Uses Tauri's native drag-drop events via `useDropUpload` hook (not HTML5 drag)
- Screen reader announcement: `aria-live="polite"` status region announces "Drop zone active"
- Directories are expanded: drops create individual upload tasks per file
- No internal file-to-file drag (no reordering or move-by-drag)

### Focus Management

- **Auto-focus in dialogs**: `autoFocus` on input fields in RenameDialog, CreateFolderDialog, PasswordDialog (3 dialogs)
- **Focus return**: Handled by Radix Dialog/AlertDialog primitives (auto-restores focus on close)
- **Focus trapping**: Handled by Radix Dialog/Sheet (modal focus trap by default)
- **Focus visible**: `focus-visible:ring-ring/50 focus-visible:ring-[3px]` pattern across 15 files (23 total usages)
- **tabIndex usage**: `tabIndex={0}` on connection items and file rows for keyboard focusability. `tabIndex={-1}` on sidebar to exclude from tab order.

## Accessibility Baseline

### Coverage

| Feature                   | Status      | Details                                                                                                                                                                                                                                                                 |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ARIA labels**           | Implemented | 35 `aria-label` across 14 files. Toolbar buttons, regions, lists all labeled                                                                                                                                                                                            |
| **Semantic roles**        | Implemented | `role="grid"` on file list, `role="row"` on file rows, `role="list"`/`role="listitem"` on connection lists, `role="alert"` on error states, `role="status"` on loading/drop zone, `role="radiogroup"`/`role="radio"` on auth type selector, `role="region"` on terminal |
| **Screen reader content** | Partial     | 9 `sr-only` usages: 3 dialog descriptions, close button labels, sidebar header, drop zone announcement, SSH key indicator                                                                                                                                               |
| **ARIA state attributes** | Implemented | `aria-pressed` on toggle buttons (3), `aria-selected` on file rows, `aria-checked` on radio options (2), `aria-current="location"` on active breadcrumb segment, `aria-invalid` on form fields                                                                          |
| **Focus visible styling** | Implemented | 23 `focus-visible:` usages across 15 files. Consistent pattern: `focus-visible:ring-ring/50 focus-visible:ring-[3px]`                                                                                                                                                   |
| **Keyboard navigability** | Implemented | Custom interactive elements (`div` connection items, file rows) have `tabIndex={0}` + `onKeyDown`. Full arrow key navigation in file list grid                                                                                                                          |
| **Reduced motion**        | Implemented | Global `@media (prefers-reduced-motion: reduce)` in `index.css` zeroes all animation/transition durations                                                                                                                                                               |
| **Virtualized list a11y** | Partial     | File list uses `role="grid"` with `role="row"` children, but virtualizer removes off-screen rows from DOM (standard virtual list trade-off)                                                                                                                             |

### Gaps

- No `aria-describedby` linking error messages to form fields (relies on `aria-invalid` only)
- No `aria-live` region for file list count changes or sort order announcements
- Terminal component (`xterm.js`) accessibility depends on xterm's built-in screen reader mode, not custom implementation
- No `aria-label` on the Settings page nav items (they have visible text labels, so this may be intentional)

### A11y Tooling

| Tool                     | Present | Config                                          |
| ------------------------ | ------- | ----------------------------------------------- |
| `eslint-plugin-jsx-a11y` | Yes     | Configured in ESLint (devDependencies)          |
| `@testing-library/react` | Yes     | RTL encourages accessible queries (`getByRole`) |
| `axe-core` / `jest-axe`  | No      | Not installed                                   |
| Screen reader testing    | Unknown | No automated SR testing framework detected      |

## Consistency Rules

Rules defining what "consistent" means for this project:

1. **Typography**: All font-size values must use the Tailwind type scale (`text-xs` through `text-xl`). `text-[10px]` is the only accepted bracket exception for ultra-compact metadata. No raw `font-size` in component styles.
2. **Color**: No hardcoded hex/rgb/oklch in TSX components. All colors must reference CSS custom properties through Tailwind semantic classes (`bg-primary`, `text-muted-foreground`, etc.). Hex values are only permitted in `index.css` for xterm.js terminal colors.
3. **Spacing**: Spacing must use Tailwind's 4px-based scale. Bracket pixel values are permitted only for fixed container dimensions (`h-[300px]`, `w-[720px]`) where no standard class exists, not for padding/margin/gap.
4. **Radii**: Four primary tiers: `rounded-sm` (4px), `rounded-md` (6px, default), `rounded-lg` (8px), `rounded-full` (circles/pills). `rounded-xl` for large cards. `rounded-xs` only on close buttons (shadcn convention).
5. **Motion**: Transition durations limited to `duration-100` (hover/instant feedback), `duration-150` (button actions), `duration-200` (expand/collapse/dialogs). `duration-300` and `duration-500` only for sheet open/close. Custom animations use 200ms max.
6. **Shadows**: Four tiers: `shadow-xs` (inputs), `shadow-sm` (cards/elevated), `shadow-md` (menus), `shadow-lg` (dialogs/overlays). No arbitrary `box-shadow` in TSX.
7. **Components**: Use shadcn/ui components from `@/components/ui/` when available. New primitives via `npx shadcn@latest add`. No custom implementations of existing shadcn components.
8. **Icons**: Use `lucide-react` exclusively. Sizes follow the documented scale: `size-3` (metadata), `size-3.5` (inline), `size-4` (standard), `size-5` (toast), `size-8`/`size-10` (empty state).
9. **Font Weight**: `font-medium` (500) is the default UI weight. `font-semibold` (600) for headings and titles. `font-bold` (700) is exceptional - avoid unless strongly needed.
10. **Focus States**: `focus-visible:ring-ring/50 focus-visible:ring-[3px]` for interactive elements. Outline-only, no glow effects.
11. **Responsive**: Desktop-first. `sm:` and `md:` for dialog sizing and sidebar visibility. No mobile-first layout system.
12. **Accessibility**: All interactive elements must have visible `focus-visible` states. `prefers-reduced-motion` respected via CSS media query. User-select disabled by default, enabled on text content via `.selectable` class.
13. **Voice and Tone**: Sentence case everywhere. Imperative verbs for actions, past tense for success, present participle for progress. Terse-technical: 1-3 word labels, one-sentence descriptions max. Batch operations use `"{verb} {count} items"` template. No conversational filler.
14. **Component Usage**: Use shadcn/ui primitives from `@/components/ui/` first. Feature components colocated under `components/{feature}/`. Barrel exports via named `export { X }` in `index.ts` -- no `export *`. New Radix primitives via `npx shadcn@latest add`, never custom reimplementations.
15. **Layout Structure**: App shell is `h-screen flex-col` with h-11 header, flex-1 main, h-6 footer. Inner toolbars are `h-9` with `h-7 w-7` ghost icon buttons at `size-3.5`. Sidebar panels resizable 18-35% with collapsible toggle persisted to localStorage.
16. **Keyboard Shortcuts**: All primary actions bound to `Mod+Key` using `(e.metaKey || e.ctrlKey)`. Display via `formatShortcut()` from `@/lib/platform`. Context menu items show shortcut hints right-aligned as `text-muted-foreground text-xs`. Destructive actions require modifier (`Mod+Backspace`) not bare key.
17. **Accessibility Labels**: All icon-only buttons must have `aria-label`. Lists use `role="list"` + `role="listitem"` or `role="grid"` + `role="row"`. Toggle buttons use `aria-pressed`. Dialogs with visual-only titles use `sr-only` DialogDescription for screen readers. Drop zones announce state via `aria-live="polite"`.
18. **Interaction States**: Hover-reveal actions use `opacity-0` -> `hover:opacity-100` on parent hover. Disabled state: `disabled:pointer-events-none disabled:opacity-50`. Loading state: `Loader2` spinner with `animate-spin`, button disabled during `isPending`. All four states (empty, loading, error, success) required for async data components.

## Success Thresholds

Minimum scores for `/audit-ui` to consider the project "consistent":

| Criterion      | Threshold | What it measures                                        |
| -------------- | --------- | ------------------------------------------------------- |
| Design Quality | >= 7/10   | Coherence - does the UI work as a unified whole?        |
| Originality    | >= 6/10   | Distinctiveness - does it have its own character?       |
| Craft          | >= 7/10   | Precision - are values systematic and intentional?      |
| Functionality  | >= 7/10   | Usability - interaction states, responsive, accessible? |

## Anti-Pattern Exceptions

- **oklch color space**: All theme colors use oklch (not hex/hsl). This is intentional for perceptual uniformity across the palette, despite broader browser support for hex/hsl.
- **Dark-first default**: The `:root` block defines dark theme. Light is applied via `.light` class. This is intentional for a developer/sysadmin-focused tool.
- **CDN font loading**: Inter and JetBrains Mono loaded from jsDelivr CDN rather than bundled. Acceptable for a desktop app with consistent network access.
- **Fixed pixel heights**: `h-[300px]` for file list/preview containers is intentional to maintain stable layouts in the split-panel file manager.
- **`text-[10px]`**: Sub-scale text for ultra-compact metadata (timestamps, byte counts) where `text-xs` (12px) is too large for the information density required.
- **Sheet asymmetric durations**: `duration-500` open / `duration-300` close follows the pattern of slower entrance, snappier exit for perceived responsiveness.
- **`opacity-0` to `opacity-100` transitions on hover**: Action buttons (edit/delete) on list items are hidden by default and revealed on hover. This is a desktop-specific interaction pattern.
