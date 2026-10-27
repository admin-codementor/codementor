"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius, typeScale } from "@/theme/tokens";
import { STATUS_LABEL, fmtDate, fmtDateTime, type Drive, type AppStatus } from "@/components/tnp/types";
import { ruleSummary } from "@/components/tnp/DrivesList";

interface MyDrive extends Drive { applied: boolean; application_status: AppStatus | null; round_results: Record<string, "passed" | "failed">; can_apply: boolean; reasons: string[]; can_withdraw: boolean }
interface Mine { record: { cgpa: number | null; backlogs: number | null }; has_offer: boolean; drives: MyDrive[]; outside: { id: string; company: string; role: string; ctc: string; status: "applied" | "selected" | "rejected" }[] }

const STATUS_COLOR: Record<AppStatus, { bg: string; fg: string }> = {
  applied: { bg: "primaryContainer", fg: "onPrimaryContainer" }, shortlisted: { bg: "warningContainer", fg: "onWarningContainer" },
  selected: { bg: "successContainer", fg: "onSuccessContainer" }, rejected: { bg: "errorContainer", fg: "onErrorContainer" },
};
const small = { height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600 };

/** The student's consent to share their details with the company, taken before every application. */
function ApplyDialog({ drive, onClose }: { drive: MyDrive | null; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const [agree, setAgree] = React.useState(false);
  React.useEffect(() => { setAgree(false); }, [drive]);
  const apply = useMutation({
    mutationFn: async () => (await api.post(`/api/placement/me/drives/${drive!.id}/apply`, { consent: true })).data.data,
    onSuccess: () => { showToast(`Applied to ${drive!.company}.`, { severity: "success" }); void qc.invalidateQueries({ queryKey: ["placements", "mine"] }); onClose(); },
  });
  return (
    <Dialog open={!!drive} onClose={apply.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="apply-title">
      <DialogTitle id="apply-title">Apply to {drive?.company}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {drive?.link && <Alert severity="info">This company may also ask you to apply on its own site: <Link href={drive.link} target="_blank" rel="noopener noreferrer">{drive.link}</Link>. Applying here does not replace that.</Alert>}
          <FormControlLabel
            control={<Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} />}
            label={`I agree that my name, roll number, department, email, CGPA and coding score may be shared with ${drive?.company ?? "the company"} and its recruiters for this drive.`}
            sx={{ alignItems: "flex-start", "& .MuiCheckbox-root": { pt: 0.5 } }}
          />
          <Typography variant="caption" color="text.secondary">You can withdraw until the company starts acting on applications and before the last date.</Typography>
          {apply.isError && <Alert severity="error">{apiErrorMessage(apply.error, "Could not apply.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={apply.isPending}>Cancel</Button>
        <Button variant="contained" disabled={!agree || apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? "Applying…" : "Apply"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function DriveCard({ d, onApply, onWithdraw, busy }: { d: MyDrive; onApply: () => void; onWithdraw: () => void; busy: boolean }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5, borderRadius: radius.md }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" fontWeight={600}>{d.company}</Typography>
          {d.tier === "dream" && <Chip size="small" label="Dream" sx={{ ...small, bgcolor: "tertiaryContainer", color: "onTertiaryContainer" }} />}
          {d.applied && d.application_status && <Chip size="small" label={STATUS_LABEL[d.application_status]} sx={{ ...small, bgcolor: STATUS_COLOR[d.application_status].bg, color: STATUS_COLOR[d.application_status].fg }} />}
        </Stack>
        <Typography variant="body2" color="text.secondary">{[d.role, d.ctc].filter(Boolean).join(" · ")}</Typography>
        <Typography variant="body2">{ruleSummary(d)}. {d.apply_by ? `Apply by ${fmtDateTime(d.apply_by)}.` : "No last date."}{d.date ? ` Drive on ${fmtDate(d.date)}.` : ""}</Typography>
        {d.description && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>{d.description}</Typography>}
        {d.rounds.length > 0 && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
            <Typography variant="caption" color="text.secondary">Rounds:</Typography>
            {d.rounds.map((r) => {
              const res = d.round_results[r];
              return <Chip key={r} size="small" variant="outlined" label={res ? `${r}: ${res === "passed" ? "passed" : "not cleared"}` : r} sx={{ height: 22, fontSize: typeScale.labelSmall.fontSize, ...(res === "passed" ? { borderColor: "success.main", color: "success.main" } : res === "failed" ? { borderColor: "error.main", color: "error.main" } : {}) }} />;
            })}
          </Stack>
        )}
        {!d.applied && !d.can_apply && d.reasons.length > 0 && (
          <Alert severity="info" icon={false} sx={{ borderRadius: radius.sm }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>You can&apos;t apply to this one</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{d.reasons.map((r) => <li key={r}><Typography variant="body2">{r}</Typography></li>)}</Box>
          </Alert>
        )}
        <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
          {d.can_apply && <Button variant="contained" onClick={onApply} disabled={busy}>Apply</Button>}
          {d.can_withdraw && <Button color="inherit" onClick={onWithdraw} disabled={busy}>Withdraw</Button>}
          {d.link && <Button component="a" href={d.link} target="_blank" rel="noopener noreferrer">Company site</Button>}
        </Stack>
      </Stack>
    </Card>
  );
}

export default function StudentPlacementsPage() {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [applyTo, setApplyTo] = React.useState<MyDrive | null>(null);
  const query = useQuery<Mine>({ queryKey: ["placements", "mine"], queryFn: async () => (await api.get("/api/placement/me")).data.data, staleTime: 30_000 });
  const withdraw = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/placement/me/drives/${id}/apply`),
    onSuccess: () => { showToast("Application withdrawn.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["placements", "mine"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not withdraw."), { severity: "error" }),
  });
  const d = query.data;
  const open = (d?.drives ?? []).filter((x) => !x.applied && x.can_apply);
  const mine = (d?.drives ?? []).filter((x) => x.applied);
  const closed = (d?.drives ?? []).filter((x) => !x.applied && !x.can_apply);

  return (
    <>
      <PageHeader title="Placements" subtitle="Company drives for your department, and where you stand in each." />
      <DataState loading={query.isLoading} fetching={query.isFetching} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<CardGridSkeleton />}>
        {d && (
          <Stack spacing={4}>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5, borderRadius: radius.md }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
                <Box><Typography variant="caption" color="text.secondary">Your CGPA</Typography><Typography variant="h5" fontWeight={600}>{d.record.cgpa ?? "Not added yet"}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Backlogs</Typography><Typography variant="h5" fontWeight={600}>{d.record.backlogs ?? "Not added yet"}</Typography></Box>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Only you, the Training &amp; Placement office, the Admin and your HOD can see these. If they are wrong or missing, tell the Training &amp; Placement office.
              </Typography>
            </Card>

            {d.has_offer && <Alert severity="success">You have an offer. Congratulations. You can apply only to dream drives now.</Alert>}

            <Section title="Open to you" empty="Nothing is open to you right now." items={open} render={(x) => <DriveCard key={x.id} d={x} busy={withdraw.isPending} onApply={() => setApplyTo(x)} onWithdraw={() => undefined} />} />
            <Section title="Your applications" empty="You haven't applied to any drive yet." items={mine} render={(x) => (
              <DriveCard key={x.id} d={x} busy={withdraw.isPending} onApply={() => undefined}
                onWithdraw={async () => { if (await confirm({ title: `Withdraw from ${x.company}?`, description: "You can apply again later if the drive is still open.", confirmLabel: "Withdraw" })) withdraw.mutate(x.id); }} />
            )} />
            {closed.length > 0 && <Section title="Not open to you" empty="" items={closed} render={(x) => <DriveCard key={x.id} d={x} busy onApply={() => undefined} onWithdraw={() => undefined} />} />}

            {d.outside.length > 0 && (
              <Box>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>Applications outside the portal</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Recorded by the Training &amp; Placement office.</Typography>
                <Stack spacing={1}>
                  {d.outside.map((o) => (
                    <Card key={o.id} variant="outlined" sx={{ borderColor: "outlineVariant", p: 2, borderRadius: radius.md }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{o.company}</Typography><Typography variant="caption" color="text.secondary">{[o.role, o.ctc].filter(Boolean).join(" · ")}</Typography></Box>
                        <Chip size="small" label={o.status === "selected" ? "Offer" : o.status === "applied" ? "Applied" : "Not selected"} sx={{ ...small, bgcolor: o.status === "selected" ? "successContainer" : "surfaceContainerHigh", color: o.status === "selected" ? "onSuccessContainer" : "onSurfaceVariant" }} />
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DataState>
      <ApplyDialog drive={applyTo} onClose={() => setApplyTo(null)} />
    </>
  );
}

function Section({ title, empty, items, render }: { title: string; empty: string; items: MyDrive[]; render: (d: MyDrive) => React.ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>{title}</Typography>
      {items.length === 0 ? <Typography variant="body2" color="text.secondary">{empty}</Typography> : <Stack spacing={2}>{items.map(render)}</Stack>}
    </Box>
  );
}
