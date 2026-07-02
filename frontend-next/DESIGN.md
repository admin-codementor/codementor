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

`PageHeader`, `StatCard`, `SearchField`, `SegmentedButtons`, `DifficultyChip`,
`VerdictChip`, `RatingBadge`, `EmptyState`/`ErrorState`, `AITutorSidebar`,
`ToastProvider`/`useToast`, `ConfirmProvider`/`useConfirm`, `lib/languages`
(`languageName`).

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
