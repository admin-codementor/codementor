# CodeMentor — Design & UX conventions

The single source of truth for how the `frontend-next` UI looks and behaves.
Follow these so every screen feels like one product (consistency = the backbone
of the UX-laws work). When in doubt, reuse an existing primitive rather than
styling ad-hoc.

## Color (Material 3 tokens)

Never hardcode hex values in components. Use theme palette roles — they are
scheme-aware (light/dark) via CSS variables (`var(--mui-palette-*)`).

- **Primary** — main brand actions, links, active nav.
- **Secondary / Tertiary** — supporting accents, tonal chips.
- **success / warning / error** + their `*Container` / `on*Container` pairs — status only (verdicts, difficulty, alerts). Color never carries meaning alone; always pair with text/icon.
- **ai / onAi / aiContainer / onAiContainer** — AI tutor/assistant surfaces only. Use `var(--mui-palette-ai)` (+ `color-mix` for tonal fills). Keeps the assistant visually distinct from primary.
- **surface / surfaceContainer* / outline / outlineVariant** — cards, dividers, borders. Card borders use `outlineVariant`.

## Feedback (pick the right channel)

- **Transient success/error after an action** → `useToast()` (global). Do **not** roll a per-page `Snackbar`/`Alert` for this.
- **Persistent, in-context message** (e.g. form validation summary, "JPlag not configured") → inline `<Alert>`.
- **Destructive confirmation** → `useConfirm()` (`await confirm({ destructive: true, ... })`). Never `window.confirm`.
- **Blocking async on a button** → button spinner + disabled; keep the label ("Saving…").

## Loading / empty / error states

- **Content loading** → MUI `<Skeleton>` shaped like the content (not a centered spinner).
- **Empty** → `<EmptyState icon title description action />`.
- **Fetch failure** → `<ErrorState onRetry />`.
- **Button-level** async → inline spinner only.

## Layout & spacing

- Page shell: `AppShell` (student/faculty) or the full-screen IDE layout. Full-screen views (IDE, exam-taking) intentionally skip `AppShell`.
- Every page starts with `<PageHeader title subtitle actions />` (except full-screen views).
- Group related content in `Card variant="outlined"` (border `outlineVariant`) or the local `SectionCard`.
- Spacing uses the MUI 8px scale via `sx` (`p: 2` = 16px). Prefer `Stack`/`Box` grid over manual margins.
- One **contained** (filled) button per view = the primary action (Von Restorff); everything else `outlined`/`text`.

## Shared primitives (reuse these)

`PageHeader`, `StatCard`, `SectionCard`, `SearchField`, `SegmentedButtons`,
`DifficultyChip`, `VerdictChip`, `RatingBadge`, `EmptyState`/`ErrorState`,
`AITutorSidebar`, `ToastProvider`/`useToast`, `ConfirmProvider`/`useConfirm`,
`interactiveSurfaceSx`, `lib/languages` (`languageName`).

## Icons

All icons come from **`@/components/ui/icons`** (never `@mui/icons-material` directly) — a central
module wrapping **Lucide** (`lucide-react`) in a MUI-compatible adapter. Icons keep the familiar API:
`fontSize` ("small"|"medium"|"large"|"inherit" or a number), `color` (palette word or path), `sx`, and
are `aria-hidden` by default (pass `aria-label`/`titleAccess` for meaningful icons). Sizing is
`width/height: 1em` scaled by `font-size`, and strokes use `currentColor`, so `sx={{ color:
"success.main" }}` just works. To swap the icon set later, edit only `icons.tsx`. Names match the old
Material names (`CheckCircleOutlineIcon`, `MenuIcon`, …) so call sites stay stable.

## Charts & motion

Rich charts use **Nivo** (`@nivo/bar|line|pie`) themed via `useNivoTheme()` +
`useChartColors()` (`components/ui/nivo.tsx`) so they stay on the M3 palette in
light/dark. Wrap each chart in a fixed-height `Box`. (A tiny `@mui/x-charts`
`SparkLineChart` remains only in the IDE results panel.) Motion uses **Framer Motion**
via `components/ui/motion.tsx` — `Reveal` (fade-rise on mount), `RevealGroup`/`RevealItem`
(stagger), `SwapFade` (cross-fade between drill-down levels). All are
`prefers-reduced-motion`-aware (render static when reduced). Keep animations subtle.

## Icons — no text-as-icon

Never use bare letters/emoji where an icon belongs (e.g. difficulty uses Signal
tiers, not "E/M/H"). Vary icons by meaning — course module subcategories map topic →
icon (`moduleIcon()` in the course page), never a single repeated icon.

## Interactive surfaces (hover/press)

