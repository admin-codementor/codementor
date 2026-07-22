# Implementation Plan: Migrating Basic User Info to Firebase Firestore

**Status:** IMPLEMENTED (2026-07-22) — see "Actual implementation" note below; the
rest of this document is the original design proposal and is kept for context.

> **Deviation from this plan:** the implementation uses two role-split
> top-level collections, `students` and `faculty` (not a single `users`
> collection as proposed in §4 below) — faculty/hod/admin all write to
> `faculty`. Doc ID is still the legacy Postgres `users.id` UUID, per §3's
> reasoning. New code: `backend/src/config/firestore.js`,
> `backend/src/repositories/userRepository.js`,
> `backend/scripts/migrate-users-to-firestore.js`. Every controller that used
> to join/select name/email/department/section/year/roll_no/permissions from
> Postgres `users` now reads those fields from Firestore via
> `userRepository`, hydrating Postgres aggregate-query results in
> application code. `rating` (Elo) and `totp_secret`/`totp_enabled` remain
> Postgres-only, as this doc originally scoped.
**Author:** generated with Claude Code, 2026-07-22
**Scope:** Phase 3 of the Firebase migration. Phase 1+2 (see `a06a1d1 feat(auth): migrate to Firebase Auth`) moved authentication to Firebase Auth but left all application data — including basic user profile fields — in Postgres. This phase moves the **basic user information** record to Firestore. Coding-platform profiles, submissions, courses, problems, etc. are explicitly **out of scope** for this iteration and stay in Postgres for now (see "Non-goals").

---

## 1. Current State (as-is)

### 1.1 Storage
- Backend: Node/Express 5, CommonJS, raw `pg` driver, **no ORM**. Schema lives as idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements in [`backend/src/config/db.js`](../../backend/src/config/db.js).
- `firebase-admin ^14.2.0` is installed and used **only** for `firebase-admin/auth` (token verification). No `firebase-admin/firestore` usage anywhere in the repo today — this is a greenfield Firestore integration.
- Frontend (`frontend-next`): `firebase ^12.16.0` installed, used only for client-side sign-in/sign-up/password-change (`frontend-next/src/lib/firebase.ts`). No `firebase/firestore` import yet.

### 1.2 The `users` table (effective shape, Postgres)
```sql
users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255),              -- nullable since Phase 2 (Firebase owns auth)
  role VARCHAR(20) DEFAULT 'student',      -- 'student' | 'faculty' | 'hod' | 'admin'
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  permissions JSONB NOT NULL DEFAULT '{}',
  department VARCHAR(60) DEFAULT NULL,
  section VARCHAR(20) DEFAULT NULL,
  year INTEGER DEFAULT NULL,
  roll_no VARCHAR(40) DEFAULT NULL,
  last_login_at TIMESTAMP DEFAULT NULL,
  totp_secret TEXT DEFAULT NULL,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  google_id TEXT DEFAULT NULL,
  firebase_uid TEXT UNIQUE DEFAULT NULL,   -- Phase 1 link to Firebase Auth
  rating INTEGER NOT NULL DEFAULT 1200
)
```

**Critical dependency:** many other tables have FKs to `users.id` (the Postgres UUID), not `firebase_uid`: `coding_profiles`, `student_topic_mastery`, `rating_history`, `classroom_members`, `contest_registrations`, `mcq_attempts`, `code_submissions`, `audit_logs`, `proctor_events`, plus `problems.created_by`. **These are not moving to Firestore this iteration.** This constrains the design (§3).

### 1.3 Auth flow today
`POST /api/auth/firebase` (`backend/src/controllers/firebaseAuth.controller.js`) verifies the Firebase ID token, then upserts the Postgres row (lookup by `firebase_uid` → fallback lookup by `email` → insert), then mints the app's own JWT (`{ id, role, permissions, department }`). `protect` middleware (`backend/src/middleware/auth.middleware.js`) only checks this app JWT — `req.user.id` is the **Postgres UUID** everywhere downstream, not the Firebase UID. This upsert function is the single chokepoint for user creation and is where dual-write logic will go.

