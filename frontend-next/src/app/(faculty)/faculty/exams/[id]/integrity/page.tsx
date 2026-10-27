"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { ChevronRightIcon, ExpandLessIcon, ExpandMoreIcon, RefreshIcon, ShieldOutlinedIcon } from "@/components/ui/icons";

interface MailInfo { status: "sent" | "failed" | "not_configured" | "pending"; at: string | null; recipients: number; error: string | null }
interface EvidenceType { type: string; label: string; reason: string; count: number; mail: MailInfo | null }
interface EvidenceEvent { type: string; label: string; at: string; detail: string | null }
interface Row {
  userId: string; name: string; rollNo: string | null; section: string | null; total: number;
  types: EvidenceType[]; events: EvidenceEvent[]; firstAt: string | null; lastAt: string | null;
  violationCount: number; submitted: boolean; score: number | null; total_marks: number | null;
}
interface IntegrityData { exam: { id: string; title: string }; rows: Row[]; students: number; events: number; mail_configured: boolean; server_time: string }

const MAIL_LABEL: Record<MailInfo["status"], string> = {
  sent: "Mails sent", failed: "Mail failed", not_configured: "Mail not set up", pending: "Mail pending",
};
const MAIL_STYLE: Record<MailInfo["status"], { bg: string; fg: string }> = {
  sent: { bg: "successContainer", fg: "onSuccessContainer" },
  failed: { bg: "errorContainer", fg: "onErrorContainer" },
  not_configured: { bg: "warningContainer", fg: "onWarningContainer" },
  pending: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "—");

export default function ExamIntegrityPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState<string | null>(null);

  const query = useQuery<IntegrityData>({
    queryKey: ["faculty", "exam-integrity", id],
    queryFn: async () => (await api.get(`/api/exams/${id}/integrity`)).data.data,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const d = query.data;

  const resend = async (row: Row, type: string) => {
    const key = `${row.userId}:${type}`;
    setSending(key);
    try {
      const r = await api.post(`/api/exams/${id}/integrity/${row.userId}/resend`, { type });
      const status = r.data?.data?.status as MailInfo["status"] | undefined;
      toast(status === "sent" ? `Mails sent for ${row.name}.` : status === "not_configured" ? "Mail is not set up on the server, so nothing was sent." : "The mail could not be sent. Check the mail settings.", { severity: status === "sent" ? "success" : "warning" });
      void qc.invalidateQueries({ queryKey: ["faculty", "exam-integrity", id] });
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't send the mails."), { severity: "error" });
    } finally {
      setSending(null);
    }
  };

  return (
    <Stack>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/faculty/exams" underline="hover" color="text.secondary">Exams</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>Integrity report</Typography>
      </Breadcrumbs>

      <PageHeader
        title={d ? `Integrity: ${d.exam.title}` : "Integrity report"}
        subtitle={d ? `${d.students} student${d.students === 1 ? "" : "s"} with evidence · ${d.events} event${d.events === 1 ? "" : "s"}` : undefined}
        actions={<Button startIcon={<RefreshIcon />} onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</Button>}
      />

      <Alert severity="info" icon={<ShieldOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
        This lists only things the exam page itself never does, so they cannot happen by accident: a made-up session code, an answer for a
        question that is not in the exam, an option that cannot exist, marks sent from the browser, repeated changes long after time ended.
        It is a record from the server, not a verdict. Leaving fullscreen or switching tab are not here: those pause the exam and are on the live roster.
      </Alert>

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load the integrity report.")}
        </Alert>
      ) : query.isLoading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={60} /><Skeleton variant="rounded" height={260} /></Stack>
      ) : !d ? null : (
        <>
          {!d.mail_configured && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Mail is not set up on the server (SMTP_HOST and MAIL_FROM in .env). Evidence is still recorded here, but students and admins are not being emailed.
            </Alert>
          )}

          {d.rows.length === 0 ? (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <EmptyState icon={<ShieldOutlinedIcon />} title="No evidence recorded" description="Nothing the exam page never does has been seen for this exam. This page checks again every 30 seconds." />
            </Card>
          ) : (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Students with integrity evidence">
                  <TableHead>
                    <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                      <TableCell />
                      <TableCell>Student</TableCell>
                      <TableCell>What the server saw</TableCell>
                      <TableCell>Last</TableCell>
                      <TableCell align="right">Events</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {d.rows.map((r) => {
                      const expanded = open === r.userId;
                      return (
                        <React.Fragment key={r.userId}>
                          <TableRow hover sx={{ "& td": { borderColor: "outlineVariant" }, cursor: "pointer" }} onClick={() => setOpen(expanded ? null : r.userId)}>
                            <TableCell padding="checkbox">
                              <IconButton size="small" aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded}>
                                {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              </IconButton>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{[r.rollNo, r.section].filter(Boolean).join(" · ")}</Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                {r.types.map((t) => <Chip key={t.type} size="small" label={t.count > 1 ? `${t.label} ×${t.count}` : t.label} />)}
                              </Stack>
                            </TableCell>
                            <TableCell><Typography variant="caption" color="text.secondary">{when(r.lastAt)}</Typography></TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.total}</TableCell>
                          </TableRow>
                          <TableRow sx={{ "& td": { borderColor: "outlineVariant", py: 0 } }}>
                            <TableCell colSpan={5} sx={{ p: 0 }}>
                              <Collapse in={expanded} unmountOnExit>
                                <Box sx={{ px: 3, py: 2, bgcolor: "surfaceContainerLow" }}>
                                  <Stack spacing={2}>
                                    {r.types.map((t) => {
                                      const mail = t.mail;
                                      const style = mail ? MAIL_STYLE[mail.status] : null;
                                      const key = `${r.userId}:${t.type}`;
                                      return (
                                        <Box key={t.type}>
                                          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                            <Typography variant="subtitle2" fontWeight={600}>{t.label}</Typography>
                                            {t.count > 1 && <Typography variant="caption" color="text.secondary">{t.count} times</Typography>}
                                            {mail && style && <Chip size="small" label={MAIL_LABEL[mail.status]} sx={{ bgcolor: style.bg, color: style.fg }} />}
                                            {!mail && <Chip size="small" variant="outlined" label="Not mailed (3 mails per student at most)" />}
                                            <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); void resend(r, t.type); }} disabled={sending === key}>
                                              {sending === key ? "Sending…" : "Send mails again"}
                                            </Button>
                                          </Stack>
                                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t.reason}</Typography>
                                          {mail?.error && <Typography variant="caption" color="error.main">Mail problem: {mail.error}</Typography>}
                                        </Box>
                                      );
                                    })}
                                    <Box>
                                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Recent events (newest first)</Typography>
                                      <Stack component="ul" spacing={0.25} sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                                        {r.events.map((e, i) => (
                                          <Typography key={i} component="li" variant="caption" color="text.secondary">
                                            {when(e.at)}: {e.label}{e.detail ? ` (${e.detail})` : ""}
                                          </Typography>
                                        ))}
                                      </Stack>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                      {r.submitted ? `Submitted${r.score != null ? `, score ${r.score}${r.total_marks ? ` of ${r.total_marks}` : ""}` : ""}.` : "Not submitted."} Violations counted on the roster: {r.violationCount}.
                                    </Typography>
                                  </Stack>
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
