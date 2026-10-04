---
name: codementor-ui
description: CodeMentor's own UI rules — spacing, radius, states, interaction, copy. Load before writing or changing any frontend-next screen or component.
---

# CodeMentor UI rules

The binding rules for `frontend-next`. **These win over the vendored third-party
skills** (`material-ui-*`, `frontend-design`) wherever they disagree — those
describe MUI v9 and general design practice; this describes this product, on MUI
v6.5, Next.js 16, Material 3.

Longer prose lives in `frontend-next/DESIGN.md`. This file is the short, binding
version. Preview every state at **`/dev/states`** and the analytics kit at
**`/dev/analytics-kit`** (dev builds only).

## 1. Never do these

| Don't | Do | Why |
|---|---|---|
| `sx={{ borderRadius: 2 }}` | `sx={{ borderRadius: radius.sm }}` | A bare number is multiplied by the theme radius (12), so `2` renders **24px**, not 8px. This single mistake is why corners looked inconsistent across ~20 call sites. |
| `sx={{ fontSize: 18 }}` | `<Typography variant="subtitle1">` | Hard-coded sizes bypass the M3 type scale. 65 of them had drifted across 10–20px. |
| `color: "#4654B0"`, `rgba(...)` | `color: "primary.main"`, `var(--mui-palette-*)` | Raw colours don't switch with light/dark. Scheme-specific hex belongs only in `theme/tokens.ts`. |
| `.catch(() => {})` | Surface it through `DataState` / `InlineError` | A swallowed failure looks exactly like "no data". This is how a permissions bug got reported as "class creation is broken". |
| A centred `<CircularProgress>` for page load | A skeleton shaped like the content | A spinner says *something* is happening; a skeleton says *what* is coming and stops the page jumping. |
| Hand-rolled card hover | `<InteractiveCard>` | MUI's `Card` has no hover style, so every page invented its own. |
| `@mui/icons-material` | `@/components/ui/icons` | One module wraps Lucide so the icon set can be swapped in one place. |

The first three are enforced by ESLint (`no-restricted-syntax` in
`eslint.config.mjs`). They are **warnings** while old pages still contain them;
each phase clears the files it touches, and they flip to **errors** after the S8
sweep. Don't add new ones.

## 2. Tokens

From `@/theme/tokens`:

- **Spacing** — MUI's 8px scale (`p: 2` = 16px). 4px (`0.5`) only for icon/text gaps.
- **`radius`** — `xs` 4 · `sm` 8 · `md` 12 · `lg` 16 · `xl` 28 · `full` · `circle`. Strings, so what you write is what renders.
- **`layout`** — `pageGutter` (responsive), `sectionGap` (24px), `cardPadding` (20px), `cardPaddingCompact`, `proseMaxWidth` (680), `contentMaxWidth` (1400).
- **`touchTarget`** — 40px pointer, 48px touch.
- **Motion** — `hoverTransition()` 150ms, `pressTransition()` 100ms, fade 200ms. Nothing else.

`AppShell` already applies the page gutter and max width; don't re-wrap pages in
another container.

## 3. Every data view handles every state

Use `<DataState>`. Order is fixed and matters: **loading → error → empty → content.**
A failed request must never be presented as "nothing here".

```tsx
<DataState
  loading={q.isLoading}
  fetching={q.isFetching}
  error={q.isError ? q.error : undefined}
  empty={items.length === 0}
  onRetry={q.refetch}
  skeleton={<CardGridSkeleton />}
  emptyVariant="firstUse"
  emptyTitle="No courses yet"
  emptyDescription="Courses your faculty assigns appear here."
>
```

- **Errors classify themselves** (`classifyApiError`): offline · server · forbidden · notFound · timeout · unknown. Retry is offered **only** when retrying could help — never on a 403 or 404.
- **Empty has three kinds**, and they need different words: `firstUse` (invite an action), `filtered` (offer to clear), `unassigned` (no action to offer).
- **One section failed, page is fine** → `<InlineError>`, not a blank screen.
- **Refresh failed, old data on screen** → `<StaleBanner>`. Never pass stale numbers off as current.
- **Background refresh** → `fetching` draws a thin line; content stays put.

Skeletons: `ListSkeleton`, `CardGridSkeleton`, `StatRowSkeleton`, `TableSkeleton`,
`TextSkeleton`, `SectionSkeleton`.

## 4. Interaction

Every clickable surface shows: default · hover · **focus-visible** · pressed ·
selected · disabled.

- Whole-card clickable → `<InteractiveCard href|onClick selected disabled>`. Renders a real `<a>` or `<button>`, so keyboard and open-in-new-tab work.
- Other clickable surfaces → spread `interactiveSurfaceSx`.
- List and table rows get hover from theme overrides — don't hand-roll `action.hover`.
- Focus outline is themed globally. Never remove it.
- One **contained** button per view (the primary action); everything else outlined or text.

## 5. Writing

Words are design content, not decoration.

- Buttons say what happens: "Save changes", not "Submit". The same action keeps the same name through the whole flow.
- Errors explain what happened and what to do. They don't apologise and they're never vague.
- Empty screens invite an action.
- Sentence case. Plain verbs. No filler. Write for a student, not for the system: "problems you haven't solved yet", not "unresolved submission entities".
- Never show internals to students — stack traces, collection names, raw status codes.

## 6. Before calling a screen done

1. Golden path works in a browser.
2. Loading, empty and error all checked (stop the backend to see the real error).
3. Mobile width (375px) — no horizontal scroll.
4. Light **and** dark.
5. Tab through it: everything reachable, focus always visible.
6. `npx tsc --noEmit` and `npm run lint` clean of new problems.
7. Console clean — especially hydration mismatches. Anything locale- or
   time-formatted differs between server and browser; render it client-side or
   mark it `suppressHydrationWarning`.

## 7. Where things live

- Primitives: `src/components/ui/` — `PageHeader`, `SectionCard`, `InteractiveCard`, `DataState`, `States`, `Skeletons`, `StatCard`, `icons`.
- Analytics kit: `src/components/analytics/` — KPI tiles → charts → leaderboards → drill-down. Never hand-roll a tile or chart card.
- Theme: `src/theme/` — the only place raw colour and size values may appear.
- Data: TanStack React Query (`src/lib/queries/`). New screens use it, not `useEffect` + axios.
