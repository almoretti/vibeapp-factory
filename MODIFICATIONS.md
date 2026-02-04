# VibeApp Factory - Local Modifications

This document tracks all changes made to this fork from the original VibeApp Factory.

---

## Features In Review (Validated ✓)

### 1. Claude Code Agent Template ✓
**Status:** In Review | **Task ID:** `f4b2945f-bbc7-475e-b5dc-bec2435dfde1`

Executor for running Claude Code as coding agent.

**Code validation:**
```
crates/executors/src/executors/claude.rs:64 - pub struct ClaudeCode
crates/executors/src/executors/claude.rs:56 - npx -y @anthropic-ai/claude-code@2.1.22
```

---

### 2. Zero-config Dev Server ✓
**Status:** In Review | **Task ID:** `a5c98f07-83f3-4aea-87ba-8d536ac2f6e7`

Auto-detects framework and starts appropriate dev server.

**Code validation:**
```
crates/services/src/services/dev_server.rs - Zero-config dev server module
crates/services/src/services/container.rs:186 - ExecutionProcessRunReason::DevServer
```

---

### 3. code-server Integration (View Code Button) ✓
**Status:** In Review | **Task ID:** `3fb2be97-bd97-493f-a99e-f8efc9819ad7`

Web-based VS Code via code-server for "Open in IDE" functionality.

**Code validation:**
```
crates/services/src/services/config/editor/mod.rs:42 - code_server_url: Option<String>
frontend/src/components/DiffCard.tsx:298 - title="Open in IDE"
frontend/src/components/projects/ProjectCard.tsx:111 - {t('openInIDE')}
```

**Live:** https://code.moretti.cc

---

### 4. Git Push/Pull Buttons ✓
**Status:** In Review | **Task ID:** `52bb511b-bc4c-4f2d-98ef-f81c4e8c16ec`

Clickable ↑/↓ indicators in branch bar to push/pull commits.

**Code validation:**
```
frontend/src/components/layout/ProjectBranchBar.tsx:116 - pushMutation = useMutation
frontend/src/components/layout/ProjectBranchBar.tsx:124 - pullMutation = useMutation
frontend/src/components/layout/ProjectBranchBar.tsx:290 - onClick={() => pushMutation.mutate()
```

---

### 5. Git Branch Management UI ✓
**Status:** In Review | **Task ID:** `84196afe-3853-4f69-ae67-503f8da82c21`

Create, checkout, delete branches from the dashboard.

**Code validation:**
```
frontend/src/components/layout/ProjectBranchBar.tsx:88  - checkoutBranch mutation
frontend/src/components/layout/ProjectBranchBar.tsx:96  - createBranchMutation
frontend/src/components/layout/ProjectBranchBar.tsx:108 - deleteBranchMutation
```

---

## Features Done (Validated ✓)

### 6. Systemd Service ✓
**Status:** Done | **Task ID:** `52238d6e-5b8b-4870-8937-56d90b041cb8`

VibeApp Factory runs as a systemd service.

**Code validation:**
```bash
$ ls -la /etc/systemd/system/vibeapp-factory.service
-rw-r--r-- 1 root root 313 Feb  4 08:39

$ systemctl is-active vibeapp-factory
active
```

---

### 7. Clawdbot Skill ✓
**Status:** Done | **Task ID:** `64dcb075-e7cb-4137-933c-a55f503dbd11`

Skill for controlling VibeApp Factory from Clawdbot.

**Code validation:**
```
/home/ale/clawd/skills/vibeapp-factory/SKILL.md (5214 bytes)
/home/ale/clawd/skills/vibeapp-factory/references/
```

---

### 8. code-server Integration ✓
**Status:** Done | **Task ID:** `a44d2bb0-c0cf-455a-8fe3-0a0c19b173fb`

code-server running and accessible.

**Code validation:**
```bash
$ systemctl is-active code-server@ale
active
```
**Live:** https://code.moretti.cc

---

### 9. API Wrapper Script ✓
**Status:** Done | **Task ID:** `3ed826ed-0e78-4e15-97d2-e17e6f07e12e`

Script for interacting with VibeApp Factory API.

*(Location to be confirmed)*

---

## Recent Additions (2026-02-04)

### 10. Dev Server Status Indicator ✓
**Branch:** `feature/branch-scoped-workspace`

Shows dev server running status in the branch bar header.

**Code validation:**
```
crates/server/src/routes/projects.rs:290 - pub async fn get_dev_server_status
crates/server/src/routes/projects.rs:457 - .route("/dev-server-status", get(...))
frontend/src/hooks/useProjectDevServerStatus.ts - Hook (polls every 10s)
frontend/src/components/layout/ProjectBranchBar.tsx:387 - const { hasRunningDevServer }
frontend/src/components/layout/ProjectBranchBar.tsx:412-430 - Status indicator UI
```

---

## Pending Implementation

### Dev Mode: Serve Frontend from Disk
**Task ID:** `0887e5c8-95e6-4087-b676-a15da06f0a13`

Add cargo feature to serve frontend from disk in dev mode.

---

## Build Notes

### Frontend Embedding
Frontend is embedded via `rust-embed` at compile time:
- `crates/server/src/routes/frontend.rs:10` - `#[folder = "../../frontend/dist"]`

**Full rebuild required** after frontend changes:
```bash
cd frontend && npm run build
cargo build --release -p server
cp target/release/server target/server
sudo systemctl restart vibeapp-factory
```

---

## Service URLs

| Service | URL |
|---------|-----|
| VibeApp Factory | https://vibeapp-factory.moretti.cc |
| code-server | https://code.moretti.cc |
| Home Assistant | https://home.moretti.cc |

---

*Last updated: 2026-02-04*
