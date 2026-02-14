# Feature Spec: Floating Code Editor + Git Panel

**Feature ID**: 1-floating-editor-git
**Status**: Draft
**Created**: 2026-02-13

---

## 1. Overview

0xMux is a web-based tmux session manager focused on terminal workflows. Users need a lightweight way to view, edit, and search code files alongside their terminal sessions — without switching to a heavy IDE like VSCode.

The core innovation is a **floating transparent editor window** that overlays on top of terminal panels, similar to picture-in-picture video. Users can drag, resize, and adjust the opacity of this window, allowing them to read code while still seeing their terminal underneath. This is paired with an **Activity Bar sidebar** for file browsing, global search, and Git status viewing.

### Target Users

- Developers who use 0xMux as their primary terminal manager
- Users who need to quickly reference or edit code without leaving their terminal workflow
- Users who want lightweight Git status/diff visibility without a full IDE

### Problem Statement

Currently, 0xMux users must switch to a separate application (VSCode, Vim, etc.) to view or edit code files. This context-switching breaks workflow concentration. There is no integrated way to browse project files, search code, or view Git status within the terminal management interface.

---

## 2. User Scenarios

### Scenario 1: Quick Code Reference

**As a** developer running a build in the terminal,
**I want to** open a floating code viewer to check a specific file,
**So that** I can read the code while watching build output without switching windows.

**Flow:**
1. User presses `Ctrl+E` or clicks the file icon in Activity Bar
2. File explorer appears in the sidebar
3. User double-clicks a file
4. Floating editor window appears overlaid on the terminal workspace
5. User adjusts opacity to 70% to see terminal output behind the editor
6. User drags the editor to the right half of the screen
7. User reads the code, then closes the editor or minimizes it

### Scenario 2: @ Quick File Trigger

**As a** developer typing in the terminal,
**I want to** type `@` to quickly search and open a file,
**So that** I can instantly reference code without leaving the keyboard.

**Flow:**
1. User types `@` in the terminal
2. A quick-search popup appears (similar to Spotlight/Cmd+K)
3. User types a partial filename
4. Matching files appear as a dropdown list
5. User selects a file with arrow keys + Enter
6. Floating editor opens with that file

### Scenario 3: Git Change Review

**As a** developer preparing to commit,
**I want to** see which files changed and view diffs visually,
**So that** I can verify my changes before running `git commit` in the terminal.

**Flow:**
1. User clicks the Git icon in the Activity Bar
2. Git panel shows: current branch, modified/staged/untracked files
3. User clicks a modified file
4. Floating editor opens in diff view (side-by-side: HEAD vs working tree)
5. User reviews the diff, then switches back to terminal to commit

### Scenario 4: Code Search Across Project

**As a** developer debugging an issue,
**I want to** search for a function name across all project files,
**So that** I can find where it's defined or called.

**Flow:**
1. User clicks the search icon in Activity Bar (or presses `Ctrl+Shift+F`)
2. Search panel appears in sidebar with input field
3. User types a search query (supports regex)
4. Results appear grouped by file with line numbers and context
5. User clicks a result
6. Floating editor opens at the matching line

### Scenario 5: Edit and Save

**As a** developer who spots a typo or small fix,
**I want to** edit the file directly in the floating editor,
**So that** I don't need to switch to another editor for a quick change.

**Flow:**
1. Floating editor is open with a file
2. User makes edits (full Monaco editing capabilities)
3. User presses `Ctrl+S` to save
4. File is written back to disk
5. Unsaved changes indicator shows on the file tab

---

## 3. Functional Requirements

### FR-1: Floating Window System

- **FR-1.1**: The floating window shall be draggable by its title bar within the browser viewport
- **FR-1.2**: The floating window shall be resizable from all four corners and four edges
- **FR-1.3**: The floating window shall support opacity adjustment from 30% to 100%
- **FR-1.4**: The floating window shall have minimize (collapse to title bar) and close controls
- **FR-1.5**: The floating window position, size, and opacity shall persist across page reloads (localStorage)
- **FR-1.6**: The floating window shall not be draggable outside the viewport boundaries
- **FR-1.7**: The floating window shall appear above terminal panels but below modal dialogs
- **FR-1.8**: Double-clicking the title bar shall toggle minimize/restore

### FR-2: Monaco Editor Integration

