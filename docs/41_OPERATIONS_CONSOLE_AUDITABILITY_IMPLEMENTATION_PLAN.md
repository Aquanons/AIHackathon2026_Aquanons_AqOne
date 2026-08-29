# Operations Console and Auditability — Implementation Plan

## Purpose and delivery rule

Turn the existing MDRRMO dashboard into a trustworthy operations console with
least-privilege actions and a durable, searchable record of what authorized
people decided and did.

This plan adds a small shared audit ledger and an activity/timeline view to the
existing dashboard.  It does not build a separate admin product, introduce an
identity provider or MFA, collect raw passwords/tokens, log every three-second
dashboard poll, or claim tamper-proof legal evidence.  It provides an
append-only application audit trail that is suitable for the current project;
infrastructure-level retention, backups, and legal evidence handling need an
operations owner and are recorded as limits.

### Mandatory workflow

Before every phase, inspect the branch and preserve unrelated work.  Update
the shared API/role contract before an interface or permission changes.  Stage
only the phase's named files, inspect the staged diff, run its checks, and
create the stated focused commit.  Never use `git add -A`, amend another
person's commit, commit secrets or exports, or reformat unrelated dashboard,
mobile, SOS, or model work.

Do not proceed until the preceding phase demonstrably passes.  If the required
role/retention decision is missing, record that blocker and stop rather than
granting broad access by default.

## Current findings that the implementation must correct

- Operator accounts and signed JWTs exist, with `mdrrmo`, `lgu`, and `admin`
  roles, but most protected routes use only `require_user`.  In practice every
  signed-in role can perform the same sensitive writes.
- Some records retain a final actor/value (`acked_by`, sea-condition rows,
  advisory creator, device revocation), but there is no shared append-only
  history.  SOS acknowledgement can overwrite status/note, advisory updates
  overwrite the prior content, and resolution records no distinct resolver or
  reason.
- The sea-condition endpoint accepts `set_by_*` from the request body rather
  than deriving it from the authenticated operator.
- The existing dashboard honestly tracks live SOS-feed freshness, but its
  “Export View Data” is a browser-generated map/sample-data summary, not an
  operations audit export.  It must not be presented as one.
- The canonical PRD requires audit records for responder escalations, zone
  publication, and sensitive-data access.  It also requires purpose-based
  access: safety responders must not gain fishing-source access merely because
  they use the same application.

## Safety and acceptance boundary

The completed console must satisfy all of these conditions:

- Authorization is enforced server-side from a documented action matrix, not
  hidden/disabled buttons.  A role never receives an action merely because it
  can see a dashboard panel.
- Every high-impact protected mutation creates one append-only audit event in
  the same database transaction as the mutation; a retry is auditable without
  creating contradictory state.
- Audit records identify actor, role, timestamp, action, resource, outcome,
  correlation/idempotency key when available, and a redacted change summary.
  They never store passwords, JWTs, pairing codes, full SOS/free-text notes,
  or copied exact-location payloads.
- Responder case timelines show only the minimum relevant event data to people
  authorized for that case.  Global audit search/export is administrator-only.
- Audit reads are themselves recorded in a bounded, meaningful way (for
  example, a case view or audit export), but high-frequency background polling
  is not written once per request.  The policy and its aggregation are visible.
- Demo/synthetic actions are visibly marked and cannot be mistaken for an
  operational history.  No audit view turns stale data into a live claim.

## Phase 1 — Freeze roles and server-side action guards

### Work

1. Read `AGENTS.md`, `docs/00_START_HERE.md`, `docs/05_PUBLIC_API.md`, the
   PRD governance/role sections, `backend/app/auth.py`, every write route, and
   the dashboard callers before editing.
2. Update `docs/05_PUBLIC_API.md` first with one approved action matrix.  Get
   the MDRRMO owner to approve it before code.  As the minimal starting point,
   separate: responder incident actions (SOS, anomaly escalation, drift/search
   work), official advisory/sea-condition publication, vessel-device pairing
   and revocation, audit/case viewing, and operator-account setup.  State
   which actions each existing role may perform and which data class it may
   read.
3. Add a small `require_roles(...)` dependency beside the existing auth guards;
   reuse JWT authentication and the existing role values.  Do not add a new
   authentication framework, a client-side-only role check, or a role editor
   UI.
