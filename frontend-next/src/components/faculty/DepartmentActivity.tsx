"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, WarningAmberIcon } from "@/components/ui/icons";
import { typeScale } from "@/theme/tokens";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";

interface ActivityRow {
  id: string; name: string; roll_no: string | null; section: string | null; year: number | null;
  last_seen: string | null; days_since_seen: number | null; active_days: number; status: "active" | "at_risk";
}
interface Activity {
  kind: "students" | "faculty"; days: number;
  totals: { people: number; active: number; at_risk: number };
  rows: ActivityRow[];
}

type Kind = "students" | "faculty";
type Days = "7" | "30" | "90";
type View = "all" | "active" | "at_risk";

const KINDS = [{ value: "students" as const, label: "Students" }, { value: "faculty" as const, label: "Faculty" }];
const RANGES = [{ value: "7" as const, label: "7 days" }, { value: "30" as const, label: "30 days" }, { value: "90" as const, label: "90 days" }];
const VIEWS = [{ value: "all" as const, label: "Everyone" }, { value: "active" as const, label: "Active" }, { value: "at_risk" as const, label: "Not active" }];

const SORT = {
  name: (r: ActivityRow) => r.name,
  seen: (r: ActivityRow) => r.days_since_seen ?? 1e9,
  days: (r: ActivityRow) => r.active_days,
};
type SortKey = keyof typeof SORT;
const searchText = (r: ActivityRow) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""}`;

function seenLabel(r: ActivityRow) {
  if (r.days_since_seen == null) return "Never";
  if (r.days_since_seen === 0) return "Today";
  return `${r.days_since_seen}d ago`;
}

/** Who is using the platform and who isn't, for the HOD. Last seen is a login or a submission, whichever is later. */
export function DepartmentActivity() {
  const router = useRouter();
  const [kind, setKind] = React.useState<Kind>("students");
  const [days, setDays] = React.useState<Days>("7");
  const [view, setView] = React.useState<View>("all");

  const query = useQuery<Activity>({
    queryKey: ["faculty", "department-activity", kind, days],
    queryFn: async () => (await api.get("/api/faculty/department/activity", { params: { kind, days: Number(days) } })).data.data,
    staleTime: 60_000,
  });
  const d = query.data;

  const rows = React.useMemo(() => (d?.rows ?? []).filter((r) => view === "all" || r.status === view), [d, view]);
  const t = useTable<ActivityRow, SortKey>(rows, searchText, SORT, { by: "seen", dir: "desc" });
  const clickable = kind === "students";

  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.roll_no ?? "", section: r.section ?? "", year: r.year ?? "",
    status: r.status === "active" ? "active" : "not active", last_seen: r.last_seen ?? "never", days_since_seen: r.days_since_seen ?? "",
    days_with_submissions: r.active_days,
  })));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Last seen is the later of a login or a submission. Days active counts days with a submission. This is
        activity-based, not measured time on the platform.
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <SegmentedButtons<Kind> value={kind} onChange={(v) => { setKind(v); setView("all"); }} segments={KINDS} ariaLabel="Students or faculty" />
        <SegmentedButtons<Days> value={days} onChange={setDays} segments={RANGES} ariaLabel="Time range" />
      </Stack>

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Could not load activity.")}
        </Alert>
      ) : query.isLoading || !d ? (
        <Skeleton variant="rounded" height={300} />
      ) : (
        <>
          <KpiRow min={170}>
            <KpiTile icon={<GroupsOutlinedIcon />} label={kind === "students" ? "Students" : "Staff"} value={d.totals.people} />
            <KpiTile icon={<CheckCircleOutlineIcon />} accent="success" label={`Active (${d.days} days)`} value={d.totals.active} total={d.totals.people} />
            <KpiTile icon={<WarningAmberIcon />} accent="error" label="Not active" value={d.totals.at_risk} total={d.totals.people} help={`No login or submission in the last ${d.days} days`} />
          </KpiRow>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
            <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search" sx={{ maxWidth: 320 }} />
            <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Filter by status" />
            <Box sx={{ flex: 1 }} />
            <ExportButton filename={`department-activity-${kind}.csv`} csv={csv} disabled={t.all.length === 0} />
          </Stack>

          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            {t.all.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title="Nobody matches" description="Try a different filter or clear the search." />
            ) : (
              <>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" aria-label="Department activity" sx={{ minWidth: 640 }}>
                    <TableHead>
                      <TableRow sx={headRow}>
                        <Head<SortKey> id="name" label={kind === "students" ? "Student" : "Staff member"} sort={t.sort} toggle={t.toggle} />
                        <Head<SortKey> id="seen" label="Last seen" sort={t.sort} toggle={t.toggle} />
                        {kind === "students" && <Head<SortKey> id="days" label="Days active" sort={t.sort} toggle={t.toggle} align="right" />}
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {t.visible.map((r) => (
                        <TableRow
                          key={r.id} hover={clickable}
                          onClick={clickable ? () => router.push(`/faculty/students/${r.id}`) : undefined}
                          sx={{ ...bodyRow, cursor: clickable ? "pointer" : "default" }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[r.roll_no, r.section && `Sec ${r.section}`, r.year && `Year ${r.year}`].filter(Boolean).join(" · ")}
                            </Typography>
                          </TableCell>
                          <TableCell>{seenLabel(r)}</TableCell>
                          {kind === "students" && <TableCell align="right">{r.active_days}</TableCell>}
                          <TableCell>
                            <Chip
                              size="small" label={r.status === "active" ? "Active" : "Not active"}
                              sx={{
                                height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600,
                                bgcolor: r.status === "active" ? "successContainer" : "errorContainer",
                                color: r.status === "active" ? "onSuccessContainer" : "onErrorContainer",
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
              </>
            )}
          </Card>
        </>
      )}
    </Box>
  );
}