- **FR-2.1**: The editor shall use Monaco Editor with syntax highlighting for common languages (JS/TS, Rust, Python, Go, JSON, YAML, Markdown, etc.)
- **FR-2.2**: The editor shall support multiple open files via a tab bar
- **FR-2.3**: The editor shall lazy-load (not included in initial bundle)
- **FR-2.4**: The editor theme shall match the current 0xMux theme (dark/light mode, accent colors)
- **FR-2.5**: The editor shall support viewing file diffs (Monaco DiffEditor) with side-by-side comparison
- **FR-2.6**: The editor shall show a bottom status bar with language, line:column, and encoding info
- **FR-2.7**: The editor shall support file editing with save capability (`Ctrl+S`)
- **FR-2.8**: Tabs shall show unsaved changes indicator (dot or icon)
- **FR-2.9**: The editor shall handle resize events (re-layout when floating window resizes)
- **FR-2.10**: Monaco workers shall be bundled locally (no CDN dependency, support offline/LAN)

### FR-3: Activity Bar & Sidebar

- **FR-3.1**: A 48px-wide icon column (Activity Bar) shall replace the current collapsed sidebar state
- **FR-3.2**: Activity Bar shall have 4 icons: Terminal (sessions), Files, Search, Git
- **FR-3.3**: Clicking an icon shall expand the corresponding sidebar panel (260px)
- **FR-3.4**: Clicking the same icon again shall collapse the sidebar
- **FR-3.5**: The existing session sidebar content shall remain unchanged, now displayed under the Terminal icon
- **FR-3.6**: The sidebar shall show the active icon with a highlight indicator

### FR-4: File Explorer

- **FR-4.1**: File explorer shall display a tree view of project files and directories
- **FR-4.2**: Directories shall lazy-load their contents on expand (not all at once)
- **FR-4.3**: Double-clicking a file shall open it in the floating editor
- **FR-4.4**: Files shall show type-appropriate icons
- **FR-4.5**: Hidden files (dotfiles) shall be shown but visually muted
- **FR-4.6**: Common non-useful directories (.git, node_modules, target) shall be collapsed by default
- **FR-4.7**: The tree shall support expand/collapse all

### FR-5: Global Search

- **FR-5.1**: Search panel shall accept text queries with regex toggle
- **FR-5.2**: Search shall support case-sensitivity toggle
- **FR-5.3**: Search shall support file glob filter (e.g., `*.rs`, `*.ts`)
- **FR-5.4**: Results shall be grouped by file with matching line number and content preview
- **FR-5.5**: Clicking a result shall open the file in the floating editor at the matched line
- **FR-5.6**: Search shall be debounced (300ms) to avoid excessive requests
- **FR-5.7**: Maximum 200 results returned per search

### FR-6: Git Panel (Read-Only)

- **FR-6.1**: Git panel shall show current branch name
- **FR-6.2**: Git panel shall list modified, staged, and untracked files with status icons (M/A/D/R)
- **FR-6.3**: Clicking a changed file shall open a diff view in the floating editor
- **FR-6.4**: Git panel shall show recent commit history (latest 20 commits)
- **FR-6.5**: Git panel shall show ahead/behind count relative to remote
- **FR-6.6**: Git panel shall list all local and remote branches
- **FR-6.7**: Git panel status shall refresh on panel open and via manual refresh button
- **FR-6.8**: Git panel shall NOT provide write operations (stage, commit, push) — these are done in the terminal

### FR-7: @ Quick File Trigger

- **FR-7.1**: When user types `@` in a terminal, a file quick-search popup shall appear
- **FR-7.2**: The popup shall show a text input for fuzzy filename search
- **FR-7.3**: Results shall update as user types (debounced)
- **FR-7.4**: User can select a file with arrow keys + Enter
- **FR-7.5**: Selecting a file shall open it in the floating editor
- **FR-7.6**: Pressing Escape shall dismiss the popup and pass `@` through to the terminal
- **FR-7.7**: The @ trigger shall be configurable (enable/disable in settings)

### FR-8: Backend File API

- **FR-8.1**: `GET /api/files/tree` shall list directory contents (files + subdirectories) with name, path, type, size, and modification time
- **FR-8.2**: `GET /api/files/read` shall return file content as text, with language detection and encoding info
- **FR-8.3**: `PUT /api/files/write` shall write content to a file, with path validation
- **FR-8.4**: `GET /api/files/search` shall search file contents with regex support, returning matching lines with context
- **FR-8.5**: All file paths shall be validated to prevent directory traversal (must be within server working directory)
- **FR-8.6**: Binary files shall be detected and rejected with appropriate error
- **FR-8.7**: File read shall have a size limit (5MB maximum)

### FR-9: Backend Git API

- **FR-9.1**: `GET /api/git/status` shall return branch name, ahead/behind, and categorized file changes
- **FR-9.2**: `GET /api/git/diff` shall return the original (HEAD) and modified (working tree) full content for a specific file, suitable for Monaco DiffEditor rendering. Supports `staged` parameter to compare staged vs HEAD.
- **FR-9.4**: `GET /api/git/log` shall return recent commits with hash, message, author, and date
- **FR-9.5**: `GET /api/git/branches` shall return all local and remote branches with current branch indicator
- **FR-9.6**: Git operations shall use CLI commands (not libgit2)
- **FR-9.7**: All git API paths shall be validated for directory traversal

