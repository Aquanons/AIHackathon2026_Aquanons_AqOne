# Implementation Plan: {{FEATURE_NAME}}

Created: {{TIMESTAMP}}
Updated: {{TIMESTAMP}}
Revision: 1
Status: Awaiting approval
Feature spec and revision: [Unresolved]
Approved baseline and architecture revisions: [Unresolved]
Len's chat approval: Not recorded
Target branch: [Verify in this repository]

## Scope

[Link approved requirement IDs; identify existing edits to preserve.]
Resolve the fields and exact checks before presenting this plan for approval.
Use as many phases as the work needs; one phase is sufficient for a small feature.

## Phase 1: [Testable outcome]

Requirements: [FEAT-NNN/REQ-NNN]
State: Awaiting approval

### Tasks

- [ ] [Specific work within the approved architecture.]

### Verification

- [ ] [Exact command or reproducible scenario, expected result, and environment.]
- [ ] [Evidence path containing actual results and limitations.]

### Review and checkpoint

- [ ] Review correctness, scope, dependencies, and unrelated changes.
- [ ] Update plan, evidence, and current handoff.
- [ ] Stage only reviewed phase-related paths and verify the staged diff.
- [ ] Commit with a unique phase message and verify Git reports success.

Checkpoint message: [Choose a conventional commit message for this phase]
Phase completion requires all gates and a successful commit; the message identifies the checkpoint without needing its own hash inside the commit.
Continue automatically to the next approved phase.

## Recovery

Follow project `AGENTS.md` for the three-attempt limit and immediate blockers.
Record unresolved work and attempt counts in the current handoff.
Interrupted or failing work remains uncommitted and the phase remains incomplete.
