"use client";

import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Step from "@mui/material/Step";
import Stepper from "@mui/material/Stepper";
import StepLabel from "@mui/material/StepLabel";
import {
  CloseIcon, UploadFileOutlinedIcon, AddIcon, DeleteOutlineIcon,
  ExpandMoreIcon, CheckCircleIcon, DescriptionOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState } from "@/components/ui/States";

/**
 * Staged import: upload/paste → review → publish.
 *
 * Parsing writes to a drafts collection, never to the live catalogue, so nothing
 * students can see changes until the faculty member presses Publish here. Drafts
 * that are missing a statement or test cases are shown but cannot be selected —
 * an ungradeable problem must not reach a cohort.
 */
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

interface DraftTestCase { input: string; output: string; is_public?: boolean }
interface Draft {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  tags: string[];
  test_cases: DraftTestCase[];
  source: string;
  warnings: string[];
  ready: boolean;
}

function DraftRow({
  draft, selected, onToggle, onChange, onDelete,
}: {
  draft: Draft;
  selected: boolean;
  onToggle: () => void;
  /** Receives a producer so edits compose against the freshest draft, not this render's copy. */
  onChange: (make: (current: Draft) => Partial<Draft>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Box sx={{ border: "1px solid", borderColor: draft.ready ? "outlineVariant" : "warning.main", borderRadius: 2, mb: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 1 }}>
        <Tooltip title={draft.ready ? "" : "Add a statement and at least one test case before this can be published"}>
          <span>
            <Checkbox size="small" checked={selected} disabled={!draft.ready} onChange={onToggle} />
          </span>
        </Tooltip>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={500} noWrap>{draft.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {draft.difficulty} · {draft.test_cases.length} test case{draft.test_cases.length === 1 ? "" : "s"}
            {draft.tags.length > 0 ? ` · ${draft.tags.slice(0, 3).join(", ")}` : ""}
          </Typography>
        </Box>

        {draft.ready
          ? <Chip size="small" icon={<CheckCircleIcon />} label="Ready" sx={{ height: 22, bgcolor: "successContainer", color: "onSuccessContainer" }} />
          : <Chip size="small" label="Needs work" sx={{ height: 22, bgcolor: "warningContainer", color: "onWarningContainer" }} />}

        <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Edit draft"}>
          <ExpandMoreIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </IconButton>
        <IconButton size="small" color="error" onClick={onDelete} aria-label="Discard draft">
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Collapse in={open}>
        <Stack spacing={1.5} sx={{ px: 1.5, pb: 2, pt: 0.5 }}>
          {draft.warnings.length > 0 && (
            <Alert severity="warning" sx={{ py: 0 }}>
              <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                {draft.warnings.map((w, i) => <Typography key={i} component="li" variant="caption">{w}</Typography>)}
              </Stack>
            </Alert>
          )}

          <TextField label="Title" size="small" fullWidth value={draft.title} onChange={(e) => { const v = e.target.value; onChange(() => ({ title: v })); }} />
          <TextField
            label="Statement" size="small" fullWidth multiline rows={4}
            value={draft.description} onChange={(e) => { const v = e.target.value; onChange(() => ({ description: v })); }}
          />
          <Stack direction="row" spacing={2}>
            <TextField select label="Difficulty" size="small" sx={{ width: 140 }} value={draft.difficulty} onChange={(e) => { const v = e.target.value; onChange(() => ({ difficulty: v })); }}>
              {DIFFICULTIES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
            </TextField>
            <TextField
              label="Tags (comma separated)" size="small" sx={{ flex: 1 }}
              value={draft.tags.join(", ")}
              onChange={(e) => { const v = e.target.value; onChange(() => ({ tags: v.split(",").map((t) => t.trim()).filter(Boolean) })); }}
            />
          </Stack>

          <Typography variant="overline" color="text.secondary">Test cases</Typography>
          {draft.test_cases.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              None yet. Add one, or close this and use AI test generation on the problem after publishing.
            </Typography>
          )}
          {draft.test_cases.map((tc, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
              <TextField
                label={`Input ${i + 1}`} size="small" fullWidth multiline maxRows={4} value={tc.input}
                onChange={(e) => { const v = e.target.value; onChange((cur) => ({ test_cases: cur.test_cases.map((x, j) => (j === i ? { ...x, input: v } : x)) })); }}
                slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }}
              />
              <TextField
                label={`Expected ${i + 1}`} size="small" fullWidth multiline maxRows={4} value={tc.output}
                onChange={(e) => { const v = e.target.value; onChange((cur) => ({ test_cases: cur.test_cases.map((x, j) => (j === i ? { ...x, output: v } : x)) })); }}
                slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }}
              />
              <IconButton size="small" aria-label="Remove test case" onClick={() => onChange((cur) => ({ test_cases: cur.test_cases.filter((_, j) => j !== i) }))}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: "flex-start" }}
            onClick={() => onChange((cur) => ({ test_cases: [...cur.test_cases, { input: "", output: "", is_public: cur.test_cases.length === 0 }] }))}>
            Add test case
          </Button>
        </Stack>
      </Collapse>
    </Box>
  );
}

