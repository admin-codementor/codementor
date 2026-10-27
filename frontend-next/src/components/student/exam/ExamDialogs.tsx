"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { AccessTimeIcon } from "@/components/ui/icons";
import { FONT_STEPS, type ExamLayout, type ExamPrefs } from "@/hooks/useExamPrefs";

export interface SectionTally { id: string; title: string; total: number; answered: number; notAnswered: number; notVisited: number }

/** Finish: what is done and what is not, plainly, and that this cannot be undone. */
export function FinishDialog({ open, onClose, onConfirm, submitting, tallies, timeLeftLabel }: {
  open: boolean; onClose: () => void; onConfirm: () => void; submitting: boolean; tallies: SectionTally[]; timeLeftLabel: string | null;
}) {
  const sum = (k: "total" | "answered" | "notAnswered" | "notVisited") => tallies.reduce((n, t) => n + t[k], 0);
  const unfinished = sum("notAnswered") + sum("notVisited");
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="finish-title">
      <DialogTitle id="finish-title">Finish the test?</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, mb: 2 }} divider={<Box sx={{ width: "1px", bgcolor: "outlineVariant" }} />}>
          {[["Total", sum("total"), "text.primary"], ["Answered", sum("answered"), "success.main"], ["Not answered", sum("notAnswered"), "error.main"], ["Not visited", sum("notVisited"), "text.secondary"]].map(([label, n, color]) => (
            <Box key={String(label)} sx={{ flex: 1, textAlign: "center", py: 1.25 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: String(color) }}>{n}</Typography>
            </Box>
          ))}
        </Stack>
        <Stack spacing={0.75}>
          {tallies.map((t) => (
            <Stack key={t.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{t.title}</Typography>
              <Typography variant="caption" color="text.secondary">{t.answered} of {t.total} answered</Typography>
              {t.notAnswered + t.notVisited > 0 && <Typography variant="caption" color="error.main" fontWeight={600}>{t.notAnswered + t.notVisited} left</Typography>}
            </Stack>
          ))}
        </Stack>
        {timeLeftLabel && (
          <Alert severity="info" icon={<AccessTimeIcon />} sx={{ mt: 2 }}>
            You still have <b>{timeLeftLabel}</b> left. {unfinished > 0 ? `${unfinished} question${unfinished === 1 ? " is" : "s are"} not answered.` : "Everything is answered."}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>When you finish, your answers are final. You cannot change them afterwards.</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={onClose} disabled={submitting} autoFocus>No, I want to continue the test</Button>
        <Button variant="outlined" color="error" onClick={onConfirm} disabled={submitting}>{submitting ? "Submitting…" : "Yes, finish and exit"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Layout and text size, kept on this device. */
export function SettingsDialog({ open, onClose, prefs, onChange, onReset }: {
  open: boolean; onClose: () => void; prefs: ExamPrefs; onChange: (p: Partial<ExamPrefs>) => void; onReset: () => void;
}) {
  const idx = Math.max(0, FONT_STEPS.indexOf(prefs.fontScale));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="settings-title">
      <DialogTitle id="settings-title">Settings</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Layout</Typography>
        <ToggleButtonGroup exclusive size="small" value={prefs.layout} onChange={(_, v: ExamLayout | null) => { if (v) onChange({ layout: v }); }} aria-label="Layout" sx={{ mb: 3 }}>
          <ToggleButton value="side">Side by side</ToggleButton>
          <ToggleButton value="stacked">One above the other</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" alignItems="center" sx={{ mb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>Text size</Typography>
          <Typography variant="body2" color="text.secondary">{prefs.fontScale}%</Typography>
        </Stack>
        <Slider
          value={idx} min={0} max={FONT_STEPS.length - 1} step={1} marks={FONT_STEPS.map((v, i) => ({ value: i, label: i % 2 === 0 ? `${v}%` : "" }))}
          onChange={(_, v) => onChange({ fontScale: FONT_STEPS[v as number] })} aria-label="Text size" valueLabelDisplay="off"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onReset} disabled={prefs.fontScale === 100}>Reset text size</Button>
        <Button variant="contained" onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

export interface InstructionRow { id: string; title: string; type: "mcq" | "coding"; count: number; marksEach: number }

/** Always reachable from the (i) button: what each section contains and what it is worth. */
export function InstructionsDialog({ open, onClose, general, rows }: { open: boolean; onClose: () => void; general: string | null; rows: InstructionRow[] }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="instructions-title">
      <DialogTitle id="instructions-title">Instructions</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>{general || "Read each question carefully before you answer. Your answers save as you go."}</Typography>
        <Stack spacing={0.75}>
          {rows.map((r) => (
            <Typography key={r.id} variant="body2">
              <b>{r.title}</b>: {r.count} {r.type === "coding" ? "programming" : "multiple-choice"} question{r.count === 1 ? "" : "s"}, {r.marksEach} mark{r.marksEach === 1 ? "" : "s"} each.
            </Typography>
          ))}
        </Stack>
        <Typography variant="body2" sx={{ mt: 2 }}>Press <b>Finish</b> only when you have completed the exam.</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button variant="contained" onClick={onClose}>OK</Button></DialogActions>
    </Dialog>
  );
}
