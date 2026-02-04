# VibeApp Factory — Development Plan

## Vision
A personal vibe-coding command center. Kanban board for managing multiple git repos, branches, coding agents — with Ralph (Clawdbot) as the orchestrator who validates work before human review.

Forked from [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) (Apache 2.0).

## V0 — Tonight (2026-02-01)
**Goal:** Get it running at `vibeapp-factory.moretti.cc` with basic auth.

- [x] Fork to almoretti/vibeapp-factory
- [ ] Docker build (Dockerfile already exists)
- [ ] Add auth layer (username/password login with JWT sessions)
- [ ] Docker Compose + Traefik config for `vibeapp-factory.moretti.cc`
- [ ] Deploy and verify it works

## V0.1 — Multi-Repo Dashboard
- [ ] Project switcher / multi-repo view from single instance
- [ ] Branch-level boards (each branch = own kanban state)
- [ ] Create branch from UI

## V0.2 — Ralph Orchestrator API
- [ ] Webhook/API endpoint for task completion notifications
- [ ] Ralph receives notification → reviews diff → approves or sends back
- [ ] Status updates visible on the board

## V0.3 — Dev Server Management
- [ ] Per-branch dev servers on different ports
- [ ] Start/stop/view logs from the UI
- [ ] Port forwarding config for remote access

## Tech Stack
- **Backend:** Rust (axum, SQLite via SQLx)
- **Frontend:** React + Vite + Tailwind
- **Deployment:** Docker on homeserver, Traefik reverse proxy
- **Auth:** JWT sessions with bcrypt password hashing

## Infrastructure
- Domain: `vibeapp-factory.moretti.cc`
- Docker network: `coolify`
- Optional: Postgres via Coolify, S3 bucket (when needed)