4. Apply the guard to current high-impact routes and the new actions planned in
   docs 36–40.  Derive actor identity/name from the token server-side; remove
   user-controlled actor fields from request bodies (especially sea-condition
   `set_by_*`).  Preserve unauthenticated SOS intake and public safety reads
   exactly as their emergency-access contracts specify.
5. Audit the dashboard's controls against the same matrix.  Hide/disable a
   forbidden action as guidance, but leave the backend guard as the authority.
   Correct the wording of the existing view-data export so it cannot imply an
   audit export.

### Tests

- Unit tests for the role guard cover missing/expired token, unknown role, and
  every approved/denied action pairing.
- Route tests prove a valid but unauthorized role cannot acknowledge/resolve
  SOS, publish a sea condition/advisory, revoke a device, or take planned
  anomaly/drift actions.
- Test that attribution on a sea-condition write comes from the authenticated
  actor, not a forged body value.
- Run targeted auth/route tests and `ruff check .` from `backend`; run the
  existing dashboard syntax/tests that touch changed controls.

### Commit

`feat(auth): enforce operations roles`

## Phase 2 — Add one redacted append-only action ledger

### Work

1. Add a migration for a single `operations_audit_events` table.  Keep it
   narrow: event ID, occurred-at, actor user ID/email/role when available,
   action, resource type/ID, outcome, correlation/idempotency key, demo flag,
   and small redacted metadata/change-summary JSON.  Add indexes for
   resource/time and actor/time.  Do not duplicate whole domain rows or create
   event sourcing for the entire application.
2. Make the application ledger append-only: expose no update/delete API, add
   database protection against ordinary row update/delete where appropriate,
   and document that a database owner can still administer the database.  Do
   not describe this as cryptographic or legal immutability.
3. Create one small audit helper that accepts an existing transaction/connection
   and produces a whitelist-based redacted summary.  It must never serialize
   raw credentials, free-text SOS/responder/advisory content, exact coordinates,
   or raw request headers.  Log field names/state transitions and IDs instead.
4. Wire it into these server-side decisions in the same transaction as their
   writes: responder SOS acknowledgement/status/resolution, anomaly triage,
   drift-case open/rerun/search report, sea-condition declaration, advisory
   create/update/publish/delete, and vessel-device pairing-code issue/revoke.
   Also record login success/failure and operator-account setup without logging
   passwords or setup keys.
5. Give idempotent routes a stable correlation key/resource-state check so an
   HTTP retry can be recognized.  The audit should record an already-applied
   outcome when that is operationally useful; it must not append a fictitious
   second state transition.

### Tests

- Migration test verifies expected columns/indexes and rejects ordinary update
  or delete according to the chosen protection.
- For each wired high-impact mutation, test one committed domain change and one
  matching redacted audit event.  Test the mutation rolls back if its audit
  insert fails inside the transaction.
- Redaction tests assert known sensitive fields never appear in serialized
  audit metadata or logs.
- Idempotency tests prove a retry neither changes the resource twice nor
  creates contradictory audit history.
- Run targeted backend tests and `ruff check .`.

### Commit

`feat(audit): record responder operations`

## Phase 3 — Expose authorized case timelines and bounded access events

### Work

1. Define and document two read paths:

   - a responder-visible timeline for one SOS/drift/anomaly case, limited to
     actions and status transitions relevant to that case;
   - an administrator-only global audit query/export with cursor pagination,
     bounded date range, actor/action/resource filters, and a maximum page
     size.

   Do not expose a bulk cross-vessel history to a role that needs only one
   active case.
2. Implement protected endpoints using opaque cursor pagination, newest-first
   stable ordering, and server-side filter validation.  The response contains
   the redacted audit summary, never the raw domain payload.
3. Record meaningful sensitive-access events without filling the database with
   polling noise: log an explicit case detail view and an audit export/search,
   deduplicated by actor/resource/session window according to a documented
   policy.  Do not record each `/api/sos/active` refresh as a separate event.
4. Add any missing lifecycle details needed for an honest timeline, such as the
   resolver identity/reason on SOS resolution and case state/version for
   anomaly/drift actions.  Keep domain fields as the current state; use the
   audit ledger for history rather than adding a parallel history table per
   feature.
5. Provide a server-generated CSV/JSON audit export only to the approved
   administrator role and only for the bounded filter range.  Stamp it with
   generated time and applied filters.  Do not treat the current browser map
   export as an audit record or include sensitive coordinates/notes.

