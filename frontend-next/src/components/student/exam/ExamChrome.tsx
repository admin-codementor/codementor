"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  AccessTimeIcon, CheckCircleIcon, CloseIcon, CloudOffIcon, ErrorOutlineIcon, ExpandLessIcon, ExpandMoreIcon, FlagOutlinedIcon,
  FullscreenIcon, InfoOutlinedIcon, PanelRightIcon, RefreshIcon, SettingsOutlinedIcon, ShieldOutlinedIcon,
} from "@/components/ui/icons";
import type { SaveStatus } from "@/hooks/useExamSaver";
import type { QuestionStatus } from "./QuestionNavigator";

// ── header ───────────────────────────────────────────────────────────────────────

export interface ExamHeaderProps {
  title: string;
  sectionTitle: string;
  sectionNumber: number;
  sectionCount: number;
  itemNumber: number;
  itemCount: number;
  marksLabel: string | null;
  timerLabel: string;
  timerLow: boolean;
  studentName: string | null;
  rollNo: string | null;
  fontScale: number;
  saveIndicator: React.ReactNode;
  panelOpen: boolean;
  onOpenInstructions: () => void;
  onOpenSettings: () => void;
  onTogglePanel: () => void;
}

/** One header for the whole exam: what and where you are, the time left, who is sitting it, and the few controls that matter. */
export function ExamHeader(p: ExamHeaderProps) {
  return (
    <Box component="header" sx={{ display: "flex", alignItems: "center", gap: 2, px: { xs: 1.5, md: 3 }, py: 1, minHeight: 64, bgcolor: "surfaceContainerLowest", borderBottom: "1px solid", borderColor: "outlineVariant", flexWrap: "wrap" }}>
      <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>{p.title}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" noWrap aria-label="Where you are in the exam">
          {p.sectionTitle} (section {p.sectionNumber} of {p.sectionCount}) <b aria-hidden>›</b> question {p.itemNumber} of {p.itemCount}
          {p.marksLabel ? ` (${p.marksLabel})` : ""}
        </Typography>
      </Box>

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
        {p.saveIndicator}
        <Stack direction="row" spacing={0.75} alignItems="center" role="timer" aria-label={`Time left ${p.timerLabel}`} sx={{ color: p.timerLow ? "error.main" : "text.primary" }}>
          <AccessTimeIcon fontSize="small" />
          <Typography component="span" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontWeight: 700, fontSize: "1.05rem" }}>{p.timerLabel}</Typography>
        </Stack>
        {(p.studentName || p.rollNo) && (
          <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
            <Typography variant="body2" fontWeight={600} noWrap>{p.studentName}</Typography>
            {p.rollNo && <Typography variant="caption" color="text.secondary">{p.rollNo}</Typography>}
          </Box>
        )}
        {p.fontScale !== 100 && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }}>Text {p.fontScale}%</Typography>}
        <Tooltip title="Instructions"><IconButton aria-label="Instructions" onClick={p.onOpenInstructions} size="small"><InfoOutlinedIcon /></IconButton></Tooltip>
        <Tooltip title="Settings"><IconButton aria-label="Settings" onClick={p.onOpenSettings} size="small"><SettingsOutlinedIcon /></IconButton></Tooltip>
        <Tooltip title={p.panelOpen ? "Hide the question panel" : "Show the question panel"}>
          <IconButton aria-label={p.panelOpen ? "Hide the question panel" : "Show the question panel"} aria-pressed={p.panelOpen} onClick={p.onTogglePanel} size="small"><PanelRightIcon /></IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