/**
 * Mounts the wizard body only while open, so each opening starts from fresh state.
 * The alternative — keeping it mounted and clearing state in an effect — is the
 * cascading-render pattern React now warns about, and it risks showing the
 * previous import's drafts for a frame.
 */
export function ImportWizard({ open, onClose, onPublished }: { open: boolean; onClose: () => void; onPublished: () => void }) {
  if (!open) return null;
  return <ImportWizardBody onClose={onClose} onPublished={onPublished} />;
}

function ImportWizardBody({ onClose, onPublished }: { onClose: () => void; onPublished: () => void }) {
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pasted, setPasted] = React.useState("");
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const fileRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  const receive = (data: { drafts: Draft[] }) => {
    draftsRef.current = data.drafts;
    setDrafts(data.drafts);
    // Pre-select everything publishable; the rest need attention first.
    setSelected(new Set(data.drafts.filter((d) => d.ready).map((d) => d.id)));
    setStep(1);
  };

  const submitFile = async (file: File) => {
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.post("/api/problem-import/parse", form);
      if (r.data?.success) receive(r.data.data);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't read that file."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submitText = async () => {
    if (!pasted.trim()) { setError("Paste the question text first."); return; }
    setBusy(true); setError("");
    try {
      const r = await api.post("/api/problem-import/parse", { text: pasted });
      if (r.data?.success) receive(r.data.data);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't extract problems from that text."));
    } finally {
      setBusy(false);
    }
  };

  // Mirror of `drafts` that is advanced synchronously on every edit.
  //
  // Row fields used to derive their new value from the `draft` captured in the
  // current render, so two edits landing before a re-render each computed from the
  // same stale copy and the second silently discarded the first — filling Input
  // and Expected together left a half-empty test case. Composing against a ref
  // keeps same-tick edits additive.
  const draftsRef = React.useRef<Draft[]>([]);
  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const syncDrafts = (next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
  };

  // Push the current local state for one draft to the server. Debounced per draft
  // so typing a statement is one request rather than one per keystroke, and the
  // last write always wins.
  const flushDraft = (id: string) => {
    const cur = draftsRef.current.find((d) => d.id === id);
    if (!cur) return;
    api
      .patch(`/api/problem-import/drafts/${id}`, {
        title: cur.title, description: cur.description, difficulty: cur.difficulty,
        tags: cur.tags, test_cases: cur.test_cases,
      })
      .then((r) => {
        if (!r.data?.success) return;
        const saved: Draft = r.data.data;
        // Trust the server's recomputed readiness, but keep the text the user has
        // since typed — a slow response must not clobber newer keystrokes.
        const latest = draftsRef.current.find((d) => d.id === id);
        const mergedBack: Draft = latest ? { ...latest, ready: saved.ready, warnings: saved.warnings } : saved;
        syncDrafts(draftsRef.current.map((d) => (d.id === id ? mergedBack : d)));
        setSelected((s) => {
          const n = new Set(s);
          if (!mergedBack.ready) n.delete(id);
          return n;
        });
      })
      .catch((e) => toast(apiErrorMessage(e, "Couldn't save that edit."), { severity: "error" }));
  };

  /** `make` receives the freshest copy of the draft, never a stale closure. */
  const patchDraft = (id: string, make: (current: Draft) => Partial<Draft>) => {
    const cur = draftsRef.current.find((d) => d.id === id);
    if (!cur) return;
    const merged: Draft = { ...cur, ...make(cur) };
    syncDrafts(draftsRef.current.map((d) => (d.id === id ? merged : d)));

    clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => flushDraft(id), 600);
  };

  // Don't leave pending saves behind if the dialog closes mid-edit.
  React.useEffect(() => {
    const timers = saveTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const discard = async (id: string) => {
    clearTimeout(saveTimers.current[id]);   // no point saving a row we're deleting
    syncDrafts(draftsRef.current.filter((d) => d.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    try { await api.delete(`/api/problem-import/drafts/${id}`); } catch { /* row already gone from view */ }
  };

  const publish = async () => {
    if (selected.size === 0) return;
    setBusy(true); setError("");
    try {
      const r = await api.post("/api/problem-import/commit", { draft_ids: [...selected] });
      const created = r.data?.data?.created ?? [];
      const skipped = r.data?.data?.skipped ?? [];
      toast(
        `Published ${created.length} problem${created.length === 1 ? "" : "s"}${skipped.length ? `, skipped ${skipped.length}` : ""}`,
        { severity: created.length ? "success" : "warning" },
      );
      onPublished();
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't publish those drafts."));
    } finally {
      setBusy(false);
    }
  };

  const readyCount = drafts.filter((d) => d.ready).length;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        Import problems
        <IconButton onClick={onClose} disabled={busy} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          <Step><StepLabel>Upload</StepLabel></Step>
          <Step><StepLabel>Review</StepLabel></Step>
        </Stepper>

        {busy && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 0 && (
          <Stack spacing={2}>
            <Alert severity="info" sx={{ py: 0.5 }}>
              Nothing is published yet — you review everything on the next step first.
            </Alert>

            <input
              ref={fileRef} type="file" hidden accept=".json,.csv,.docx,.txt,.md"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) submitFile(f); }}
            />
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} disabled={busy} onClick={() => fileRef.current?.click()} sx={{ py: 2, borderStyle: "dashed" }}>
              Choose a file — .docx, .json, .csv, .txt
            </Button>
            <Typography variant="caption" color="text.secondary">
              A Word question paper is split into separate problems automatically. JSON and CSV are read
              directly. For a full package with test files, use the ZIP importer instead.
            </Typography>

            <Typography variant="overline" color="text.secondary">or paste the questions</Typography>
            <TextField
              multiline rows={6} fullWidth size="small" placeholder="Paste one or more questions here…"
              value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={busy}
            />
            <Button variant="contained" disabled={busy || !pasted.trim()} onClick={submitText} sx={{ alignSelf: "flex-start" }}>
              Extract from text
            </Button>
          </Stack>
        )}

        {step === 1 && (
          drafts.length === 0 ? (
            <EmptyState icon={<DescriptionOutlinedIcon />} title="No drafts left" description="Everything was discarded. Go back and import again." />
          ) : (
            <>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                <Typography variant="body2" color="text.secondary">
                  {drafts.length} found · {readyCount} ready · {selected.size} selected to publish
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setSelected(new Set(drafts.filter((d) => d.ready).map((d) => d.id)))}>Select all ready</Button>
                  <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>
                </Stack>
              </Stack>

              {readyCount < drafts.length && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <AlertTitle sx={{ fontSize: 14 }}>{drafts.length - readyCount} need attention</AlertTitle>
                  Expand a row to add what&apos;s missing. A problem with no test cases can&apos;t be graded,
                  so it can&apos;t be published.
                </Alert>
              )}

              {drafts.map((d) => (
                <DraftRow
                  key={d.id}
                  draft={d}
                  selected={selected.has(d.id)}
                  onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                  onChange={(make) => patchDraft(d.id, make)}
                  onDelete={() => discard(d.id)}
                />
              ))}
            </>
          )
        )}
      </DialogContent>

      <DialogActions>
        {step === 1 && <Button onClick={() => setStep(0)} disabled={busy}>Back</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        {step === 1 && (
          <Button variant="contained" color="success" disabled={busy || selected.size === 0} onClick={publish}>
            {busy ? "Publishing…" : `Publish ${selected.size || ""}`.trim()}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
