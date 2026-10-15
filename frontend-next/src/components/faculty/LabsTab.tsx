"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
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
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, InboxIcon, TrackChangesOutlinedIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";
import { headRow } from "./DepartmentTables";

interface Work {
  id: string; title: string; problems: number; deadline: string | null; status: "open" | "closed"; exam: boolean;
  students: number; attempted: number; completed: number; avg_pct: number;
}
interface LabClass {
  id: string; name: string; section: string | null; instructor: string | null; students: number;
  assignments: Work[]; open_assignments: number; avg_completion: number | null;
}
interface Labs {
  totals: { classes: number; students_in_classes: number; students_not_in_any_class: number; assignments: number; open_assignments: number; avg_completion: number | null };
  classes: LabClass[];
  everyone: Work[];
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

function WorkTable({ rows, label }: { rows: Work[]; label: string }) {
  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" aria-label={label} sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow sx={headRow}>
            <TableCell>Assignment</TableCell><TableCell>Deadline</TableCell>
            <TableCell align="right">Problems</TableCell><TableCell align="right">Attempted</TableCell><TableCell align="right">Completed</TableCell>
            <TableCell sx={{ width: 180 }}>Average solved</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" fontWeight={500}>{a.title}</Typography>
                  {a.exam && <Chip size="small" label="Exam" sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize }} />}
                </Stack>
              </TableCell>
              <TableCell>
                {fmtDate(a.deadline)}{" "}
                <Chip
                  size="small" label={a.status === "open" ? "Open" : "Closed"}
                  sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize, bgcolor: a.status === "open" ? "successContainer" : "surfaceContainerHighest", color: a.status === "open" ? "onSuccessContainer" : "text.secondary" }}
                />
              </TableCell>
              <TableCell align="right">{a.problems}</TableCell>
              <TableCell align="right">{a.attempted} / {a.students}</TableCell>
              <TableCell align="right">{a.completed} / {a.students}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <LinearProgress variant="determinate" value={a.avg_pct} aria-label={`${a.title} average solved`} sx={{ flex: 1, height: 6, borderRadius: radius.xs }} />
                  <Typography variant="caption" sx={{ minWidth: 32, textAlign: "right" }}>{a.avg_pct}%</Typography>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** The department's classes and the assignments set for them. Read-only. */
export function LabsTab() {
  const query = useQuery<Labs>({
    queryKey: ["faculty", "labs"],
    queryFn: async () => (await api.get("/api/faculty/labs")).data.data,
    staleTime: 60_000,
  });
  const d = query.data;

  if (query.isError) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>{apiErrorMessage(query.error, "Could not load labs.")}</Alert>;
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={300} />;

  const csv = () => toCsv([
    ...d.classes.flatMap((c) => c.assignments.map((a) => ({ class: c.name, section: c.section ?? "", instructor: c.instructor ?? "", assignment: a.title, deadline: a.deadline ?? "", status: a.status, students: a.students, attempted: a.attempted, completed: a.completed, average_solved_pct: a.avg_pct }))),
    ...d.everyone.map((a) => ({ class: "(everyone)", section: "", instructor: "", assignment: a.title, deadline: a.deadline ?? "", status: a.status, students: a.students, attempted: a.attempted, completed: a.completed, average_solved_pct: a.avg_pct })),
  ]);

  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Every class in your department and the assignments set for it. Solved counts any accepted answer, including after the deadline. Classes and assignments are managed by their teachers.
        </Typography>
        <ExportButton filename="labs.csv" csv={csv} disabled={d.classes.length === 0 && d.everyone.length === 0} />
      </Stack>

      <KpiRow min={170}>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Classes" value={d.totals.classes} />
        <KpiTile icon={<TrackChangesOutlinedIcon />} accent="tertiary" label="Assignments" value={d.totals.assignments} help="Assignments set for a specific class" />
        <KpiTile icon={<InboxIcon />} accent="secondary" label="Open now" value={d.totals.open_assignments} />
        <KpiTile icon={<CheckCircleOutlineIcon />} accent="success" label="Average solved" value={d.totals.avg_completion == null ? "—" : `${d.totals.avg_completion}%`} help="Mean over classes that have assignments and students" />
      </KpiRow>

      {d.totals.students_not_in_any_class > 0 && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          {d.totals.students_not_in_any_class} active student(s) are not in any class yet, so no class assignment reaches them.
        </Alert>
      )}

      {d.classes.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<GroupsOutlinedIcon />} title="No classes yet" description="Classes appear here once a teacher in your department creates one and students join with its code." />
        </Card>
      ) : (
        <Stack spacing={2}>
          {d.classes.map((c) => (
            <Card key={c.id} variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" alignItems={{ sm: "center" }} sx={{ p: 2 }}>
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>{c.name}{c.section ? ` · Section ${c.section}` : ""}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {c.instructor ? `${c.instructor} · ` : ""}{c.students} student{c.students === 1 ? "" : "s"} · {c.assignments.length} assignment{c.assignments.length === 1 ? "" : "s"}{c.open_assignments ? ` (${c.open_assignments} open)` : ""}
                  </Typography>
                </Box>
                {c.avg_completion != null && <Chip label={`${c.avg_completion}% solved on average`} variant="outlined" />}
              </Stack>
              {c.assignments.length === 0
                ? <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>No assignment has been set for this class yet.</Typography>
                : <WorkTable rows={c.assignments} label={`${c.name} assignments`} />}
            </Card>
          ))}
        </Stack>
      )}

      {d.everyone.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" fontWeight={600}>Set for every student</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Assignments by your teachers with no class chosen, so they reach the whole department. Figures are over all active students.
          </Typography>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <WorkTable rows={d.everyone} label="Assignments set for every student" />
          </Card>
        </Box>
      )}
    </Box>
  );
}
