"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { HistoryOutlinedIcon, AssignmentOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { VerdictChip } from "@/components/ui/VerdictChip";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { languageName } from "@/lib/languages";

interface SubmissionRow {
  id: string;
  verdict: string;
  language: string;
  runtime: number | null;
  memory: number | null;
  submitted_at: string;
  problem_title: string;
  problem_id: string;
  assignment_id: string | null;
  assignment_title: string | null;
}

// Scope decides which submissions are shown. Default = graded (assignment/exam work
// only) so the list isn't flooded with every practice run.
const SCOPES = [
  { value: "graded", label: "Assignments & Exams" },
  { value: "practice", label: "Practice" },
  { value: "all", label: "All" },
] as const;
type Scope = (typeof SCOPES)[number]["value"];

const FILTERS = ["all", "accepted", "failed"] as const;
type Filter = (typeof FILTERS)[number];

function whenLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Submission history table — rendered inside the Profile "Submissions" tab. */
export function ProfileSubmissions() {
  const [subs, setSubs] = React.useState<SubmissionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [scope, setScope] = React.useState<Scope>("graded");
  const [filter, setFilter] = React.useState<Filter>("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ success: boolean; data: SubmissionRow[] }>(
        `/api/submissions?scope=${scope}`,
      );
      if (res.data?.success) setSubs(res.data.data ?? []);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = subs.filter((s) =>
    filter === "all"
      ? true
      : filter === "accepted"
        ? s.verdict === "Accepted"
        : s.verdict !== "Accepted",
  );

  if (error) {
    return (
      <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
        <ErrorState
          title="Couldn't load your submissions"
          description="Check your connection and try again."
          onRetry={load}
        />
      </Card>
    );
  }

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2.5 }} flexWrap="wrap" useFlexGap>
        <SegmentedButtons<Scope>
          value={scope}
          onChange={setScope}
          segments={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
          ariaLabel="Filter submissions by type"
        />
        <SegmentedButtons<Filter>
          value={filter}
          onChange={setFilter}
          segments={FILTERS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))}
          ariaLabel="Filter submissions by verdict"
        />
      </Stack>

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table aria-label="Submission history" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow
                sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}
              >
                <TableCell>Problem</TableCell>
                <TableCell sx={{ width: 180 }}>Verdict</TableCell>
                <TableCell sx={{ width: 120 }}>Language</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>Runtime</TableCell>
                <TableCell align="right" sx={{ width: 150 }}>When</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton width="60%" /></TableCell>
                    <TableCell><Skeleton width={96} height={28} /></TableCell>
                    <TableCell><Skeleton width={56} /></TableCell>
                    <TableCell align="right"><Skeleton width={48} sx={{ ml: "auto" }} /></TableCell>
                    <TableCell align="right"><Skeleton width={80} sx={{ ml: "auto" }} /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ border: 0 }}>
                    <EmptyState
                      icon={<HistoryOutlinedIcon />}
                      title={
                        scope === "graded"
                          ? "No assignment or exam submissions yet"
                          : filter === "all"
                            ? "No submissions yet"
                            : `No ${filter} submissions`
                      }
                      description={
                        scope === "graded"
                          ? "Submissions you make during an assignment or exam will show up here."
                          : "Solve a problem and your attempts will show up here."
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}
                  >
                    <TableCell>
                      <Link
                        component={NextLink}
                        href={`/app/problems/${s.problem_id}`}
                        color="text.primary"
                        sx={{ fontWeight: 500, "&:hover": { color: "primary.main" } }}
                      >
                        {s.problem_title}
                      </Link>
                      {s.assignment_title && (
                        <Chip
                          icon={<AssignmentOutlinedIcon />}
                          label={s.assignment_title}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.5, height: 22, fontSize: 11, maxWidth: 240, borderColor: "outlineVariant", color: "text.secondary", "& .MuiChip-icon": { fontSize: 13 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <VerdictChip verdict={s.verdict} />
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                      {languageName(s.language)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: "text.secondary", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                      {s.runtime != null ? `${s.runtime} ms` : "—"}
                    </TableCell>
                    <TableCell align="right" sx={{ color: "text.secondary", fontSize: 13 }}>
                      {whenLabel(s.submitted_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
