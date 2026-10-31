"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { typeScale } from "@/theme/tokens";
import { LOGIN_KIND, NEEDS_DEPARTMENT, ROLE_LABEL, STAFF_ROLES, fmtWhen, useSettings, type PersonDetail, type StaffRole } from "./types";

/** Ask for the account's email, typed in full, before a change that can lock someone out or widen what they can do. */
export function TypedConfirmDialog({ open, onClose, email, title, description, confirmLabel, destructive, busy, error, onConfirm }: {
  open: boolean; onClose: () => void; email: string; title: string; description: React.ReactNode; confirmLabel: string;
  destructive?: boolean; busy?: boolean; error?: string; onConfirm: (typed: string) => void;
}) {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => { if (open) setTyped(""); }, [open]);
  const ok = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="typed-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (ok && !busy) onConfirm(typed); }}>
        <DialogTitle id="typed-title">{title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary" component="div">{description}</Typography>
            <TextField size="small" autoFocus label={`Type ${email} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" slotProps={{ htmlInput: { spellCheck: false } }} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="contained" color={destructive ? "error" : "primary"} disabled={!ok || busy}>{busy ? "Working…" : confirmLabel}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** A new staff account. The person gets an emailed link to choose their own password; the Admin never sees one. */
export function CreateAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const settings = useSettings();
  const [f, setF] = React.useState({ name: "", email: "", role: "faculty" as StaffRole, department: "", typed: "" });
  React.useEffect(() => { if (open) setF({ name: "", email: "", role: "faculty", department: "", typed: "" }); }, [open]);
  const needsDept = NEEDS_DEPARTMENT.includes(f.role);
  const departments = settings.data?.departments ?? [];

  const create = useMutation({
    mutationFn: async () => (await api.post("/api/admin/people", { name: f.name, email: f.email, role: f.role, department: needsDept ? f.department : null, ...(f.role === "admin" ? { typed: f.typed } : {}) })).data.data as { email: string; mail: string },
    onSuccess: (r) => {
      showToast(r.mail === "sent" ? `Account created. A link to choose a password was emailed to ${r.email}.` : "Account created, but the email could not be sent. Use \"Send a new link\" on the person's page.", { severity: r.mail === "sent" ? "success" : "warning" });
      void qc.invalidateQueries({ queryKey: ["admin", "people"] });
      onClose();
    },
  });
  const adminOk = f.role !== "admin" || f.typed.trim().toLowerCase() === f.email.trim().toLowerCase();
  const ready = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && (!needsDept || f.department.trim().length > 0) && adminOk;

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="create-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (ready) create.mutate(); }}>
        <DialogTitle id="create-title">Add a staff account</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">They get an email with a link to choose their own password. You never see a password or the link.</Typography>
            <TextField size="small" label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField size="small" label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required slotProps={{ htmlInput: { maxLength: 160 } }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select size="small" label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as StaffRole })} fullWidth>
                {STAFF_ROLES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>)}
              </TextField>
              {needsDept && (departments.length > 0 ? (
                <TextField select size="small" label="Department" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} required fullWidth>
                  {departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                </TextField>
              ) : (
                <TextField size="small" label="Department" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} required fullWidth helperText="Add the college's departments in Settings to choose from a list." />
              ))}
            </Stack>
            {f.role === "tnp" && <Alert severity="info">Training &amp; Placement must set up two-factor sign-in the first time they sign in.</Alert>}
            {f.role === "admin" && <TextField size="small" label="Type the email again to confirm a new Admin" value={f.typed} onChange={(e) => setF({ ...f, typed: e.target.value })} autoComplete="off" helperText="An Admin can change everything here. Be sure." />}
            {create.isError && <Alert severity="error">{apiErrorMessage(create.error, "Could not create the account.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || create.isPending}>{create.isPending ? "Creating…" : "Create and email link"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** One account: who they are, how they signed in lately, and the things an Admin can do to it. Staff only; students are managed by their department. */
export function PersonDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const settings = useSettings();
  const query = useQuery<PersonDetail>({ queryKey: ["admin", "person", id], queryFn: async () => (await api.get(`/api/admin/people/${id}`)).data.data, enabled: !!id });
  const p = query.data;
  const isStaff = !!p && (STAFF_ROLES as string[]).includes(p.role);
  const [mode, setMode] = React.useState<null | "disable" | "role">(null);
  const [role, setRole] = React.useState<StaffRole>("faculty");
  const [dept, setDept] = React.useState("");
  const [error, setError] = React.useState("");
  const departments = settings.data?.departments ?? [];

  React.useEffect(() => { setMode(null); setError(""); if (p) { setRole((p.role as StaffRole) ?? "faculty"); setDept(p.department ?? ""); } }, [p?.id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin"] }); };
  const act = useMutation({
    mutationFn: async (v: { path: string; body?: object }) => (await api.post(`/api/admin/people/${id}/${v.path}`, v.body)).data.data,
    onSuccess: (_d, v) => {
      const msg: Record<string, string> = { "reset-link": "A new link was emailed to them.", disabled: "Done.", role: "Role changed. Their sessions were ended.", department: "Department changed. Their sessions were ended." };
      showToast(msg[v.path] ?? "Done.", { severity: "success" });
      setMode(null); setError(""); refresh();
    },
    onError: (e) => setError(apiErrorMessage(e, "That did not work.")),
  });

  return (
    <>
      <Dialog open={!!id && !mode} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="person-title">
        <DialogTitle id="person-title">{p ? p.name : "Account"}</DialogTitle>
        <DialogContent dividers>
          <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<ListSkeleton rows={4} />}>
            {p && (
              <Stack spacing={2.5}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                  <Chip size="small" label={ROLE_LABEL[p.role] ?? p.role} />
                  {p.department && <Chip size="small" variant="outlined" label={p.department} />}
                  {p.disabled && <Chip size="small" color="error" label="Disabled" />}
                  {(p.role === "admin" || p.role === "tnp") && <Chip size="small" color={p.twofa ? "success" : "warning"} variant="outlined" label={p.twofa ? "Two-factor on" : "No two-factor yet"} />}
                </Stack>
                <Typography variant="body2" color="text.secondary">{p.email}{p.rollNo ? ` · ${p.rollNo}` : ""}</Typography>
                <Typography variant="body2">Last signed in: {fmtWhen(p.last_login_ms)}</Typography>

                {!isStaff && (
                  <Stack spacing={1.5}>
                    <Alert severity="info">This is a student. Their department manages them: roster, year and section, and the academic structure. Here you can set their batch.</Alert>
                    <BatchEditor person={p} onSaved={refresh} />
                  </Stack>
                )}
                {isStaff && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" disabled={p.disabled || act.isPending} onClick={() => act.mutate({ path: "reset-link" })}>Send a new set-password link</Button>
                    <Button size="small" variant="outlined" onClick={() => setMode("role")}>Change role</Button>
                    {NEEDS_DEPARTMENT.includes(p.role) && (
                      <Button size="small" variant="outlined" disabled={!dept || dept === p.department || act.isPending} onClick={() => act.mutate({ path: "department", body: { department: dept } })}>Save department</Button>
                    )}
                    {p.disabled
                      ? <Button size="small" variant="contained" disabled={act.isPending} onClick={() => act.mutate({ path: "disabled", body: { disabled: false } })}>Enable account</Button>
                      : <Button size="small" color="error" variant="outlined" onClick={() => setMode("disable")}>Disable account</Button>}
                  </Stack>
                )}
                {isStaff && NEEDS_DEPARTMENT.includes(p.role) && (departments.length > 0
                  ? <TextField select size="small" label="Department" value={dept} onChange={(e) => setDept(e.target.value)} sx={{ maxWidth: 260 }}>{departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}</TextField>
                  : <TextField size="small" label="Department" value={dept} onChange={(e) => setDept(e.target.value)} sx={{ maxWidth: 260 }} />)}
                {error && !mode && <Alert severity="error">{error}</Alert>}

                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Recent sign-ins</Typography>
                  {p.logins.length === 0 ? <Typography variant="body2" color="text.secondary">None recorded yet.</Typography> : (
                    <Stack spacing={0.75}>
                      {p.logins.slice(0, 10).map((l, i) => (
                        <Stack key={i} direction="row" spacing={1.5} alignItems="baseline" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" sx={{ minWidth: 150 }}>{fmtWhen(l.at_ms)}</Typography>
                          <Typography variant="body2" color={l.kind === "login" ? "text.primary" : "error.main"}>{LOGIN_KIND[l.kind]}</Typography>
                          {l.ip && <Typography variant="caption" color="text.secondary" sx={{ fontSize: typeScale.labelSmall.fontSize }}>{l.ip}</Typography>}
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}
          </DataState>
        </DialogContent>
        <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
      </Dialog>

      {p && (
        <TypedConfirmDialog open={mode === "disable"} onClose={() => { setMode(null); setError(""); }} email={p.email ?? ""} title={`Disable ${p.name}?`} destructive confirmLabel="Disable account"
          description="They are signed out within seconds and cannot sign in again until you enable the account. Nothing they made is deleted." busy={act.isPending} error={error}
          onConfirm={(typed) => act.mutate({ path: "disabled", body: { disabled: true, typed } })} />
      )}
      {p && (
        <Dialog open={mode === "role"} onClose={act.isPending ? undefined : () => { setMode(null); setError(""); }} fullWidth maxWidth="xs" aria-labelledby="role-title">
          <DialogTitle id="role-title">Change {p.name}&apos;s role</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">They are signed out everywhere and see the new menu the next time they sign in.</Typography>
              <TextField select size="small" label="New role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
                {STAFF_ROLES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>)}
              </TextField>
              {NEEDS_DEPARTMENT.includes(role) && (departments.length > 0
                ? <TextField select size="small" label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>{departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}</TextField>
                : <TextField size="small" label="Department" value={dept} onChange={(e) => setDept(e.target.value)} />)}
              <RoleConfirm email={p.email ?? ""} busy={act.isPending} error={error} disabled={role === p.role || (NEEDS_DEPARTMENT.includes(role) && !dept)}
                onConfirm={(typed) => act.mutate({ path: "role", body: { role, department: NEEDS_DEPARTMENT.includes(role) ? dept : undefined, typed } })} onCancel={() => { setMode(null); setError(""); }} />
            </Stack>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function RoleConfirm({ email, busy, error, disabled, onConfirm, onCancel }: { email: string; busy: boolean; error: string; disabled: boolean; onConfirm: (typed: string) => void; onCancel: () => void }) {
  const [typed, setTyped] = React.useState("");
  const ok = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <>
      <TextField size="small" label={`Type ${email} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="contained" disabled={!ok || disabled || busy} onClick={() => onConfirm(typed)}>{busy ? "Working…" : "Change role"}</Button>
      </Stack>
    </>
  );
}

