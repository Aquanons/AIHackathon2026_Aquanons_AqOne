---
name: implementation-plan
description: >
  Creates, manages, and executes structured, phased implementation plans in an
  IMPLEMENTATION_PLAN.md document. Enforces test verification gates, Ponytail
  anti-bloat reviews, git commits after every major phase, and mandatory hard
  stops requiring user sign-off before proceeding. Trigger: /plan, "create plan",
  "implementation plan", "phased plan", "make plan with commits".
argument-hint: "[create <feature> | execute <phase> | status]"
license: MIT
---

# Implementation Plan (Phased Execution Engine)

This skill structures any non-trivial coding task into an actionable, phased
`IMPLEMENTATION_PLAN.md`. It eliminates run-away agent changes, preserves git
history sanity, and guarantees that every phase is thoroughly tested, reviewed
for bloat, committed, and approved before moving on.

---

## The Four Iron Rules

1. **Incremental Phases:** Break any feature into 3 to 5 discrete, bite-sized phases.
2. **Verification First:** No phase is done until its tests and lint checks pass.
3. **Git Commit Every Phase:** Every completed phase receives an atomic, conventional git commit.
4. **🛑 HARD STOP:** Execution must halt at the end of each phase. You must show the completed status and wait for explicit user confirmation before touching files in the next phase.

---

## Phase Lifecycle & Gates

Every single phase in the plan follows this strict lifecycle:

```
[1. Execute Tasks]
       ↓
[2. 🧪 Verification Gate] -> Run test/typecheck suite
       ↓
[3. 🔍 Ponytail Review]   -> Verify 0 unneeded dependencies & shortest diff
       ↓
[4. 📦 Git Commit]        -> Stage and commit changes with conventional commit
       ↓
[5. 🛑 HARD STOP]         -> Halt execution, summarize diff, ask user to proceed
```

---

## Standard `IMPLEMENTATION_PLAN.md` Template

When creating a new plan, generate or update `IMPLEMENTATION_PLAN.md` at the project
root using this exact schema:

```markdown
# Implementation Plan: [Feature Name]

> **Status:** Phase 1 in progress  
> **Target Branch:** [branch name]  
> **Test Command:** `npm test` (or `pytest`, etc.)  
> **Lint/Check Command:** `npm run check` (or `cargo check`, etc.)

---

## Overview
Brief 2–3 sentence description of the end goal and core architecture decision
(grounded by Council consensus).

---

## Phase 1: [Foundation / Types / Schema]
**Goal:** Establish interfaces, types, database migrations, or base configuration.

### Tasks
- [ ] Task 1.1: [Specific file edit or creation]
- [ ] Task 1.2: [Specific file edit or creation]

### 🧪 Verification Gate
- [ ] Run test suite: `[exact command]` (must exit code 0)
- [ ] Run typecheck/linter: `[exact command]` (0 errors)

### 🔍 Review Gate (Ponytail)
- [ ] Did we add any unrequested packages? (If yes, revert and use stdlib/existing)
- [ ] Is every new abstraction strictly needed right now? (YAGNI)

### 📦 Git Checkpoint
```bash
git add <specific paths>
git commit -m "feat(<scope>): phase 1 - <short summary of what was added>"
```

### 🛑 HARD STOP
> **PAUSE HERE.** Report completed tasks, test outputs, and git commit hash to the user.
> Prompt: *"Phase 1 is complete, verified, and committed. Ready to proceed to Phase 2?"*
> **DO NOT PROCEED UNTIL USER CONFIRMS.**

---

## Phase 2: [Core Domain / Business Logic]
**Goal:** Implement pure logic, core functions, or service handlers.

### Tasks
- [ ] Task 2.1: ...
- [ ] Task 2.2: ...

### 🧪 Verification Gate
- [ ] Unit tests for new logic: `[exact command]`

### 🔍 Review Gate (Ponytail)
- [ ] Shortest working diff? (Run ponytail-review on git diff)

### 📦 Git Checkpoint
```bash
git add <specific paths>
git commit -m "feat(<scope>): phase 2 - <short summary>"
```

### 🛑 HARD STOP
> **PAUSE HERE.** Obtain user confirmation before proceeding to Phase 3.

---

## Phase 3: [Integration, UI, or API Routes]
...
```

---

## Managing Execution

* **Updating Progress:** After finishing each task, edit `IMPLEMENTATION_PLAN.md` to check off the box (`- [x]`).
* **Handling Failures:** If a verification test fails during a phase:
  1. Do NOT proceed to the git commit.
  2. Apply the minimal fix directly at the root cause.
  3. Re-run the verification gate until green.
* **Never Skip Hard Stops:** The Hard Stop protects the user against compounding errors. Even if confident, you must stop, present the progress report, and request permission to continue.

---

## Guidelines

- Never use the em dash "—".
  Use plain dash "-" instead.
- When writing commit messages, NEVER auto-add your agent name as co-author.
- Never manually modify CHANGELOG.md files or any files that are marked as auto-generated.
- When writing or substantially editing long Markdown files, put each full sentence on its own line.
  Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
- When making technical decisions, do not give much weight to development cost.
  Instead, prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned with how an end user would use it.
  This makes sure you find the real problem so your fix will actually solve it.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel perfection.
  If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along.
- Apply that same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.

