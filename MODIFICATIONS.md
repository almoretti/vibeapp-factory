# VibeApp Factory - Local Modifications

This document tracks all changes made to this fork from the original VibeApp Factory.

## Overview

This is a self-hosted instance with custom modifications for local development workflow.

---

## 2026-02-04: Branch-Scoped Workspace & Dev Server Indicator

**Branch:** `feature/branch-scoped-workspace`

### Task 1: Branch-Scoped Tasks
Tasks are now filtered by the current git branch, allowing branch-specific kanban boards.

**Files changed:**
- `crates/db/migrations/20260204110000_add_branch_to_tasks.sql` - Added `branch` column
- `crates/db/src/models/task.rs` - Added branch field to Task model
- `frontend/src/contexts/ProjectBranchContext.tsx` - New context for tracking current branch
- `frontend/src/hooks/useProjectTasks.ts` - Filter tasks by current branch
- `frontend/src/components/dialogs/tasks/TaskFormDialog.tsx` - Set branch on task creation

### Task 2: Dev Server Status Indicator
Shows whether a dev server is running for the current project in the branch bar.

**Files changed:**
- `crates/server/src/routes/projects.rs` - Added `GET /api/projects/{id}/dev-server-status`
- `frontend/src/hooks/useProjectDevServerStatus.ts` - New hook (polls every 10s)
- `frontend/src/components/layout/ProjectBranchBar.tsx` - Added status indicator (right side)
- `frontend/src/lib/api.ts` - Added `projectsApi.getDevServerStatus()`

### Task 3: Push/Pull Buttons
Made the ahead/behind commit indicators clickable to trigger git push/pull.

**Files changed:**
- `frontend/src/components/layout/ProjectBranchBar.tsx` - Clickable ↑/↓ indicators with mutations

### Task 4: Task Priority/Ordering
Tasks can now be manually ordered within a column using a position field.

**Files changed:**
- `crates/db/migrations/20260204130000_add_position_to_tasks.sql` - Added `position` column
- `crates/db/src/models/task.rs` - Added position field, ordering
- `crates/server/src/routes/tasks.rs` - Added `PUT /api/tasks/{id}/reorder`
- `frontend/src/hooks/useProjectTasks.ts` - Sort by position

---

## Pending Tasks

### Dev Mode: Serve Frontend from Disk
**Task ID:** `0887e5c8-95e6-4087-b676-a15da06f0a13`

Add cargo feature to serve frontend from disk in dev mode instead of embedding, reducing iteration time from ~6 minutes to seconds.

---

## Build Notes

### Frontend Embedding
The frontend is embedded in the Rust binary at compile time using `rust-embed`. This means:
- Production: Single binary with frontend included
- Development: Requires full Rust rebuild after frontend changes

To rebuild:
```bash
# Frontend only (fast, but server won't see changes)
cd frontend && npm run build

# Full rebuild (slow, but complete)
./local-build.sh

# Or manually:
cd frontend && npm run build
cargo build --release -p server
cp target/release/server target/server
sudo systemctl restart vibeapp-factory
```

---

## Original Repository

Based on: [VibeApp Factory](https://github.com/vibeapp/factory) (or wherever the original is)
