"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Chip from "@mui/material/Chip";
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
import api from "@/lib/api";
import type { Problem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";

const DIFFICULTY_FILTERS = ["All", "Easy", "Medium", "Hard"] as const;
type DifficultyFilter = (typeof DIFFICULTY_FILTERS)[number];
const PER_PAGE = 50;

const pidOf = (p: Problem) =>
  String((p as { _id?: string })._id || p.id || "");

function ProblemsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [problems, setProblems] = React.useState<Problem[]>([]);
  const [solved, setSolved] = React.useState<string[]>([]);
  const [searchTerm, setSearchTerm] = React.useState(
    () => searchParams.get("search") || searchParams.get("tag") || "",
  );
  const [difficulty, setDifficulty] = React.useState<DifficultyFilter>(() => {
    const d = searchParams.get("difficulty");
    return (
      DIFFICULTY_FILTERS.find((f) => f.toLowerCase() === d?.toLowerCase()) || "All"
    );
  });
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page, limit: PER_PAGE };
        if (searchTerm) params.search = searchTerm;
        if (difficulty !== "All") params.difficulty = difficulty;

        const [probRes, solvedRes] = await Promise.allSettled([
          api.get("/api/problems", { params }),
          api.get("/api/student/solved-problems"),
        ]);

        if (probRes.status === "fulfilled") {
          const resData = probRes.value.data.data || probRes.value.data;
          if (Array.isArray(resData)) {
            setProblems(resData);
            setTotal(resData.length);
          } else if (resData.problems?.length >= 0) {
            setProblems(resData.problems);
            setTotal(resData.total ?? resData.problems.length);
          }
        }
        if (solvedRes.status === "fulfilled" && solvedRes.value.data?.success) {
          setSolved(solvedRes.value.data.data ?? []);
        }
      } catch (err) {
        console.error("Failed to load problems", err);
      } finally {
        setLoading(false);
      }
    };
    const timeout = setTimeout(fetchData, 300);
    return () => clearTimeout(timeout);
  }, [searchTerm, difficulty, page]);

  const countBy = (d: string) =>
    problems.filter((p) => p.difficulty?.toLowerCase() === d).length;
  const solvedPct = total > 0 ? Math.round((solved.length / total) * 100) : 0;
  const hasActiveFilters = difficulty !== "All" || searchTerm !== "";

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
            value={searchTerm}
            onChange={(v) => {
              setSearchTerm(v);
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
                setSearchTerm("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Card>

      {/* Table */}
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
                              setSearchTerm("");
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
                  const isSolved = solved.includes(pid);
                  return (
                    <TableRow
                      key={pid}
                      hover
                      sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}
                    >
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
                              <Chip
                                key={tag}
                                label={tag}
                                size="small"
                                variant="outlined"
                                sx={{ height: 22, fontSize: 11, borderColor: "outlineVariant", color: "text.secondary" }}
                              />
                            ))}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell>
                        <DifficultyChip difficulty={problem.difficulty} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

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