// ── save and connection state ─────────────────────────────────────────────────────

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "Saved 10:42:15", or what is happening instead. The point is that a student always knows their answers are safe. */
export function SaveIndicator({ status, lastSavedAt, pendingCount }: { status: SaveStatus; lastSavedAt: Date | null; pendingCount: number }) {
  let icon = <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />;
  let text = lastSavedAt ? `Saved ${clock(lastSavedAt)}` : "Answers save as you go";
  let color: string = "text.secondary";
  if (status === "saving") { icon = <RefreshIcon sx={{ fontSize: 16 }} />; text = "Saving…"; }
  if (status === "retrying") {
    icon = <CloudOffIcon sx={{ fontSize: 16, color: "warning.main" }} />;
    text = `Waiting for connection. ${pendingCount} answer${pendingCount === 1 ? "" : "s"} safe on this device`;
    color = "warning.main";
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" role="status" aria-live="polite" sx={{ color }}>
      {icon}
      <Typography variant="caption" sx={{ whiteSpace: "nowrap" }}>{text}</Typography>
    </Stack>
  );
}

// ── the one notice ───────────────────────────────────────────────────────────────

/**
 * At most ONE calm message under the header (never stacked, never spoken). Used for "you left fullscreen" and similar.
 */
export function ExamNotice({ text, showFullscreen, onFullscreen, onDismiss }: { text: string | null; showFullscreen: boolean; onFullscreen: () => void; onDismiss: () => void }) {
  if (!text) return null;
  return (
    <Box role="alert" sx={{ display: "flex", alignItems: "center", gap: 1.5, px: { xs: 1.5, md: 3 }, py: 0.75, bgcolor: "warningContainer", color: "onWarningContainer", borderBottom: "1px solid", borderColor: "outlineVariant" }}>
      <ShieldOutlinedIcon fontSize="small" />
      <Typography variant="body2" sx={{ flex: 1 }}>{text}</Typography>
      {showFullscreen && <Button size="small" variant="contained" startIcon={<FullscreenIcon />} onClick={onFullscreen}>Return to fullscreen</Button>}
      <IconButton size="small" aria-label="Dismiss" onClick={onDismiss} sx={{ color: "inherit" }}><CloseIcon fontSize="small" /></IconButton>
    </Box>
  );
}

// ── the question panel (palette) ─────────────────────────────────────────────────

export interface PaletteSection { id: string; title: string; type: "mcq" | "coding"; items: { id: string; status: QuestionStatus }[] }

const isAnswered = (s: QuestionStatus) => s === "answered" || s === "answered_marked";
const isMarked = (s: QuestionStatus) => s === "marked" || s === "answered_marked";

const STATUS_LABEL: Record<QuestionStatus, string> = {
  not_visited: "not visited", visited: "not answered", answered: "answered", marked: "not answered, marked for review", answered_marked: "answered, marked for review",
};

