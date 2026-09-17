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
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { visuallyHidden } from "@mui/utils";
import { CasinoOutlinedIcon, CheckCircleIcon, RadioButtonUncheckedIcon, ChevronLeftIcon, ChevronRightIcon, CodeOffOutlinedIcon, SignalLowIcon, SignalMediumIcon, SignalHighIcon } from "@/components/ui/icons";
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

const DIFFICULTY_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;
type DifficultyFilter = (typeof DIFFICULTY_FILTERS)[number];
const PER_PAGE = 50;

const pidOf = (p: Problem) =>
  String((p as { _id?: string })._id || p.id || "");

/** Memoized so clicking a difficulty filter (which re-renders the whole page
 * while the fetch is still pending) doesn't force all ~50 rows to re-render —
 * only rows whose own props actually changed do. */
const ProblemRow = React.memo(function ProblemRow({
  problem,
  isSolved,
}: {
  problem: Problem;
  isSolved: boolean;
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
    </TableRow>
  );
});

function ProblemsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = React.useState(
    () => searchParams.get("search") || searchParams.get("tag") || "",
  );
  const [difficulty, setDifficulty] = React.useState<DifficultyFilter>(() => {
    const d = searchParams.get("difficulty");
    return (
      DIFFICULTY_FILTERS.find((f) => f.toLowerCase() === d?.toLowerCase()) || "All"
    );
  });
  const [page, setPage] = React.useState(1);
  // Debounce only what goes into the query key — typing updates the field
  // instantly, the request follows 300ms after typing stops.
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const problemsQuery = useProblemsQuery({ page, difficulty, search: debouncedSearch });
  const solvedQuery = useSolvedProblemsQuery();

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
  const hasActiveFilters = difficulty !== "All" || searchInput !== "";

  const pickRandom = () => {
    if (problems.length === 0) return;
    const rnd = problems[Math.floor(Math.random() * problems.length)];
    router.push(`/app/problems/${pidOf(rnd)}`);
  };

  return (
    <Box>
      <PageHeader
        title="Problem Set"
        subtitle={`${solved.length} of ${total} solved`}
        actions={
          <Button variant="contained" startIcon={<CasinoOutlinedIcon />} onClick={pickRandom} disabled={problems.length === 0}>
            Pick Random
          </Button>
        }
      />

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
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Card>

      {/* Table */}
      <Reveal>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table aria-label="Problem list" sx={{ minWidth: 560 }}>
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                <TableCell sx={{ width: 72 }}>Status</TableCell>
                <TableCell>Title</TableCell>
                <TableCell sx={{ width: 140 }}>Difficulty</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton variant="circular" width={20} height={20} /></TableCell>
                    <TableCell><Skeleton width="60%" /></TableCell>
                    <TableCell><Skeleton width={64} height={28} /></TableCell>
                  </TableRow>
                ))
              ) : problems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} sx={{ border: 0 }}>
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
                  return <ProblemRow key={pid} problem={problem} isSolved={solved.includes(pid)} />;
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
              borderRadius: 9999,
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