Any clickable card/tile/row uses **one** shared affordance so hover feels the same
everywhere. Spread `interactiveSurfaceSx` (from `components/ui/interactive.ts`) onto
the surface `sx` and make the element itself actionable (`CardActionArea`, button, or
`role="button"`): it lifts (`translateY(-2px)`), strengthens the border to `outline`,
tints to `surfaceContainer`, and adds a soft shadow. `StatCard` takes `href`/`onClick`
(+ `selected` for filter-style pressed state) to become interactive without ad-hoc
wrappers. List rows (`MuiListItemButton`) and table rows (`hover`) get a consistent
tokenized hover via theme overrides — don't hand-roll `action.hover` one-offs. The
global `prefers-reduced-motion` rule neutralizes the transform.

## Profile is the personal hub (role-aware)

Each role has its **own** profile — never shared. Students use `/app/profile` (under
the student shell): tabbed **Overview / Submissions / Coding Profiles / Account**,
synced to `?tab=`. The Overview has a Period filter (Overall/7d/30d/6mo) driving a
**Submission Breakdown** (verdict-quality cards + `@mui/x-charts` pie) from
`GET /api/student/stats?period=`. Faculty & admin use `/faculty/profile` (under the
faculty shell, so they keep the faculty nav — never bounce into the student nav): a
role-aware identity header + faculty stat cards (from `/api/faculty/dashboard`) +
account/2FA. Each shell's `AppShell profileHref` points at its own profile route; the
avatar menu uses that.

## Faculty/Admin analytics (hierarchical drill-down)

`/faculty/analytics` drills **cohorts → students → individual** with a breadcrumb, using
`@mui/x-charts` `onItemClick` (click a bar to go deeper; each level fetches lazily).
Level 1 = cohorts grouped by Department/Year/Section (`GET /api/faculty/analytics/cohorts`,
Redis-cached ~120s); Level 2 = ranked students in a cohort (`…/cohort-students`, paginated);
Level 3 = one student (`…/students/:id/detail` — learning curve/verdict pie/topic bars).
**Department isolation:** admin sees all; HOD/faculty are scoped to their own department via
`scopeDept(req)`/`canSeeDepartment(req)` (`role.middleware.js`) — threaded into every analytics
query. New `hod` role behaves like dept-scoped faculty. Keep analytics aggregation **server-side +
cached + paginated** (never ship raw rows) for 1000-concurrent.

## Sidebar navigation

Student nav items are grouped under `overline` section subheaders (Practice /
Progress / Career / Assistant) via the optional `section` field on `NavItem` — keeps
the list within Miller's 7±2 and adds scannable structure. Dashboard and single
items may sit ungrouped at the top.

## Courses & problems

The Practice nav's **Courses** entry (`/app/courses`) is the primary problem-browsing
surface: courses → modules (subcategories) → problems, backed by
`courses`/`course_modules`/`module_problems` on the backend (`GET /api/courses`,
`/api/courses/:id`). The flat searchable list still lives at `/app/problems` ("Browse
all problems" from the Courses landing; keeps search + Pick Random) but is not a
top-level nav item.

## IDE editor & timer

The Monaco editor uses custom `codementor-dark`/`codementor-light` themes defined in
`beforeMount` (inherit VS Code `vs-dark`/`vs` token colours; background from
`tokens.ts`). Never pass a raw/invalid theme name to `<MonacoEditor>`. The problem
timer is `components/problem/TimerWidget.tsx`: one header chip shows **either** the
auto Session timer (active-time, pauses on tab-hide/solve) **or** the user-controlled
Pomodoro — never both; a popover switches modes. The results panel shows a
`ResultsSummary` (avg/max time + `@mui/x-charts` `SparkLineChart` + "X of Y shown/hidden
passed") above per-test rows; tabs are "Test cases"/"Terminal"; a bottom bar carries
Prev · Reset · Submit · Next.

## Accessibility

- Interactive elements have accessible names (`aria-label` on icon-only buttons).
- Color is never the only signal (status chips include text/icons).
- Focus-visible outline is themed globally; don't remove outlines.
- `prefers-reduced-motion` is respected globally — keep custom animations subtle.

## UX-laws quick reference

Doherty (<400ms feedback: skeletons + spinners) · Hick's/Miller's (chunk forms,
limit choices, sensible defaults) · Jakob's (familiar IDE/list patterns) ·
Proximity/Common-Region (cards group related controls) · Similarity (a chip/badge
means the same thing everywhere) · Goal-Gradient/Zeigarnik (progress bars,
streaks) · Peak-End (celebrate success, e.g. confetti on Accepted) · Fitts's
(large tap targets, primary action reachable) · Postel's (lenient inputs).