function Cell({ n, status, active, onClick, label }: { n: number; status: QuestionStatus; active: boolean; onClick: () => void; label: string }) {
  const answered = isAnswered(status);
  const notAnswered = status === "visited" || status === "marked";
  return (
    <Box
      component="button" type="button" onClick={onClick} aria-label={`${label}, ${STATUS_LABEL[status]}`} aria-current={active ? "true" : undefined}
      sx={{
        position: "relative", width: 44, height: 44, borderRadius: 1.5, cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: 14,
        border: "1.5px solid", borderColor: active ? "primary.main" : answered ? "success.main" : notAnswered ? "error.main" : "outlineVariant",
        bgcolor: answered ? "successContainer" : notAnswered ? "errorContainer" : "surfaceContainerHigh",
        color: answered ? "onSuccessContainer" : notAnswered ? "onErrorContainer" : "onSurfaceVariant",
        boxShadow: active ? "0 0 0 2px var(--mui-palette-primary-main)" : "none",
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      {n}
      {/* The state is also drawn as a shape, so it does not depend on telling red from green. */}
      {answered && <CheckCircleIcon aria-hidden sx={{ position: "absolute", top: 1, right: 1, fontSize: 13, color: "success.main" }} />}
      {notAnswered && <ErrorOutlineIcon aria-hidden sx={{ position: "absolute", top: 1, right: 1, fontSize: 13, color: "error.main" }} />}
      {isMarked(status) && <FlagOutlinedIcon aria-hidden sx={{ position: "absolute", bottom: 1, right: 1, fontSize: 12, color: "tertiary.main" }} />}
    </Box>
  );
}

function counts(items: { status: QuestionStatus }[]) {
  let answered = 0, notAnswered = 0, notVisited = 0;
  for (const it of items) { if (isAnswered(it.status)) answered += 1; else if (it.status === "not_visited") notVisited += 1; else notAnswered += 1; }
  return { answered, notAnswered, notVisited, total: items.length };
}

export interface ExamPaletteProps {
  sections: PaletteSection[];
  activeSectionId: string;
  activeItemId: string | null;
  timerLabel: string;
  timerLow: boolean;
  onJump: (sectionId: string, itemId: string) => void;
  onClose?: () => void;
}

/** The panel on the right: time, sections with how many are done, the numbered palette, and the overall tally. */
export function ExamPalette({ sections, activeSectionId, activeItemId, timerLabel, timerLow, onJump, onClose }: ExamPaletteProps) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const isOpen = (id: string) => open[id] ?? id === activeSectionId;
  const all = sections.flatMap((s) => s.items);
  const total = counts(all);

  return (
    <Box component="aside" aria-label="Question panel" sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "surfaceContainerLow", borderLeft: "1px solid", borderColor: "outlineVariant" }}>
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, color: timerLow ? "error.main" : "text.primary" }}>
          <AccessTimeIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>Time remaining</Typography>
          <Typography component="span" sx={{ ml: "auto", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{timerLabel}</Typography>
        </Stack>
        {onClose && <IconButton size="small" aria-label="Close the panel" onClick={onClose} sx={{ ml: 1 }}><CloseIcon fontSize="small" /></IconButton>}
      </Stack>

      <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
        <Stack spacing={1}>
          {sections.map((s) => {
            const c = counts(s.items);
            const expanded = isOpen(s.id);
            return (
              <Box key={s.id} sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, bgcolor: "surfaceContainerLowest", overflow: "hidden" }}>
                <Box
                  component="button" type="button" aria-expanded={expanded} onClick={() => setOpen((o) => ({ ...o, [s.id]: !expanded }))}
                  sx={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.25, cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
                >
                  <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{s.title}</Typography>
                  <Typography variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 999, bgcolor: "primaryContainer", color: "onPrimaryContainer", fontWeight: 700 }}>{c.answered}/{c.total}</Typography>
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </Box>
                {expanded && (
                  <Box sx={{ px: 1.5, pb: 1.5 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 1, mb: 1.25 }}>
                      {s.items.map((it, i) => (
                        <Cell key={it.id} n={i + 1} status={it.status} active={s.id === activeSectionId && it.id === activeItemId} onClick={() => onJump(s.id, it.id)} label={`${s.title} ${s.type === "coding" ? "problem" : "question"} ${i + 1}`} />
                      ))}
                    </Box>
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Typography variant="caption" color="success.main" fontWeight={600}>Answered {c.answered}</Typography>
                      <Typography variant="caption" color="error.main" fontWeight={600}>Not answered {c.notAnswered}</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>Not visited {c.notVisited}</Typography>
                    </Stack>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 2, px: 0.5 }} aria-label="What the symbols mean">
          <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} /> Answered</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><ErrorOutlineIcon sx={{ fontSize: 14, color: "error.main" }} /> Not answered</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><FlagOutlinedIcon sx={{ fontSize: 14, color: "tertiary.main" }} /> Marked for review</Typography>
          <Typography variant="caption" color="text.secondary">Plain = not visited</Typography>
        </Stack>
      </Box>

      <Box sx={{ borderTop: "1px solid", borderColor: "outlineVariant" }}>
        <Box
          component="button" type="button" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((v) => !v)}
          sx={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", px: 2, py: 1.25, cursor: "pointer", "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}
        >
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>Overall summary</Typography>
          {summaryOpen ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </Box>
        {summaryOpen && (
          <Stack direction="row" spacing={2} sx={{ px: 2, pb: 1.5 }} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="success.main" fontWeight={700}>Answered {total.answered}</Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>Not visited {total.notVisited}</Typography>
            <Typography variant="caption" color="error.main" fontWeight={700}>Not answered {total.notAnswered}</Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
