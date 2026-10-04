"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useSolvedHistoryQuery } from "@/lib/queries/student";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { SearchField } from "@/components/ui/SearchField";
import { languageName } from "@/lib/languages";
import { layout } from "@/theme/tokens";

/**
 * The problems this student has solved — rendered inside the Profile tab.
 *
 * This used to be a submission log with Accepted/Failed filters. A student's own
 * record is the work they finished; their unsolved attempts live in the Mistakes
 * notebook, where there is something to do about them. Faculty still see every
 * attempt in their own views.
 */

function whenLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProfileSubmissions() {
  const { data, isLoading, isError, error, isFetching, refetch } = useSolvedHistoryQuery();
  const [search, setSearch] = React.useState("");

  const solved = data ?? [];
  const term = search.trim().toLowerCase();
  const visible = term
    ? solved.filter(
        (s) =>
          s.problem_title.toLowerCase().includes(term) ||
          s.tags.some((t) => t.toLowerCase().includes(term)),
      )
    : solved;

  return (
    <Box>
      {solved.length > 0 && (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            {solved.length} problem{solved.length === 1 ? "" : "s"} solved
          </Typography>
          <SearchField value={search} onChange={setSearch} placeholder="Search by title or topic" />
        </Stack>
      )}

      <DataState
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={isError ? error : undefined}
        empty={solved.length === 0}
        onRetry={() => refetch()}
        skeleton={
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
            <TableSkeleton rows={6} columns={4} />
          </Card>
        }
        emptyVariant="firstUse"
        emptyTitle="No problems solved yet"
        emptyDescription="Every problem you solve is recorded here."
        emptyAction={
          <Button component={NextLink} href="/app/problems" variant="contained">
            Find a problem
          </Button>
        }
      >
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table aria-label="Problems solved" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                  <TableCell>Problem</TableCell>
                  <TableCell sx={{ width: 120 }}>Difficulty</TableCell>
                  <TableCell sx={{ width: 120 }}>Language</TableCell>
                  <TableCell align="right" sx={{ width: 110 }}>Runtime</TableCell>
                  <TableCell align="right" sx={{ width: 140 }}>Solved</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ border: 0 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                        No solved problems match “{search}”.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((s) => (
                    <TableRow
                      key={s.submission_id}
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
                      </TableCell>
                      <TableCell>{s.difficulty && <DifficultyChip difficulty={s.difficulty} />}</TableCell>
                      <TableCell sx={{ color: "text.secondary", fontFamily: "ui-monospace, monospace" }}>
                        <Typography variant="caption">{languageName(s.language)}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary", fontFamily: "ui-monospace, monospace" }}>
                        <Typography variant="caption">{s.runtime != null ? `${s.runtime} ms` : "—"}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary" }}>
                        <Typography variant="caption">{whenLabel(s.solved_at)}</Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </DataState>
    </Box>
  );
}