/** A student's batch (admission year). Shown as stored, or as worked out from their year of study when none is stored. */
function BatchEditor({ person, onSaved }: { person: PersonDetail; onSaved: () => void }) {
  const showToast = useToast();
  const [year, setYear] = React.useState(person.admission_year != null ? String(person.admission_year) : "");
  React.useEffect(() => { setYear(person.admission_year != null ? String(person.admission_year) : ""); }, [person.id, person.admission_year]);
  const save = useMutation({
    mutationFn: async () => (await api.post(`/api/admin/people/${person.id}/admission-year`, { admission_year: year })).data.data as { batch: string },
    onSuccess: (r) => { showToast(`Batch set to ${r.batch}.`, { severity: "success" }); onSaved(); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not save the batch."), { severity: "error" }),
  });
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <TextField size="small" label="Year they joined" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} sx={{ width: 180 }}
        helperText={person.batch ? `Batch ${person.batch}${person.batch_derived ? " (worked out from their year of study)" : ""}` : "Their year of study is not set"} />
      <Button size="small" variant="outlined" disabled={year.length !== 4 || save.isPending || String(person.admission_year ?? "") === year} onClick={() => save.mutate()}>Save</Button>
    </Stack>
  );
}

/** Stores the worked-out batch for every student who has none, so it stops changing as the academic year turns. */
export function FillBatchesButton() {
  const qc = useQueryClient();
  const showToast = useToast();
  const fill = useMutation({
    mutationFn: async () => (await api.post("/api/admin/students/fill-batches")).data.data as { filled: number; skipped: number },
    onSuccess: (r) => { showToast(`Stored the batch for ${r.filled} student${r.filled === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} have no year of study, so they were left.` : ""}`, { severity: "success" }); void qc.invalidateQueries({ queryKey: ["admin"] }); void qc.invalidateQueries({ queryKey: ["faculty", "batches"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not fill the batches."), { severity: "error" }),
  });
  return <Button variant="outlined" onClick={() => fill.mutate()} disabled={fill.isPending} title="Works out each student's batch from their year of study and stores it, for students who have none">{fill.isPending ? "Working…" : "Fill missing batches"}</Button>;
}