### Tests

- Role tests prove responders can view only an eligible case timeline and only
  administrators can query/export global history.
- Pagination/filter tests prove stable ordering, limits, malformed cursor/date
  rejection, and no resource data leaks through metadata.
- Access-event tests prove one explicit view/export is recorded under the
  policy while repeated dashboard polling does not generate an event storm.
- Export tests verify redaction and correct content type/headers.
- Run targeted backend tests and `ruff check .`.

### Commit

`feat(operations): expose incident timelines`

## Phase 4 — Add the operations/audit console to the existing dashboard

### Work

1. Reuse the existing authenticated dashboard shell, `authFetch`, profile
   identity, freshness indicators, and side-panel/tab patterns.  Add one
   “Activity” or “Case history” surface; do not create a second web app or
   introduce a dashboard framework.
2. For an opened SOS/anomaly/drift case, show the authorized timeline in plain
   language: time, actor, action, state transition, demo marker, and redacted
   reason/summary.  Keep source/calibration/freshness metadata near model
   entries so a model event cannot be misread as a human dispatch decision.
3. For administrators, add a compact filterable audit panel and a bounded
   export control.  Display the applied range/filters and page through results;
   never load the complete history into the browser.  For other roles, omit
   the global audit option rather than presenting an empty but tempting control.
4. Show role-aware action affordances for SOS acknowledgement/resolution,
   advisory/sea-condition changes, device actions, and planned drift/anomaly
   actions.  Render server `403` errors clearly and refresh the relevant case
   after a successful action.
5. Preserve the existing LIVE/STALE/OFFLINE behavior.  If timeline/audit fetch
   fails, label that panel unavailable/stale without changing the actual SOS
   feed's freshness or implying the action succeeded.  Retain visible DEMO
   labels for synthetic events.

### Tests

- Add the smallest existing dashboard tests/checks for role-visible controls,
  redacted timeline rendering, pagination/filter state, successful action
  refresh, `403`, and audit-panel outage.  Include an HTML-escaping case for
  every server-provided summary.
- Manually verify one real test account per approved role, including reload and
  an administrator export with the displayed filters.
- Run the dashboard checks plus targeted backend tests and `ruff check .`.

### Commit

`feat(dashboard): add operations audit console`

## Phase 5 — Verify operation, retention, and handoff

### Work

1. Obtain and record the owner-approved audit retention period, backup/export
   handling, who may administer the database, and the case-view aggregation
   window.  Do not implement automatic deletion until that policy exists.
2. In a non-production or explicitly approved demo environment, execute an
   end-to-end chain: operator login, SOS acknowledgement and resolution,
   one sea-condition/advisory action, one device action, and (when available)
   one anomaly/drift action.  Verify each case timeline, role restriction,
   redaction, and administrator export.
3. Verify the Railway health endpoint and deployed role behavior with accounts
   created through the existing controlled setup route.  Never place setup keys,
   JWTs, pairing codes, or export contents in the repository or screenshots.
4. Update `docs/08_DEMO_AND_STATUS.md` and the README only with the exact
   environment, date, roles tested, events/actions audited, checks run,
   retention decision, and known limits.  State plainly that this is an
   application audit ledger, not an external immutable evidence store.

### Tests

- `python -m pytest -q` and `ruff check .` pass in `backend`.
- Run dashboard checks from Phase 4.
- Manual acceptance: an authorized responder can act on a case and reload its
  history; an unauthorized user cannot perform or view the wrong operation;
  an administrator can query/export redacted records; and a failed audit-panel
  refresh never falsely reports a successful action.

### Commit

`docs(operations): record console and audit verification`

## Handoff checklist for Claude Code

- Read the canonical PRD governance section, `AGENTS.md`, and Plans 36–40
  before coding, because every new responder action must use the same role and
  audit helper.
- Keep the audit schema generic and small.  Reuse it for lifecycle history;
  do not create separate audit tables, event buses, or admin dashboards for
  each feature.
- Preserve public safety feed/SOS-ingest emergency access and vessel-device
  rules.  Auditing must not accidentally require a fisherman account or delay
  an SOS write.
- Report exact test commands and the commit hash after every phase.  Stop
  before the next phase if a test, role matrix, or retention decision is
  unresolved.
