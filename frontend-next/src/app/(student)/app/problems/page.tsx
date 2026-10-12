"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { visuallyHidden } from "@mui/utils";
import {
  CasinoOutlinedIcon,
  CheckCircleIcon,
  RadioButtonUncheckedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeOffOutlinedIcon,
  SignalLowIcon,
  SignalMediumIcon,
  SignalHighIcon,
  TrackChangesOutlinedIcon,
  CloseIcon,
} from "@/components/ui/icons";
import type { Problem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { TagChip } from "@/components/ui/TagChip";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { Reveal } from "@/components/ui/motion";
import { useProblemsQuery, useSolvedProblemsQuery } from "@/lib/queries/problems";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { ProblemOfTheDay } from "@/components/student/ProblemOfTheDay";
import { useSkillsQuery, useSolvedHistoryQuery, useMistakesQuery, genuineWeaknesses } from "@/lib/queries/student";
import { radius } from "@/theme/tokens";
import Chip from "@mui/material/Chip";

const DIFFICULTY_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;
type DifficultyFilter = (typeof DIFFICULTY_FILTERS)[number];
const PER_PAGE = 50;

// Difficulty words sometimes leak into a problem's tags array (an import-time
// data quirk, not a real topic) — same exclusion as the public profile's
// "strongest topics" list, so "easy (28)" never shows up as a clickable topic.
const NOT_A_TOPIC = new Set(["easy", "medium", "hard", "beginner", "intermediate", "advanced"]);

const pidOf = (p: Problem) =>
  String((p as { _id?: string })._id || p.id || "");

/** "today" / "yesterday" / "N days ago" — same convention as Mistakes. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Activity {
  label: "Solved" | "Attempted";
  at: string;
}

/** Memoized so clicking a difficulty filter (which re-renders the whole page
 * while the fetch is still pending) doesn't force all ~50 rows to re-render —
 * only rows whose own props actually changed do. */
const ProblemRow = React.memo(function ProblemRow({
  problem,
  isSolved,
  activity,
}: {
  problem: Problem;
  isSolved: boolean;
  activity?: Activity;
}) {
  const pid = pidOf(problem);
  return (
    <TableRow hover sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
      <TableCell>
        {isSolved ? (
          <Tooltip title="Solved">
            <CheckCircleIcon fontSize="small" sx={{ color: "success.main" }} />
          </Tooltip>
        ) : (
          <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "outline" }} />
        )}
        <Box component="span" sx={visuallyHidden}>
          {isSolved ? "Solved" : "Not solved"}
        </Box>
      </TableCell>
      <TableCell>
        <Link
          component={NextLink}
          href={`/app/problems/${pid}`}
          color="text.primary"
          sx={{ fontWeight: 500, "&:hover": { color: "primary.main" } }}
        >
          {problem.title}
        </Link>
        {problem.tags && problem.tags.length > 0 && (
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.75 }}>
            {problem.tags.slice(0, 3).map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </Stack>
        )}
      </TableCell>
      <TableCell>
        <DifficultyChip difficulty={problem.difficulty} />
      </TableCell>
      <TableCell sx={{ color: activity?.label === "Solved" ? "success.main" : "text.secondary" }}>
        {activity ? `${activity.label} ${timeAgo(activity.at)}` : "—"}
      </TableCell>
    </TableRow>
  );
});

function ProblemsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The link that sent a student here, when one did (S12) — a roadmap
  // milestone or a Job-Ready next action, both of which already explain
  // themselves at the point they link from. Read once; this page doesn't
  // re-derive it if the query string changes under a client-side nav, same as
  // every other filter below.
  const [landing] = React.useState(() => ({
    source: searchParams.get("source"),
    from: searchParams.get("from"),
    roadmapId: searchParams.get("rid"),
  }));
  const [bannerDismissed, setBannerDismissed] = React.useState(false);

  const [searchInput, setSearchInput] = React.useState(() => searchParams.get("search") || "");
  const [difficulty, setDifficulty] = React.useState<DifficultyFilter>(() => {
    const d = searchParams.get("difficulty");
    return (
      DIFFICULTY_FILTERS.find((f) => f.toLowerCase() === d?.toLowerCase()) || "All"
    );
  });
  const [page, setPage] = React.useState(1);
  // Was always `null` here regardless of the URL — a `?tag=` arrival (every
  // roadmap milestone and Job-Ready action builds one) fell through to the
  // `searchInput` fallback below instead and ran as a *title text search* for
  // the tag, not an actual tag filter. Reading it here is what makes those
  // links filter by the right thing.
  const [tag, setTag] = React.useState<string | null>(() => searchParams.get("tag") || null);
  // Debounce only what goes into the query key — typing updates the field
  // instantly, the request follows 300ms after typing stops.
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const problemsQuery = useProblemsQuery({ page, difficulty, search: debouncedSearch, tag: tag ?? undefined });
  // Unfiltered list (shared cache with Problem of the Day) so the topic chips
  // stay put while a topic filter is active.
  const allProblemsQuery = useProblemsQuery({ page: 1 });
  const solvedQuery = useSolvedProblemsQuery();
  // Drives the weak-topic chip sort and the weakest-topic shortcut (S12).
  // Gates on 3+ attempts per topic server-side, so a brand-new student simply
  // gets none back — handled below by falling back to frequency order.
  const skillsQuery = useSkillsQuery();
  // Personal "last activity" per problem, replacing the old platform-wide
  // Accuracy/Solved-by columns, which said nothing about this student.
  const solvedHistoryQuery = useSolvedHistoryQuery();
  const mistakesQuery = useMistakesQuery();

  React.useEffect(() => {
    if (problemsQuery.error) console.error("Failed to load problems", problemsQuery.error);
  }, [problemsQuery.error]);

  const problems = problemsQuery.data?.problems ?? [];
  const total = problemsQuery.data?.total ?? 0;
  const solved = solvedQuery.data ?? [];
  // True skeleton only on the very first load for this query key (no cached/
  // placeholder data yet) — filter changes keep showing the previous rows via
  // `placeholderData: keepPreviousData` instead of flashing back to a skeleton.
  const loading = problemsQuery.isLoading;

  const countBy = (d: string) =>
    problems.filter((p) => p.difficulty?.toLowerCase() === d).length;
  const solvedPct = total > 0 ? Math.round((solved.length / total) * 100) : 0;
  const hasActiveFilters = difficulty !== "All" || searchInput !== "" || tag !== null;

  const activityByProblem = React.useMemo(() => {
    const map = new Map<string, Activity>();
    // Attempted-not-solved first, solved second: a problem can't be both, but
    // if the two ever disagree "Solved" is the one worth showing.
    for (const m of mistakesQuery.data ?? []) {
      map.set(String(m.problem_id), { label: "Attempted", at: m.last_attempt_at });
    }
    for (const s of solvedHistoryQuery.data ?? []) {
      map.set(String(s.problem_id), { label: "Solved", at: s.solved_at });
    }
    return map;
  }, [mistakesQuery.data, solvedHistoryQuery.data]);

  // Same exclusion as the chip list below: a weakness computed from a
  // difficulty tag that leaked into the catalogue is noise, not something to
  // act on.
  const realWeaknesses = React.useMemo(
    () => genuineWeaknesses(skillsQuery.data?.weaknesses ?? []),
    [skillsQuery.data],
  );
  const weaknessByTopic = React.useMemo(() => {
    const map = new Map<string, { acRate: number; solvedCount: number; attempts: number }>();
    for (const w of realWeaknesses) map.set(w.topic, w);
    return map;
  }, [realWeaknesses]);

  // Same chip list as before, just reordered: weakest topic first (by
  // accept-rate), then everything else by catalogue frequency as it always
  // was. A student with no attempt history yet (too new for the 3-attempt
  // gate) sees exactly the old frequency-sorted list — nothing regresses.
  const topicEntries = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allProblemsQuery.data?.problems ?? []) for (const t of p.tags ?? []) {
      if (NOT_A_TOPIC.has(t.toLowerCase())) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([t, n]) => ({ tag: t, count: n, weak: weaknessByTopic.get(t) ?? null }))
      .sort((a, b) => {
        if (a.weak && b.weak) return a.weak.acRate - b.weak.acRate;
        if (a.weak) return -1;
        if (b.weak) return 1;
        return b.count - a.count || a.tag.localeCompare(b.tag);
      })
      .slice(0, 12);
  }, [allProblemsQuery.data, weaknessByTopic]);

  const weakestTopic = realWeaknesses[0] ?? null;
  // Only fetched when it would actually drive the button below — no point
  // spending a request on a topic the student can't act on from here (a
  // filter is already narrowing the list to something else).
  const weakestTopicQuery = useProblemsQuery({
    page: 1,
    tag: weakestTopic?.topic,
    enabled: !!weakestTopic && !hasActiveFilters,
  });
  const showWeakestAction = !hasActiveFilters && !!weakestTopic;

  const pickRandom = () => {
    if (problems.length === 0) return;
    const rnd = problems[Math.floor(Math.random() * problems.length)];
    router.push(`/app/problems/${pidOf(rnd)}`);
  };

  const solveWeakest = () => {
    const pool = weakestTopicQuery.data?.problems ?? [];
    if (pool.length === 0) return;
    const rnd = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/app/problems/${pidOf(rnd)}`);
  };

  const tagLabel = tag ? tag.replace(/[-_]/g, " ") : "";
  const showBanner =
    !bannerDismissed && !!tag && !!landing.from && (landing.source === "roadmap" || landing.source === "jobready");

  return (
    <Box>
      <PageHeader
        title="Practice"
        subtitle={`${solved.length} of ${total} solved`}
        actions={
          showWeakestAction ? (
            <Button
              variant="contained"
              startIcon={<TrackChangesOutlinedIcon />}
              onClick={solveWeakest}
              disabled={weakestTopicQuery.isLoading || (weakestTopicQuery.data?.problems.length ?? 0) === 0}
            >
              Solve weakest topic
            </Button>
          ) : (
            <Button variant="contained" startIcon={<CasinoOutlinedIcon />} onClick={pickRandom} disabled={problems.length === 0}>
              Pick Random
            </Button>
          )
        }
      />

      {showBanner && (
        <Alert
          severity="info"
          sx={{ mb: 3, borderRadius: radius.sm }}
          action={
            <IconButton size="small" aria-label="Dismiss" onClick={() => setBannerDismissed(true)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        >
          <Typography variant="body2" sx={{ textTransform: "capitalize", display: "inline" }}>
            Practicing {tagLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary" component="span">
            {landing.source === "roadmap"
              ? ` — solve these to advance your ${landing.from} roadmap.`
              : ` — counts toward your ${landing.from} Job-Ready Score.`}
          </Typography>
          {landing.source === "roadmap" && landing.roadmapId && (
            <Link component={NextLink} href={`/app/roadmaps/${landing.roadmapId}`} sx={{ ml: 1 }}>
              Back to roadmap
            </Link>
          )}
          {landing.source === "jobready" && (
            <Link component={NextLink} href="/app/placement" sx={{ ml: 1 }}>
              View your score
            </Link>
          )}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <ProblemOfTheDay />
      </Box>

      {/* Progress */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          icon={<CheckCircleIcon />}
          label="Total Solved"
          value={solved.length}
          helper={`${solvedPct}% complete`}
          accent="primary"
          loading={loading && total === 0}
        />
        {([
          { label: "Easy", icon: <SignalLowIcon />, accent: "success", count: countBy("easy") },
          { label: "Medium", icon: <SignalMediumIcon />, accent: "warning", count: countBy("medium") },
          { label: "Hard", icon: <SignalHighIcon />, accent: "error", count: countBy("hard") },
        ] as const).map((d) => {
          const active = difficulty === d.label;
          return (
            <StatCard
              key={d.label}
              icon={d.icon}
              label={d.label}
              value={d.count}
              helper={`of ${total}`}
              accent={d.accent}
              selected={active}
              ariaLabel={`Filter by ${d.label}`}
              onClick={() => {
                setDifficulty(active ? "All" : d.label);
                setPage(1);
              }}
            />
          );
        })}
      </Box>

      {/* Filters */}
      <Card variant="outlined" sx={{ p: 1.5, mb: 3, borderColor: "outlineVariant" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          flexWrap="wrap"
        >
          <SearchField
            value={searchInput}
            onChange={(v) => {
              setSearchInput(v);
              setPage(1);
            }}
            placeholder="Search problems…"
            label="Search problems"
            sx={{ flex: 1, minWidth: 200, maxWidth: { sm: 360 } }}
          />
          <SegmentedButtons<DifficultyFilter>
            value={difficulty}
            onChange={(v) => {
              setDifficulty(v);
              setPage(1);
            }}
            segments={DIFFICULTY_FILTERS.map((d) => ({ value: d, label: d }))}
            ariaLabel="Filter by difficulty"
          />
          {hasActiveFilters && (
            <Button
              variant="text"
              onClick={() => {
                setDifficulty("All");
                setSearchInput("");
                setTag(null);
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Card>

      {topicEntries.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 3 }} role="group" aria-label="Filter by topic">
          {topicEntries.map(({ tag: t, count, weak }) => (
            <Chip
              key={t}
              label={weak ? `${t.replace(/[-_]/g, " ")} · ${weak.acRate}%` : `${t.replace(/[-_]/g, " ")} (${count})`}
              clickable
              color={tag === t ? "primary" : weak ? "warning" : "default"}
              variant={tag === t ? "filled" : "outlined"}
              onClick={() => { setTag(tag === t ? null : t); setPage(1); }}
              sx={{ textTransform: "capitalize" }}
            />
          ))}
        </Stack>
      )}

      {/* Table */}
      <Reveal>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table aria-label="Problem list" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                <TableCell sx={{ width: 72 }}>Status</TableCell>
                <TableCell>Title</TableCell>
                <TableCell sx={{ width: 140 }}>Difficulty</TableCell>
                <TableCell sx={{ width: 140 }}>Last activity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="circular" width={20} height={20} /></TableCell>
                    <TableCell><Skeleton width="60%" /></TableCell>
                    <TableCell><Skeleton width={64} height={28} /></TableCell>
                    <TableCell><Skeleton width={72} /></TableCell>
                  </TableRow>
                ))
              ) : problems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ border: 0 }}>
                    <EmptyState
                      icon={<CodeOffOutlinedIcon />}
                      title="No problems match your filters"
                      description="Try a different search term or difficulty."
                      action={
                        hasActiveFilters ? (
                          <Button
                            variant="outlined"
                            onClick={() => {
                              setDifficulty("All");
                              setSearchInput("");
                              setTag(null);
                              setPage(1);
                            }}
                          >
                            Clear filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                problems.map((problem) => {
                  const pid = pidOf(problem);
                  return (
                    <ProblemRow
                      key={pid}
                      problem={problem}
                      isSolved={solved.includes(pid)}
                      activity={activityByProblem.get(pid)}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      </Reveal>

      {/* Pagination */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Showing {problems.length} of {total} problems
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton
            aria-label="Previous page"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Box
            aria-current="page"
            sx={{
              minWidth: 36,
              height: 36,
              px: 1,
              borderRadius: radius.full,
              display: "grid",
              placeItems: "center",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              fontWeight: 600,
            }}
          >
            {page}
          </Box>
          <IconButton
            aria-label="Next page"
            disabled={problems.length < PER_PAGE}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  );
}

export default function ProblemsPage() {
  return (
    <React.Suspense fallback={null}>
      <ProblemsInner />
    </React.Suspense>
  );
}
