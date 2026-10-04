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

Preview every one of these at **`/dev/states`** (dev builds only). If a state isn't
there, it isn't designed.

Wrap any data-bound view in **`<DataState>`** (`components/ui/DataState.tsx`). The
order is fixed: **loading → error → empty → content**. A failed request must never
render as "nothing here" — pages that did `.catch(() => {})` made a 403 look
identical to an empty list, which is how a permissions bug got reported as "class
creation is broken".

- **Loading** → a `<Skeleton>` shaped like the content, from `components/ui/Skeletons.tsx`
  (`ListSkeleton`, `CardGridSkeleton`, `StatRowSkeleton`, `TableSkeleton`, `TextSkeleton`,
  `SectionSkeleton`). Never a centered spinner for page/section loads.
- **Background refresh** → pass `fetching`; content stays, a thin progress line appears.
- **Empty** → `<EmptyState variant>` where variant says *why*: `firstUse` (invite an
  action), `filtered` (offer to clear), `unassigned` (nothing to offer). Each needs
  different words.
- **Failure** → `<ErrorState error onRetry />`. `classifyApiError()` sorts failures into
  offline / server / forbidden / notFound / timeout / unknown, each with its own icon and
  wording, and **Retry is only offered when retrying could help** (never on 403/404).
- **One section failed** → `<InlineError>`, so the rest of the page keeps working.
- **Stale after a failed refresh** → `<StaleBanner since>`. Never pass old numbers off as current.
- **Button-level** async → inline spinner only, keep the label ("Saving…").

## Layout & spacing

- Page shell: `AppShell` (student/faculty) or the full-screen IDE layout. Full-screen views (IDE, exam-taking) intentionally skip `AppShell`. `AppShell` already applies the page gutter and max width — don't wrap a page in another container.
- Every page starts with `<PageHeader title subtitle actions />` (except full-screen views).
- Group related content in `Card variant="outlined"` (border `outlineVariant`) or the local `SectionCard`.
- Spacing uses the MUI 8px scale via `sx` (`p: 2` = 16px). Prefer `Stack`/`Box` grid over manual margins. Non-multiples live in `layout` (`theme/tokens.ts`): `pageGutter`, `sectionGap`, `cardPadding`, `proseMaxWidth`, `contentMaxWidth`.
- One **contained** (filled) button per view = the primary action (Von Restorff); everything else `outlined`/`text`.

## Corner radius, type and colour — three enforced rules

ESLint (`no-restricted-syntax`) flags all three. They're warnings while existing
pages still contain them, and become errors after the S8 sweep; don't add new ones.

1. **Never put a bare number in `borderRadius` inside `sx`.** MUI multiplies it by
   `theme.shape.borderRadius` (12 here), so `borderRadius: 2` renders **24px**, not 8px.
   Use `radius.xs|sm|md|lg|xl|full|circle` from `theme/tokens.ts` — they're CSS strings,
   so what you write is what renders. (`styled()` and theme overrides use the numeric
   `shape` scale instead, where numbers *are* pixels.)
2. **Never hard-code `fontSize`.** Use a Typography variant; the M3 type scale is the
   source of truth.
3. **Never hard-code a colour.** Use palette roles or `var(--mui-palette-*)`. Raw hex
   belongs only in `theme/tokens.ts`, which is exempt.

## Shared primitives (reuse these)

`PageHeader`, `StatCard`, `SectionCard`, `InteractiveCard`, `SearchField`,
`SegmentedButtons`, `DifficultyChip`, `VerdictChip`, `RatingBadge`, `DataState`,
`EmptyState`/`ErrorState`/`InlineError`/`StaleBanner`, the `Skeletons` set,
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

A card whose whole surface is clickable uses **`<InteractiveCard href|onClick selected
disabled>`** — MUI's `Card` ships no hover style at all, which is why each page was
inventing its own. It renders a real `<a>` when given `href` and a real `<button>`
otherwise, so keyboard focus, Enter/Space and open-in-new-tab work without extra props,
and it carries the hover, focus-visible, pressed, selected and disabled states.

For any other clickable surface, spread `interactiveSurfaceSx` (from `components/ui/interactive.ts`) onto
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

## Analytics screens — one layering, every persona

Faculty, HOD, Admin, T&P and student analytics all use the shared kit in
`components/analytics/` (barrel: `@/components/analytics`). Never hand-roll tiles or chart cards.

Layer top-to-bottom, in this order:

1. `FilterBar` — period + optional group multi-select (controlled; page owns state).
2. `KpiRow` of `KpiTile`s — headline numbers, `value / total`, delta, sparkline. `invertDelta` for lower-is-better metrics. `InsightTile` for named takeaways (Strongest / Focus on).
3. `ChartRow` of `ChartCard`s — `StackedBars` (where is the problem: unit/topic) then `TrendLines` (direction over time). Every chart lives in a `ChartCard`, which owns title, one-line takeaway, and loading/empty/error states.
4. `Leaderboard`s — sortable horizontal bars, "most/least active X". Rows are clickable to drill down.
5. Drill-down — a dedicated page per entity (student, exam), reached from a leaderboard row or table action.

Rules: segment colours follow meaning (green solved, amber partial, grey untouched), not rank. Aggregate server-side. Always supply `emptyDescription` that says what will appear and why it is empty. Preview all pieces at `/dev/analytics-kit` (dev builds only).

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
