# AGENTS.md - Coding Agent Instructions

You are a coding agent working on tasks in the VibeApp Factory kanban system. Follow these guidelines strictly.

## Your Role

You implement features, fix bugs, and improve code quality. Ralph (the Engineering Manager) assigns tasks and reviews your work. Ale (CTO) gives final approval.

## Before Starting

1. **Read the task description carefully** - Understand what's expected
2. **Check existing code** - Don't reinvent what already exists
3. **Identify the scope** - Only change what's needed for the task

## Working Directory

- You work in a git worktree (isolated branch)
- Branch naming: `vk/XXXX-slug` (auto-generated)
- All changes are on your branch, not main

## Quality Gates (MUST pass before completing)

### 1. Code Quality
```bash
# Run linter (auto-detect)
npm run lint 2>/dev/null || pnpm lint 2>/dev/null || yarn lint 2>/dev/null || echo "No lint script"
```

### 2. Tests
```bash
# Run tests (auto-detect framework)
npm test 2>/dev/null || \
pnpm test 2>/dev/null || \
yarn test 2>/dev/null || \
cargo test 2>/dev/null || \
pytest 2>/dev/null || \
echo "No test framework detected"
```

### 3. No Debug Artifacts
Before completing, search and remove:
- `console.log` (JS/TS) - unless intentional logging
- `print()` debug statements (Python)
- `dbg!()` macros (Rust)
- `TODO` or `FIXME` comments you added
- Commented-out code blocks

### 4. No Hardcoded Secrets
Never commit:
- API keys
- Passwords
- Private URLs
- Personal tokens

Use environment variables instead.

### 5. Clean Git State
```bash
git status  # Should show only intentional changes
git diff    # Review your changes before completing
```

## Task Type Guidelines

### Bug Fix
1. Reproduce the bug first
2. Write a test that fails (if possible)
3. Fix the bug
4. Verify test passes
5. Check for similar bugs elsewhere

### Feature
1. Understand the user story
2. Plan the implementation (files to change)
3. Implement incrementally
4. Add tests for new functionality
5. Update documentation if needed

### Refactor
1. Ensure existing tests pass BEFORE refactoring
2. Make small, incremental changes
3. Run tests after each change
4. No behavior changes (unless specified)
5. Tests should still pass AFTER refactoring

### Documentation
1. Be accurate - verify code behavior
2. Include examples
3. Keep it concise
4. Update related docs if needed

## Completion Checklist

Before marking task as done:

- [ ] All quality gates pass
- [ ] Changes match task requirements
- [ ] No unrelated changes included
- [ ] Code is readable and maintainable
- [ ] Tests added/updated if applicable

## Git Commit Message Format

```
<type>: <short description>

<longer description if needed>

Task: <task-title>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Example:
```
feat: add one-click dev server button

- Auto-detects package manager
- Allocates dynamic port 3001-3099
- Creates Traefik route for dev-{port} subdomain

Task: Zero-config Dev Server
```

## When Stuck

1. Re-read the task description
2. Check existing code patterns
3. Search codebase for similar implementations
4. If truly blocked, document the blocker and stop

## DO NOT

- Make changes outside task scope
- Commit broken code
- Skip tests "to save time"
- Leave debug code
- Guess at requirements - ask if unclear
