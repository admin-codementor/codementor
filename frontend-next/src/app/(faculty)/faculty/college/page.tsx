"use client";

import * as React from "react";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { StatRowSkeleton } from "@/components/ui/Skeletons";
import { KpiRow, KpiTile } from "@/components/analytics";
import { GroupsOutlinedIcon, AdminPanelSettingsOutlinedIcon, GppGoodOutlinedIcon, MailOutlineIcon } from "@/components/ui/icons";
import { headRow } from "@/components/faculty/DepartmentTables";
import { ROLE_LABEL } from "@/components/admin/types";

interface Overview {
  students: { total: number; active_7d: number; active_30d: number; by_department: { name: string; count: number }[]; by_year: { name: string; count: number }[] };
  staff: { total: number; by_role: { role: string; label: string; count: number }[]; disabled: number; active_7d: number; without_two_factor: { id: string; name: string; role: string }[] };
  security: { failed_two_factor_24h: number; blocked_24h: number; sign_ins_24h: number };
  system: { mail_configured: boolean; ai_enabled: boolean; ai_daily_limit: number | null; ai_uses_today: number | null; ai_people_today: number | null };
  settings_set_up: boolean;
}

/** One page for the whole college: who is here, who is active, what needs the Admin's attention. */
export default function CollegeOverviewPage() {
  const query = useQuery<Overview>({ queryKey: ["admin", "overview"], queryFn: async () => (await api.get("/api/admin/overview")).data.data, staleTime: 60_000 });
  const d = query.data;
  const attention: { key: string; text: React.ReactNode; severity: "warning" | "error" | "info" }[] = [];
  if (d) {
    if (!d.system.mail_configured) attention.push({ key: "mail", severity: "warning", text: "Email is not set up on the server, so new accounts and password links cannot be sent, and exam integrity reports are not mailed. Set SMTP_HOST and MAIL_FROM in the server's .env." });
    if (d.staff.without_two_factor.length) attention.push({ key: "2fa", severity: "warning", text: <>No two-factor sign-in yet: {d.staff.without_two_factor.map((p) => `${p.name} (${ROLE_LABEL[p.role]})`).join(", ")}. Training & Placement and Admin accounts should have it on.</> });
    if (d.security.failed_two_factor_24h >= 5) attention.push({ key: "fails", severity: "error", text: `${d.security.failed_two_factor_24h} wrong two-factor codes in the last day. Check the sign-in history.` });
    if (!d.settings_set_up) attention.push({ key: "settings", severity: "info", text: <>The college&apos;s departments are not listed yet. <Link component={NextLink} href="/faculty/settings">Add them in Settings</Link> so a typo cannot create a new department.</> });
  }

  return (
    <>
      <PageHeader title="College overview" subtitle="Everyone and everything on the platform, at a glance." />
      <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<StatRowSkeleton />}>
        {d && (
          <Stack spacing={3}>
            {attention.length > 0 && <Stack spacing={1}>{attention.map((a) => <Alert key={a.key} severity={a.severity}>{a.text}</Alert>)}</Stack>}

            <KpiRow min={180}>
              <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={d.students.total} help="Current students, graduated ones left out" />
              <KpiTile icon={<GroupsOutlinedIcon />} accent="success" label="Signed in this week" value={d.students.active_7d} total={d.students.total} help={`${d.students.active_30d} in the last 30 days`} />
              <KpiTile icon={<AdminPanelSettingsOutlinedIcon />} accent="secondary" label="Staff accounts" value={d.staff.total} help={`${d.staff.active_7d} signed in this week${d.staff.disabled ? ` · ${d.staff.disabled} disabled` : ""}`} />
              <KpiTile icon={<GppGoodOutlinedIcon />} accent="tertiary" label="Sign-ins, last day" value={d.security.sign_ins_24h} help={`${d.security.failed_two_factor_24h} wrong 2FA codes · ${d.security.blocked_24h} blocked`} />
              <KpiTile icon={<MailOutlineIcon />} accent={d.system.mail_configured ? "success" : "warning"} label="Email" value={d.system.mail_configured ? "On" : "Off"} help={d.system.ai_enabled ? `AI on${d.system.ai_daily_limit ? `, ${d.system.ai_daily_limit} a day each` : ""}${d.system.ai_uses_today != null ? ` · ${d.system.ai_uses_today} uses today` : ""}` : "AI is switched off"} />
            </KpiRow>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
              <Card variant="outlined" sx={{ borderColor: "outlineVariant", flex: 1, overflow: "hidden" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ p: 2, pb: 1 }}>Students by department</Typography>
                <TableContainer><Table size="small" aria-label="Students by department">
                  <TableHead><TableRow sx={headRow}><TableCell>Department</TableCell><TableCell align="right">Students</TableCell></TableRow></TableHead>
                  <TableBody>{d.students.by_department.map((r) => <TableRow key={r.name} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}><TableCell>{r.name}</TableCell><TableCell align="right">{r.count}</TableCell></TableRow>)}</TableBody>
                </Table></TableContainer>
              </Card>
              <Card variant="outlined" sx={{ borderColor: "outlineVariant", flex: 1, overflow: "hidden" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ p: 2, pb: 1 }}>Students by year</Typography>
                <TableContainer><Table size="small" aria-label="Students by year">
                  <TableHead><TableRow sx={headRow}><TableCell>Year</TableCell><TableCell align="right">Students</TableCell></TableRow></TableHead>
                  <TableBody>{d.students.by_year.map((r) => <TableRow key={r.name} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}><TableCell>{r.name === "Unassigned" ? "No year set" : `Year ${r.name}`}</TableCell><TableCell align="right">{r.count}</TableCell></TableRow>)}</TableBody>
                </Table></TableContainer>
              </Card>
              <Card variant="outlined" sx={{ borderColor: "outlineVariant", flex: 1, p: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Staff by role</Typography>
                <Stack spacing={1}>
                  {d.staff.by_role.map((r) => <Stack key={r.role} direction="row" justifyContent="space-between"><Typography variant="body2">{r.label}</Typography><Chip size="small" label={r.count} /></Stack>)}
                </Stack>
                <Box sx={{ mt: 2 }}><Link component={NextLink} href="/faculty/people" variant="body2">Manage people</Link></Box>
              </Card>
            </Stack>
          </Stack>
        )}
      </DataState>
    </>
  );
}
