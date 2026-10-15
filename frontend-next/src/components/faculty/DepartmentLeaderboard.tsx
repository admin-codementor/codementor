"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { ExportButton, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import { MEDAL } from "./DepartmentTables";

interface BoardRow {
  department: string; students: number; solved_total: number; solved_per_student: number;
  active_pct: number; needs_attention_pct: number; you: boolean; rank?: number;
}
interface Board { ranked: BoardRow[]; unranked: BoardRow[]; your_department: string | null }

const headRow = { "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } };

/** Every department side by side. Aggregates only: other departments' students are never shown. */
export function DepartmentLeaderboard() {
  const query = useQuery<Board>({
    queryKey: ["faculty", "department-leaderboard"],
    queryFn: async () => (await api.get("/api/faculty/department-leaderboard")).data.data,
    staleTime: 60_000,
  });
  const d = query.data;

  if (query.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
        {apiErrorMessage(query.error, "Couldn't load the department leaderboard.")}
      </Alert>
    );
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={260} />;

  const csv = () => toCsv([...d.ranked, ...d.unranked].map((r) => ({
    rank: r.rank ?? "", department: r.department, students: r.students,
    solved_per_student: r.solved_per_student, active_last_7_days_pct: r.active_pct, needs_attention_pct: r.needs_attention_pct,
  })));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Departments ranked by problems solved per student, then by how many were active in the last 7 days.
          Only totals are shown — you cannot see another department&apos;s students.
        </Typography>
        <ExportButton filename="department-leaderboard.csv" csv={csv} disabled={d.ranked.length + d.unranked.length === 0} />
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {d.ranked.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="Not enough data to rank departments" description="A department needs at least 3 students to be ranked." />
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Department leaderboard" sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow sx={headRow}>
                  <TableCell>Rank</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell align="right">Students</TableCell>
                  <TableCell align="right">Solved per student</TableCell>
                  <TableCell align="right">Active (7 days)</TableCell>
                  <TableCell align="right">Needs attention</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.ranked.map((r) => {
                  const medal = r.rank ? MEDAL[r.rank] : undefined;
                  return (
                    <TableRow
                      key={r.department}
                      sx={{ bgcolor: r.you ? "primaryContainer" : undefined, "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}
                    >
                      <TableCell sx={{ width: 72 }}>
                        <Chip
                          label={r.rank} size="small"
                          sx={{ minWidth: 28, height: 22, fontWeight: 700, bgcolor: medal?.bg ?? "surfaceContainerHigh", color: medal?.fg ?? "text.secondary" }}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={r.you ? 700 : 500}>{r.department}</Typography>
                          {r.you && <Chip size="small" color="primary" label="You" sx={{ height: 20 }} />}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{r.students}</TableCell>
                      <TableCell align="right">{r.solved_per_student}</TableCell>
                      <TableCell align="right">{r.active_pct}%</TableCell>
                      <TableCell align="right">{r.needs_attention_pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      {d.unranked.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Not ranked (fewer than 3 students, or no department set):{" "}
          {d.unranked.map((r) => `${r.department === "UNASSIGNED" ? "No department" : r.department} (${r.students})`).join(", ")}
          {d.unranked.some((r) => r.you) ? " — including yours" : ""}.
        </Typography>
      )}
    </Box>
  );
}