### 1.4 Frontend `User` shape
`frontend-next/src/lib/types.ts`:
```ts
export type Role = "student" | "faculty" | "hod" | "admin";
export interface User {
  id: string | number;
  name: string;
  email: string;
  role: Role;
  department?: string;
  section?: string;
  year?: number;
  roll_no?: string;
}
```
Persisted in `localStorage["user"]` via `frontend-next/src/lib/auth.ts`. No React context/provider — components call `getUser()` directly.

---

## 2. What counts as "basic user information" for this iteration

Based on every endpoint that reads/writes `users` (see full endpoint table in the research below), the "basic info" fields are:

| Field | Type | Notes |
|---|---|---|
| `name` | string | editable via `PUT /api/student/profile` |
| `email` | string | immutable post-registration (owned by Firebase Auth) |
| `role` | enum | `student` \| `faculty` \| `hod` \| `admin` |
| `department` | string? | used for HOD/faculty scoping |
| `section` | string? | |
| `year` | number? | students only |
| `roll_no` | string? | students only |
| `permissions` | object | per-faculty capability flags, admin-managed |
| `firebase_uid` | string | link key, already exists |
| `created_at` | timestamp | |
| `last_login_at` | timestamp | |

**Explicitly excluded from this iteration** (stay in Postgres): `password_hash` (dead weight — should be dropped separately, not migrated), `failed_login_attempts`/`locked_until` (legacy password lockout, Firebase Auth now owns this), `totp_secret`/`totp_enabled` (2FA — depends on `id`, keep colocated with auth logic for now), `google_id` (legacy, superseded by `firebase_uid`), `rating` (contest/Elo data — belongs with `rating_history`, a separate future migration), `coding_profiles` and all the other FK-linked tables in §1.2.

---

## 3. Key design decision: document ID

**Decision: keep the Firestore document ID equal to the existing Postgres `users.id` (UUID), not the Firebase UID.**

Rationale: every FK-referencing table (`coding_profiles`, `code_submissions`, `audit_logs`, etc.) points at `users.id` and is *not* migrating this iteration. If Firestore used `firebase_uid` as the key, every join/query in `faculty.controller.js`, `student.controller.js`, and `profiles.controller.js` would need a `firebase_uid ↔ users.id` translation layer on every request. Keeping `users.id` as the Firestore doc ID means:
- Existing Postgres tables keep working unmodified (`req.user.id` stays the join key).
- `firebase_uid` becomes just a field inside the Firestore doc (as it is a column in Postgres today), used only at the login exchange to resolve which doc to read/create.
- A future full migration (moving submissions, ratings, etc.) is not blocked either way, but this choice avoids widening scope now.

---

## 4. Proposed Firestore schema

Collection: **`users`** (top-level), document ID = `users.id` (Postgres UUID, unchanged going forward — Firestore auto-ID is *not* used, since we need referential stability with Postgres FKs).

```ts
// Firestore: users/{userId}
{
  firebaseUid: string;          // Firebase Auth UID — unique index needed (see §6)
  name: string;
  email: string;                // kept in sync with Firebase Auth email; source of truth = Firebase Auth
  role: "student" | "faculty" | "hod" | "admin";
  department: string | null;
  section: string | null;
  year: number | null;
  rollNo: string | null;
  permissions: Record<string, boolean>;   // e.g. { canGrade: true, canManageClassrooms: true }
  createdAt: Timestamp;
  lastLoginAt: Timestamp | null;
  // migration bookkeeping (see §7), remove once cutover is complete:
  _migratedFromPostgresAt: Timestamp;
}
```

Naming: camelCase per Firestore/JS convention (`roll_no` → `rollNo`), translated at the repository-layer boundary described in §5 so the rest of the backend (and the frontend `User` type) don't need to change key casing simultaneously — the API response shape (`snake_case` or as currently returned) stays the same; only the storage layer changes.