---

## 4. Non-Functional Requirements

### Performance

- **NFR-1**: Monaco Editor shall lazy-load; initial page load shall not be affected
- **NFR-2**: File tree loading shall complete in under 500ms for directories with fewer than 1000 entries
- **NFR-3**: Search results shall return within 2 seconds for projects up to 50,000 files
- **NFR-4**: Floating window drag/resize shall maintain 60fps responsiveness

### Security

- **NFR-5**: All file API endpoints shall validate paths against directory traversal attacks
- **NFR-6**: File write operations shall require authentication (existing auth system)
- **NFR-7**: Binary files and files larger than 5MB shall be rejected

### Compatibility

- **NFR-8**: Floating window shall work on desktop browsers (Chrome, Firefox, Safari, Edge)
- **NFR-9**: Activity Bar and sidebar shall respect existing mobile layout (Activity Bar hidden on mobile)
- **NFR-10**: Monaco workers shall be self-hosted (no external CDN dependency)

### Accessibility

- **NFR-11**: All sidebar panels and floating window controls shall be keyboard-navigable
- **NFR-12**: The @ trigger shall be dismissable with Escape without side effects

---

## 5. Success Criteria

1. Users can open and view any text file in the project through the floating editor within 2 seconds
2. Users can simultaneously see terminal output through the semi-transparent editor window
3. Users can search project files by content and navigate to results within 3 clicks/keystrokes
4. Users can view Git status and file diffs without leaving the 0xMux interface
5. The floating editor adds zero impact to initial page load time (lazy-loaded)
6. File operations are secure — no file outside the project root is accessible
7. The entire feature works offline / on local network (no CDN dependencies)

---

## 6. Scope Boundaries

### In Scope

- Floating window component (drag, resize, opacity)
- Monaco Editor integration (view, edit, diff, multi-tab)
- Activity Bar with 4 panels (Sessions, Files, Search, Git)
- File explorer tree with lazy loading
- Global search with regex
- Git status, diff, log, branches (read-only)
- @ quick file trigger
- Backend APIs for files and git
- i18n support (Chinese default)

### Out of Scope

- Git write operations (stage, commit, push, checkout) — use terminal
- IntelliSense / code completion / LSP integration
- Terminal-embedded file editing (editor is always floating, not inline in terminal pane)
- File upload/download
- Multi-user concurrent editing
- File system watching (real-time updates) — manual refresh
- Mobile editor support (editor only on desktop)

---

## 7. Assumptions

1. The server process has read/write access to the project directory it was started in
2. `git` CLI is available on the server machine (for git API)
3. Projects are typically under 100,000 files (for search performance)
4. Users are on desktop browsers with sufficient screen resolution for floating windows (>1024px width)
5. The existing authentication system protects all new API endpoints
6. Monaco Editor's ~800KB gzip bundle size is acceptable given lazy loading
7. The `@` character is infrequently used as the first character in terminal commands (low false-positive trigger rate)

---

## 8. Key Entities

| Entity | Description |
|--------|-------------|
| FloatingWindow | A draggable, resizable, opacity-adjustable overlay container |
| EditorTab | A single open file within the floating editor (path, content, dirty state) |
| FileTreeNode | A file or directory entry with name, path, type, size |
| SearchResult | A matching line with file path, line number, and content |
| GitStatus | Repository state: branch, ahead/behind, categorized file changes |
| GitDiff | File-level diff with original and modified content |
| GitCommit | Commit entry with hash, message, author, date |
| ActivityView | Active sidebar panel type: sessions, files, search, git |

---

## 9. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| Monaco Editor (@monaco-editor/react) | Frontend | Code editor component |
| vite-plugin-monaco-editor | Build tool | Local Monaco worker bundling |
| git CLI | System | Backend git operations |
| Existing auth system | Internal | Protects new API endpoints |
| Existing theme system | Internal | CSS variables for editor theming |
| Existing react-resizable-panels | Internal | Coexists with floating window |

---

## 10. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Monaco bundle size (~800KB gzip) | Increases total app size | Lazy loading, code splitting |
| Monaco workers in rust-embed binary | Workers must be included in embedded dist | Verify vite build includes worker files |
| @ trigger false positives | Interrupts terminal input | Configurable enable/disable + Escape to dismiss |
| Large file search performance | Slow response on huge repos | Result limit (200), file size limit (5MB), glob filtering |
| Path traversal attacks | Security vulnerability | Strict canonicalize + prefix check on all file/git APIs |