**Indexes needed** (Firestore composite/simple):
- Single-field index on `firebaseUid` (equality lookup on every login) — Firestore auto-indexes single fields by default, so this is free, but must be enforced as unique at the application layer (Firestore has no native unique constraint) — see §6.
- Single-field index on `email` (used for the fallback-by-email lookup during the transition period, and for admin lookup-by-email flows).
- Composite index on `(department, section, role)` — used by faculty roster (`GET /api/faculty/students`) and analytics/cohort endpoints (`getStudents`, `analytics/cohorts`, `cohort-students`) which currently do this filter in SQL. Needed only if these endpoints move to reading Firestore directly instead of joining through Postgres (see §8 rollout options).

---

## 5. Backend implementation changes

1. **`backend/src/config/firestore.js`** (new) — mirrors `firebaseAdmin.js`:
   ```js
   const { getFirestore } = require('firebase-admin/firestore');
   const { firebaseApp } = require('./firebaseAdmin'); // export the app, not just firebaseAuth
   module.exports = { db: getFirestore(firebaseApp) };
   ```
   (Requires exporting `firebaseApp` from `firebaseAdmin.js`, currently only `firebaseAuth` is exported.)

2. **`backend/src/repositories/user.repository.js`** (new) — thin data-access layer wrapping Firestore reads/writes for the fields in §4, so controllers stop writing raw SQL against `users` for these fields. Functions: `findById(id)`, `findByFirebaseUid(uid)`, `findByEmail(email)`, `create(userData)`, `update(id, partial)`. This is the seam that lets every controller currently doing `SELECT ... FROM users WHERE ...` swap its data source without touching call sites.

3. **Update call sites** (from the endpoint table in the research above) to go through the repository instead of inline SQL on `users` basic-info columns:
   - `firebaseAuth.controller.js` — the upsert-on-login chokepoint; becomes the single writer of new Firestore user docs.
   - `student.controller.js: updateProfile` — writes `name`.
   - `student.controller.js: dashboard/getLeaderboard` — reads `rating` (stays Postgres, unaffected) joined with `name/department/section` (moves to Firestore reads, batched via `getAll`).
   - `faculty.controller.js` — `getStudents`, `getAtRiskStudents`, `getStudentDetail`, submissions/export/progress/analytics endpoints, `faculty-list`, `permissions/:userId` — these are the highest-risk call sites because several do SQL joins mixing `users` columns with Postgres-only tables (submissions, coding_profiles) in one query. Each needs to become: **Firestore read for user fields + Postgres query for the rest, merged in application code.** This is the main engineering cost of this migration (see §8).
   - `auth.middleware.js` (`protect`) — unchanged; still validates the app JWT. No change needed since `req.user.id` stays the same UUID.

4. **Keep the JWT payload and `req.user` shape unchanged** (`{ id, role, permissions, department }`) — this avoids touching every authorization check (`role.middleware.js`, `permissions.js`) in this iteration. `id` still refers to the same UUID, now also the Firestore doc ID.

---

## 6. Firebase UID uniqueness enforcement

Firestore has no unique-constraint mechanism like Postgres `UNIQUE`. Since `firebase_uid` is `UNIQUE` in Postgres today, replicate this application-side:
- On create, query `users` where `firebaseUid == uid` first; if found, treat as update not insert (already partially done in `firebaseAuth.controller.js`'s existing fallback logic — port that logic into the new repository's `create`/`findByFirebaseUid`).
- Optionally maintain a second lookup collection `firebaseUidIndex/{uid} -> {userId}` if lookups by UID need to be transactional against inserts (avoids a race between "check" and "create" under concurrent first-logins) — recommended if registration concurrency is a real risk (e.g. two tabs racing a first Google sign-in), otherwise the existing check-then-act is likely fine given login volume.

---

## 7. Migration procedure (Postgres → Firestore, existing rows)

One-time backfill script (`backend/scripts/migrate-users-to-firestore.js`, new):
1. Page through all `users` rows in Postgres (`ORDER BY created_at`, batches of e.g. 500).
2. For each row, write a Firestore doc at `users/{id}` with the mapped fields from §4, plus `_migratedFromPostgresAt: now()`.
3. Use `db.batch()` (max 500 writes/batch) or `bulkWriter()` for throughput.
4. Log any row missing `firebase_uid` (pre-Firebase-migration accounts that never logged in since Phase 1) — these still need a real Firebase Auth account created (via `firebase-admin/auth`'s `createUser` using the existing email, generating a random password / sending a password-reset, or requiring next-login-via-Google) before they have a `firebaseUid` to store. This is a prerequisite gap to flag to the team before running the backfill — quantify how many `users` rows currently have `firebase_uid IS NULL`.
5. Script should be idempotent (safe to re-run) — use `set()` with merge, keyed by the same doc ID, not `create()`/`add()`.

---

## 8. Rollout strategy

Given the number of call sites that currently do a single SQL query mixing basic-info columns with other Postgres-only data (submissions, coding profiles, ratings), recommend a **dual-read/write transition window** rather than a hard cutover:

1. **Write-through phase:** `firebaseAuth.controller.js` and `student.controller.js: updateProfile` write to both Postgres `users` (unchanged) and the new Firestore doc, via the repository layer. Reads still come from Postgres. This validates the write path and backfill correctness with zero read-side risk.
2. **Shadow-read phase:** for each read call site, read from Firestore and from Postgres, log any diff (should be none if step 1 is correct), still **serve the Postgres value** to the client.
3. **Cutover phase, endpoint by endpoint:** switch each endpoint's basic-info reads to Firestore, keep Postgres joins for non-user data (submissions/ratings/coding profiles) and merge in application code. Start with the lowest-risk, lowest-traffic endpoints (`GET /api/faculty/permissions/:userId`) before the highest-traffic/highest-join-complexity ones (`getStudents`, `analytics/cohorts`).
4. **Decommission phase:** once all reads are off Postgres `users` basic-info columns and stable, stop writing to Postgres for those columns; keep the `users` table itself (other tables still FK into `users.id`, and dropping the table is out of scope — a UUID-only stub row may still need to exist in Postgres purely to satisfy FK constraints, unless those FKs are later changed to a plain UUID column without a FK constraint).

This plan explicitly does **not** propose dropping the Postgres `users` table this iteration — only the basic-info *fields* move to being sourced from Firestore; a minimal row (id, and whatever FK integrity requires) likely still needs to exist in Postgres for the FK-dependent tables until they migrate too.

---

## 9. Frontend changes

- `frontend-next/src/lib/types.ts`: **no shape change required** — the `User` interface stays the same; only the backend's storage layer changes, and the API response contract is preserved by design (§4, §5).
- `frontend-next/src/lib/firebase.ts`: no change needed for this iteration (client doesn't talk to Firestore directly — all reads/writes go through the existing backend API, preserving the current auth/session model in `auth.ts`). If a future iteration wants the frontend to read Firestore directly (e.g. for real-time profile updates), that would need Firestore security rules and a client SDK addition — explicitly deferred, not needed for "basic info" migration.

---

## 10. Open questions to confirm with the team before implementation

1. How many existing `users` rows have `firebase_uid IS NULL`? (Determines backfill complexity, §7.)
2. Is a dual-write transition window (§8) acceptable, or is a maintenance-window hard cutover preferred given current traffic?
3. Should `permissions` (admin-managed JSONB) have its own Firestore security-rule constraints (e.g. only writable by admin role via backend, never client-writable) — recommend yes, enforced purely server-side via `firebase-admin` (no direct client Firestore access), avoiding needing Firestore Security Rules at all for this collection in this iteration.
4. Confirm `email` remains sourced from Firebase Auth as ground truth (Firestore copy is denormalized for query convenience) — if a user changes email via Firebase, a sync mechanism (Cloud Function trigger on Auth user-update, or re-sync on next login) is needed to keep the Firestore copy from going stale.
