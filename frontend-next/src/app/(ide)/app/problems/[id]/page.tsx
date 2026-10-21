"use client";

import * as React from "react";
import NextLink from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import Drawer from "@mui/material/Drawer";
import ListItemIcon from "@mui/material/ListItemIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ArrowBackIcon, ChevronLeftIcon, ChevronRightIcon, PlayArrowOutlinedIcon, UploadOutlinedIcon, RestartAltOutlinedIcon, ExpandMoreIcon, ExpandLessIcon, CheckCircleOutlineIcon, CancelOutlinedIcon, LogoutIcon, PersonOutlineIcon, SmartToyOutlinedIcon, ContentCopyOutlinedIcon, CheckIcon, ShieldOutlinedIcon, FullscreenIcon } from "@/components/ui/icons";
import Alert from "@mui/material/Alert";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { pollUntilDone } from "@/lib/pollJudging";
import { useProctor } from "@/hooks/useProctor";
import { useClipboardGuard } from "@/hooks/useClipboardGuard";
import { FullscreenGraceModal } from "@/components/proctor/FullscreenGraceModal";
import { fireConfetti } from "@/components/feedback/confetti";
import { clearSession, getUser } from "@/lib/auth";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { TagChip } from "@/components/ui/TagChip";
import { ErrorState } from "@/components/ui/States";
import { AITutorSidebar, type FailingTest } from "@/components/problem/AITutorSidebar";
import { TimerWidget } from "@/components/problem/TimerWidget";
import { LearningPanel } from "@/components/problem/LearningPanel";
import { visualizeWhitespace } from "@/lib/whitespace";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import { PerformancePanel } from "@/components/problem/PerformancePanel";
import { ModuleProblemsMenu } from "@/components/problem/ModuleProblemsMenu";
import { darkScheme, lightScheme, radius } from "@/theme/tokens";
import type {
  ProblemDetail,
  ProblemLearning,
  AdjacentProblems,
  VerdictPayload,
  VerdictResult,
  ProblemHistoryEntry,
  JudgeError,
  JudgeErrorKind,
} from "@/lib/types";

// ── Monaco editor (client-only) ───────────────────────────────────────────────

type MonacoEditorInstance = Parameters<
  import("@monaco-editor/react").OnMount
>[0];
type MonacoNamespace = Parameters<import("@monaco-editor/react").OnMount>[1];

interface MarkerRange {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
  message: string;
}

// Parse Judge0 compile/runtime output into editor marker ranges (line-level),
// per language, so failures show as inline squiggles on the offending line.
function parseJudge0Markers(output: string, langName: string): MarkerRange[] {
  const markers: MarkerRange[] = [];
  if (!output) return markers;

  if (langName.startsWith("Python")) {
    const lineM = output.match(/line (\d+)/);
    const errM = output.match(
      /(SyntaxError|IndentationError|NameError|TypeError|ValueError|AttributeError|ImportError|ZeroDivisionError|RuntimeError)[:\s]*(.*)/,
    );
    if (lineM) {
      markers.push({
        startLineNumber: +lineM[1],
        endLineNumber: +lineM[1],
        startColumn: 1,
        endColumn: 1000,
        message: errM ? `${errM[1]}: ${errM[2].trim()}` : output.split("\n").slice(-2)[0]?.trim() || "Python error",
      });
    }
  } else if (langName === "C++") {
    const re = /[^\n:]*:(\d+):(\d+):\s*(?:fatal\s+)?error:\s*(.+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      markers.push({ startLineNumber: +m[1], endLineNumber: +m[1], startColumn: +m[2], endColumn: +m[2] + 1, message: m[3].trim() });
    }
  } else if (langName === "Java") {
    const re = /[^\n:]*:(\d+):\s*error:\s*(.+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      markers.push({ startLineNumber: +m[1], endLineNumber: +m[1], startColumn: 1, endColumn: 1000, message: m[2].trim() });
    }
  } else if (langName === "JavaScript") {
    const m = output.match(/:(\d+)/);
    if (m) {
      markers.push({ startLineNumber: +m[1], endLineNumber: +m[1], startColumn: 1, endColumn: 1000, message: output.split("\n")[0]?.trim() || "Runtime Error" });
    }
  }
  return markers;
}

// Serve Monaco from our own origin (public/monaco/vs, copied from node_modules by
// scripts/copy-monaco.mjs) instead of the default jsdelivr CDN — so the code editor
// works offline and on locked-down networks (e.g. the college server).
if (typeof window !== "undefined") {
  import("@monaco-editor/react").then(({ loader }) => {
    loader.config({ paths: { vs: "/monaco/vs" } });
  });
}

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
      <CircularProgress size={32} />
    </Box>
  ),
});

// VS Code-authentic editor themes: inherit the full Dark+/Light+ token palette from
// Monaco's built-in `vs-dark`/`vs` (so keywords/strings/types/etc. are properly
// coloured — the previous `theme="light"` was an invalid name and rendered as plain
// text) and only recolour the editor surface to match our M3 tokens.
function defineEditorThemes(monaco: MonacoNamespace) {
  monaco.editor.defineTheme("codementor-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": darkScheme.surfaceContainerLowest,
      "editorGutter.background": darkScheme.surfaceContainerLowest,
      "editor.lineHighlightBackground": darkScheme.surfaceContainerLow,
    },
  });
  monaco.editor.defineTheme("codementor-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": lightScheme.surfaceContainerLowest,
      "editorGutter.background": lightScheme.surfaceContainerLowest,
      "editor.lineHighlightBackground": lightScheme.surfaceContainerLow,
    },
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { id: 71, name: "Python 3.8", monaco: "python" },
  { id: 100, name: "Python 3.12", monaco: "python" },
  { id: 62, name: "Java",     monaco: "java" },
  { id: 54, name: "C++",      monaco: "cpp" },
  { id: 63, name: "JavaScript", monaco: "javascript" },
] as const;

type LangId = (typeof LANGUAGES)[number]["id"];

// Python 3.12 is offered only where a problem asks for it (the Python course); every other problem keeps
// the usual set, so nothing changes for existing problems.
function allowedLanguageIds(languages: number[] | null | undefined): number[] {
  if (languages && languages.length) return languages;
  return LANGUAGES.filter((l) => l.id !== 100).map((l) => l.id);
}

const LS_LANG   = "cm:lang";
const lsCode    = (pid: string, lid: number) => `cm:code:${pid}:${lid}`;

/** Problem limits are stored as milliseconds on older problems and whole seconds on newer ones. */
function formatLimit(t: number): string {
  const ms = t < 100 ? t * 1000 : t;
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}

function formatMs(secs: number): string {
  return secs < 1 ? `${Math.round(secs * 1000)} ms` : `${secs.toFixed(2)} s`;
}

function formatKb(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

function verdictBg(desc: string): { bg: string; fg: string } {
  if (desc === "Accepted") return { bg: "successContainer", fg: "onSuccessContainer" };
  if (desc === "Wrong Answer") return { bg: "errorContainer", fg: "onErrorContainer" };
  if (desc?.startsWith("Runtime")) return { bg: "errorContainer", fg: "onErrorContainer" };
  return { bg: "warningContainer", fg: "onWarningContainer" };
}

function initials(name?: string) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function ProblemMarkdown({ content, lesson = false }: { content: string; lesson?: boolean }) {
  return (
    <Box
      sx={{
        typography: "body2",
        lineHeight: 1.75,
        "& > :first-child": { mt: 0 },
        "& p": { mb: 1.75, lineHeight: 1.75 },
        "& ul, & ol": { pl: 3, mb: 2 },
        "& li": { mb: 0.75, lineHeight: 1.7 },
        // "Note:" / "Tip:" paragraphs stand out as a callout instead of disappearing into the text.
        "& .callout": {
          bgcolor: "surfaceContainerLow",
          borderLeft: "4px solid",
          borderColor: "primary.main",
          borderRadius: 1.5,
          px: 2,
          py: 1.25,
          mb: 2,
        },
        "& code": {
          fontFamily: "monospace",
          fontSize: "0.85em",
          bgcolor: "surfaceContainerHigh",
          color: "onSurface",
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
        },
        "& pre": {
          bgcolor: "surfaceContainerHighest",
          borderRadius: 2,
          p: 2,
          overflow: "auto",
          mb: 1.5,
          "& code": { bgcolor: "transparent", px: 0, py: 0 },
        },
        "& table": { width: "100%", borderCollapse: "collapse", mb: 1.5 },
        "& th, & td": { border: "1px solid", borderColor: "outlineVariant", px: 1.5, py: 0.75 },
        "& th": { bgcolor: "surfaceContainerHigh", fontWeight: 600 },
        "& blockquote": {
          bgcolor: "surfaceContainerLow",
          borderLeft: "4px solid",
          borderColor: "primary.main",
          borderRadius: 1.5,
          px: 2,
          py: 1.25,
          my: 2,
          "& p": { mb: 0 },
        },
        // In a lesson, **bold** marks a key term and is highlighted so the idea can be found at a glance.
        "& strong": lesson
          ? { fontWeight: 600, bgcolor: "primaryContainer", color: "onPrimaryContainer", px: 0.75, py: 0.125, borderRadius: 1 }
          : { fontWeight: 600 },
        // One heading style for every level: a statement is a list of sections (Input, Output, Constraints...),
        // not a document with a hierarchy, and the old h1/h2 sizes overpowered the problem itself.
        "& h1, & h2, & h3, & h4": {
          typography: "subtitle2",
          fontWeight: 700,
          mt: 3.5,
          mb: 1.25,
          pl: 1.25,
          borderLeft: "3px solid",
          borderColor: "primary.main",
          lineHeight: 1.4,
        },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => {
            const first = React.Children.toArray(children)[0];
            const callout = typeof first === "string" && /^\s*(Note|Tip|Important|Remember|Warning)\s*:/i.test(first);
            return callout ? <p className="callout">{children}</p> : <p>{children}</p>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
}

// ── Test case result row ──────────────────────────────────────────────────────

function TestCaseRow({
  index,
  result,
  hideErrorText,
}: {
  index: number;
  result: VerdictResult["test_case_results"][number];
  /** The terminal panel above already shows this compiler output verbatim. */
  hideErrorText?: boolean;
}) {
  const [open, setOpen] = React.useState(index === 0);
  const [showWs, setShowWs] = React.useState(false);
  const passed = result.passed;

  return (
    <Box sx={{ border: "1px solid", borderColor: passed ? "successContainer" : "errorContainer", borderRadius: 2, overflow: "hidden" }}>
      <Box
        component="button"
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          px: 1.5,
          py: 1,
          bgcolor: passed ? "successContainer" : "errorContainer",
          color: passed ? "onSuccessContainer" : "onErrorContainer",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          {passed ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
          ) : (
            <CancelOutlinedIcon sx={{ fontSize: 16 }} />
          )}
          <Typography variant="caption" fontWeight={600}>
            Test case {index + 1} — {result.status.description}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {formatMs(result.time)} · {formatKb(result.memory)}
          </Typography>
          {open ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
        </Stack>
      </Box>
      <Collapse in={open}>
        <Box sx={{ p: 1.5, bgcolor: "surfaceContainerLowest" }}>
          {(result.is_public && result.expected != null) || result.stdout ? (
            <FormControlLabel
              sx={{ m: 0, mb: 0.5 }}
              control={<Switch size="small" checked={showWs} onChange={(e) => setShowWs(e.target.checked)} />}
              label={<Typography variant="caption" color="text.secondary">Show spaces and line ends (· for a space, ↵ for a new line)</Typography>}
            />
          ) : null}
          {result.is_public && result.input != null && (
            <TestIOBlock label="Input" value={result.input} showWhitespace={showWs} />
          )}
          {result.is_public && result.expected != null && (
            <TestIOBlock label="Expected" value={result.expected} showWhitespace={showWs} />
          )}
          {result.stdout && (
            <TestIOBlock label="Your output" value={result.stdout} highlight={!passed} showWhitespace={showWs} />
          )}
          {!hideErrorText && (result.stderr || result.compile_output || result.message) && (
            <TestIOBlock
              label="Error"
              value={result.compile_output || result.stderr || result.message}
              isError
            />
          )}
          {!result.is_public && (
            <Typography variant="caption" color="text.secondary">
              Hidden test case — input / expected output not shown.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Results summary: timing + shown/hidden pass counts (CodeTantra-style) ──────

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ px: 1.5, py: 1, border: "1px solid", borderColor: "outlineVariant", borderRadius: 1.5, minWidth: 96 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

function ResultsSummary({ result }: { result: VerdictResult }) {
  const theme = useTheme();
  const sparkColor = theme.palette.mode === "dark" ? darkScheme.primary : lightScheme.primary;
  const cases = result.test_case_results;
  if (cases.length === 0) return null;
  const timesMs = cases.map((c) => Math.max(0, Math.round(c.time * 1000)));
  const max = timesMs.length ? Math.max(...timesMs) : 0;
  const avg = result.avg_time != null
    ? Math.round(result.avg_time * 1000)
    : (timesMs.length ? Math.round(timesMs.reduce((a, b) => a + b, 0) / timesMs.length) : 0);

  // Totals come from the server, which counted the test cases before judging.
  // Counting them from the results array undercounts: ACM scoring stops at the
  // first failure, so cases that never ran aren't in it — which is how this
  // reported "2 of 2 hidden passed" when four hidden cases were never reached.
  const shownTotal = result.public_total ?? cases.filter((c) => c.is_public).length;
  const hiddenTotal = result.hidden_total ?? cases.filter((c) => !c.is_public).length;
  const shownPassed = result.public_passed ?? cases.filter((c) => c.is_public && c.passed).length;
  const hiddenPassed = result.hidden_passed ?? cases.filter((c) => !c.is_public && c.passed).length;

  const countChip = (passed: number, total: number, label: string) => {
    const all = total > 0 && passed === total;
    return (
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          bgcolor: all ? "successContainer" : "errorContainer",
          color: all ? "onSuccessContainer" : "onErrorContainer",
        }}
      >
        {all ? <CheckCircleOutlineIcon fontSize="small" /> : <CancelOutlinedIcon fontSize="small" />}
        <Typography variant="body2" fontWeight={600}>
          {passed} of {total} {label} passed
        </Typography>
      </Box>
    );
  };

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
      {shownTotal > 0 && countChip(shownPassed, shownTotal, "shown test case" + (shownTotal === 1 ? "" : "s"))}
      {hiddenTotal > 0 && countChip(hiddenPassed, hiddenTotal, "hidden test case" + (hiddenTotal === 1 ? "" : "s"))}
      <SummaryCard label="Average time">
        <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace" }}>
          {avg} ms
        </Typography>
      </SummaryCard>
      <SummaryCard label="Maximum time">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace" }}>
            {max} ms
          </Typography>
          {timesMs.length > 1 && (
            <Box sx={{ width: 56, height: 24 }} aria-hidden>
              <Sparkline data={timesMs} height={24} width={56} color={sparkColor} />
            </Box>
          )}
        </Stack>
      </SummaryCard>
    </Stack>
  );
}

const ERROR_HEADING: Record<JudgeErrorKind, string> = {
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit: "Time limit exceeded",
  memory_limit: "Memory limit exceeded",
  wrong_answer: "Wrong answer",
};

/**
 * Compiler and runtime output, shown the way a terminal shows it: monospaced,
 * on a dark surface, in the tool's own words. The previous presentation folded
 * it into a collapsed test-case row, which buried the one thing a student needs
 * when their code doesn't build.
 */
function ErrorTerminal({ error, onGoToLine }: { error: JudgeError; onGoToLine: (line: number) => void }) {
  if (!error.text && error.line == null) return null;

  return (
    <Box
      sx={{
        mb: 1.5,
        borderRadius: radius.sm,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "error.main",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.5, py: 0.75, bgcolor: "errorContainer", color: "onErrorContainer" }}
      >
        <CancelOutlinedIcon fontSize="small" />
        <Typography variant="caption" fontWeight={700}>
          {ERROR_HEADING[error.kind]}
        </Typography>
        {error.line != null && (
          <Button
            size="small"
            onClick={() => onGoToLine(error.line as number)}
            sx={{ minHeight: 0, py: 0, color: "inherit", textDecoration: "underline" }}
          >
            line {error.line}
          </Button>
        )}
      </Stack>
      {error.text && (
        <Box
          component="pre"
          sx={{
            m: 0,
            px: 1.5,
            py: 1,
            // Terminal output is dark in both themes on purpose: it is the
            // compiler's console, not part of the page's surface.
            bgcolor: "#1b1b1f",
            color: "#ff9d9d",
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.75rem",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {error.text}
        </Box>
      )}
    </Box>
  );
}

function TestIOBlock({
  label,
  value,
  highlight,
  isError,
  showWhitespace,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isError?: boolean;
  showWhitespace?: boolean;
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          borderRadius: 1.5,
          bgcolor: isError ? "errorContainer" : highlight ? "warningContainer" : "surfaceContainerHigh",
          color: isError ? "onErrorContainer" : highlight ? "onWarningContainer" : "text.primary",
          fontFamily: "monospace",
          fontSize: "0.8rem",
          // Program output keeps its exact layout (banners, centred lines) and scrolls sideways; only error text wraps.
          whiteSpace: isError ? "pre-wrap" : "pre",
          wordBreak: isError ? "break-all" : "normal",
          maxHeight: 220,
          overflow: "auto",
        }}
      >
        {value ? (showWhitespace ? visualizeWhitespace(value) : value) : "(empty)"}
      </Box>
    </Box>
  );
}

// ── IDE Top Header ────────────────────────────────────────────────────────────

function IDEHeader({
  problem,
  problemId,
  adjacent,
  submitting,
  running,
  solved,
  onRun,
  onSubmit,
  showAI,
  onToggleAI,
  examId,
  proctored,
  navContext,
}: {
  problem: ProblemDetail | null;
  problemId: string;
  adjacent: AdjacentProblems | null;
  submitting: boolean;
  running: boolean;
  solved: boolean;
  onRun: () => void;
  onSubmit: () => void;
  showAI: boolean;
  onToggleAI: () => void;
  /** Exam or proctored assignment — gives the clock prominence. */
  proctored: boolean;
  /** Query string that keeps prev/next inside the current module or assignment. */
  navContext: string;
  /** Present while solving a problem inside a live exam — hides catalog-wide
   * navigation (logo, prev/next) so a student can't browse away to the other
   * ~77 problems mid-exam. See exam.controller.js#markVisited, which already
   * enforces this same per-section allowlist server-side. */
  examId?: string | null;
}) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const user = React.useMemo(() => getUser(), []);

  // Where "back" goes: the course (and module) the student opened this problem from, else the assignment list, else
  // the screen they were just on. Never the home page.
  const ctx = React.useMemo(() => new URLSearchParams(navContext), [navContext]);
  const courseId = ctx.get("course");
  const moduleId = ctx.get("module");
  const backHref = courseId
    ? `/app/courses/${courseId}${moduleId ? `?module=${moduleId}` : ""}`
    : ctx.get("assignment") ? "/app/assignments" : null;
  const backLabel = courseId ? "Back to the course" : ctx.get("assignment") ? "Back to assignments" : "Back";
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/app/problems");
  };

  const handleSignOut = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <Box
      component="header"
      sx={{
        height: 60,
        display: "flex",
        alignItems: "center",
        px: 1.5,
        gap: 1,
        borderBottom: "1px solid",
        borderColor: "outlineVariant",
        bgcolor: "surface",
        flexShrink: 0,
        // Every element here was a fixed-size flex child with nothing allowed
        // to shrink or hide, so on a real phone width the row simply overran
        // its container and clipped Submit + the avatar off-screen instead of
        // wrapping or truncating. overflowX is a safety net on top of the
        // narrow-width hides below — nothing should ever be unreachable.
        overflowX: "auto",
      }}
    >
      {/* Back — to the course this problem belongs to (not home). Hidden during a live exam so a student can't
          browse away mid-sitting. */}
      {!examId && (
        <Tooltip title={backLabel}>
          {backHref ? (
            <IconButton component={NextLink} href={backHref} aria-label={backLabel} size="small" sx={{ flexShrink: 0 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          ) : (
            <IconButton onClick={goBack} aria-label={backLabel} size="small" sx={{ flexShrink: 0 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          )}
        </Tooltip>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, flexShrink: 0 }} />

      {/* Prev / Next — hidden during a live exam for the same reason: they
          walk the entire catalog via /api/problems/:id/adjacent, which has
          no exam/section awareness at all. */}
      {!examId && (
        <>
          <Tooltip title="Previous problem">
            <span>
              <IconButton
                component={NextLink}
                href={adjacent?.prev ? `/app/problems/${adjacent.prev}${navContext}` : "#"}
                aria-label="Previous problem"
                size="small"
                disabled={!adjacent?.prev}
                sx={{ flexShrink: 0 }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Next problem">
            <span>
              <IconButton
                component={NextLink}
                href={adjacent?.next ? `/app/problems/${adjacent.next}${navContext}` : "#"}
                aria-label="Next problem"
                size="small"
                disabled={!adjacent?.next}
                sx={{ flexShrink: 0 }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </>
      )}

      {/* Where you are, then what you are solving. The small line names the module and the position in it (and opens the
          list of that module's problems); the title under it is the thing to read. minWidth:0 is required for a flex
          item to shrink and ellipsis instead of forcing the row wider than the viewport. */}
      <Box sx={{ flex: 1, minWidth: 0, mx: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0.125 }}>
        {!examId && adjacent?.context && (
          <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 0 }}>
            {courseId ? (
              <ModuleProblemsMenu
                courseId={courseId}
                moduleId={moduleId}
                problemId={problemId}
                label={adjacent.context}
                position={adjacent.position}
                total={adjacent.total}
                navContext={navContext}
                solvedNow={solved}
              />
            ) : (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontWeight: 600, display: "block" }}>
                {adjacent.context}
                <Box component="span" sx={{ opacity: 0.75, fontWeight: 500 }}>{`  ·  ${adjacent.position} / ${adjacent.total}`}</Box>
              </Typography>
            )}
          </Box>
        )}
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            component="h1"
            fontWeight={700}
            noWrap
            sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}
          >
            {problem?.title ?? "Loading…"}
          </Typography>
          {problem?.difficulty && (
            <Box sx={{ flexShrink: 0, display: { xs: "none", md: "block" } }}>
              <DifficultyChip difficulty={problem.difficulty} />
            </Box>
          )}
        </Stack>
      </Box>

      {/* Timer. Under proctoring it stays visible even on a phone and is given
          real weight — the clock is the thing that matters in a sitting.
          In ordinary practice it's a quiet chip and hides on narrow screens. */}
      <Box sx={{ mr: 0.5, flexShrink: 0, display: proctored ? "block" : { xs: "none", sm: "block" } }}>
        <TimerWidget key={problemId} problemId={problemId} solved={solved} prominent={proctored} />
      </Box>

      {/* Run */}
      <Button
        variant="outlined"
        size="small"
        startIcon={running ? <CircularProgress size={14} /> : <PlayArrowOutlinedIcon />}
        onClick={onRun}
        disabled={submitting || running}
        sx={{ minWidth: 70, flexShrink: 0 }}
      >
        Run
      </Button>

      {/* Submit */}
      <Button
        variant="contained"
        size="small"
        startIcon={submitting ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : <UploadOutlinedIcon />}
        onClick={onSubmit}
        disabled={submitting || running}
        sx={{ minWidth: 88, flexShrink: 0 }}
      >
        {submitting ? "Judging…" : "Submit"}
      </Button>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, flexShrink: 0 }} />

      {/* AI Tutor toggle */}
      <Tooltip title={showAI ? "Hide AI Tutor" : "Ask the AI Tutor"}>
        <IconButton
          size="small"
          onClick={onToggleAI}
          aria-label="Toggle AI Tutor"
          aria-pressed={showAI}
          sx={{
            flexShrink: 0,
            color: showAI ? "var(--mui-palette-ai)" : "text.secondary",
            bgcolor: showAI ? "color-mix(in srgb, var(--mui-palette-ai) 14%, transparent)" : "transparent",
          }}
        >
          <SmartToyOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* User avatar */}
      <IconButton
        size="small"
        aria-label="Account menu"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ flexShrink: 0 }}
      >
        <Avatar sx={{ width: 28, height: 28, bgcolor: "primary.main", color: "primary.contrastText", fontSize: 12 }}>
          {initials(user?.name)}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem component={NextLink} href="/app/profile" onClick={() => setAnchorEl(null)}>
          <ListItemIcon><PersonOutlineIcon fontSize="small" /></ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </Box>
  );
}

// ── Submission history entry ──────────────────────────────────────────────────

function historyLangName(langId: number): string {
  return LANGUAGES.find((l) => l.id === langId)?.name ?? `Language ${langId}`;
}

// ── Example input/output block ────────────────────────────────────────────────

/** A labelled monospace pane for an example's Input/Output, with an optional copy button. */
function ExampleIO({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = React.useState<number | "all" | null>(null);
  const copyText = (text: string, which: number | "all") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const lines = value.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </Typography>
        {copyable && (
          <Tooltip title={copied === "all" ? "Copied" : lines.length > 1 ? "Copy all lines" : "Copy"}>
            <IconButton size="small" onClick={() => copyText(value, "all")} aria-label={`Copy ${label.toLowerCase()}`} sx={{ p: 0.25 }}>
              {copied === "all" ? <CheckIcon sx={{ fontSize: 14, color: "success.main" }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {/* One row per line, each with its own copy button, so a single input line can be pasted into the terminal. */}
      <Box sx={{ bgcolor: "surfaceContainerHighest", borderRadius: 1, py: 0.5, px: 0.5, overflow: "auto" }}>
        {value === "" ? (
          <Typography variant="caption" color="text.disabled" sx={{ px: 0.75, py: 0.5, display: "block" }}>(empty)</Typography>
        ) : (
          lines.map((line, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 0.5,
                px: 0.75,
                borderRadius: 0.75,
                minWidth: "max-content",
                width: "100%",
                "&:hover, &:focus-within": { bgcolor: "surfaceContainerHigh" },
                "&:hover .line-copy, &:focus-within .line-copy": { opacity: 1 },
              }}
            >
              <Box
                component="span"
                // Monospace and never wrapped: a banner or a centred line is made of exact spaces, and a proportional or
                // wrapped line misaligns it. The box scrolls sideways instead. (typography first: it would reset the font.)
                sx={{ flex: 1, typography: "caption", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: 1.7, whiteSpace: "pre" }}
              >
                {line === "" ? " " : line}
              </Box>
              {lines.length > 1 && copyable && (
                <IconButton
                  className="line-copy"
                  size="small"
                  onClick={() => copyText(line, i)}
                  aria-label={`Copy line ${i + 1} of ${label.toLowerCase()}`}
                  sx={{ p: 0.25, opacity: 0, transition: "opacity 120ms", mt: 0.25 }}
                >
                  {copied === i ? <CheckIcon sx={{ fontSize: 13, color: "success.main" }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 13 }} />}
                </IconButton>
              )}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type OutputTab = "testcases" | "custom";
type PanelTab  = "description" | "help" | "submissions";

export default function ProblemSolvingPage() {
  const params  = useParams<{ id: string }>();
  const problemId = params.id;
  const router = useRouter();
  const theme   = useTheme();
  const isDark  = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  // ── Assignment / contest / exam / proctor context (from the query string) ──
  // Read once from window.location so we avoid a Suspense boundary for useSearchParams.
  const [searchParams] = React.useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams(),
  );
  const assignmentId = searchParams.get("assignment");
  const contestId = searchParams.get("contest");
  // A coding section's "Solve this problem" deep-link — ?exam=<id>&section=<id>,
  // mirroring the assignment/contest pattern above. Proctoring covers the WHOLE
  // exam (decision D3), so it's active here without needing a separate ?proctor=1
  // flag the way exam-assignment proctoring requires.
  const examId = searchParams.get("exam");
  const examSectionId = searchParams.get("section");
  const proctored = (!!assignmentId && searchParams.get("proctor") === "1") || !!examId;
  // Clipboard is locked for ALL problem solving, not only proctored work: this
  // page is the course/practice problem screen, and the sandbox exists for
  // free experimentation where pasting your own code is fine.
  const [editorContainer, setEditorContainer] = React.useState<HTMLDivElement | null>(null);

  // ── Judging lifecycle refs (avoid stale closures / poll leaks) ──
  const cancelPollRef = React.useRef<(() => void) | null>(null);
  const pendingRef = React.useRef(false);
  const autoSubmitRef = React.useRef<() => void>(() => {});

  // ── Data state ──
  const [problem,   setProblem]   = React.useState<ProblemDetail | null>(null);
  const [adjacent,  setAdjacent]  = React.useState<AdjacentProblems | null>(null);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState(false);

  // ── Editor state ──
  const [langId, setLangId] = React.useState<LangId>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_LANG) : null;
    return (saved ? Number(saved) : 71) as LangId;
  });
  const [code, setCode] = React.useState<string>("");
  const [fontSize, setFontSize] = React.useState(14);
  const editorRef = React.useRef<MonacoEditorInstance | null>(null);
  const monacoRef = React.useRef<MonacoNamespace | null>(null);

  // Jumps the editor to the line the compiler complained about.
  const goToLine = React.useCallback((line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, []);

  // ── Submission state ──
  const [submitting,  setSubmitting]  = React.useState(false);
  const [running,     setRunning]     = React.useState(false);
  const [verdict,     setVerdict]     = React.useState<VerdictPayload | null>(null);
  const [outputOpen,  setOutputOpen]  = React.useState(false);
  const [outputTab,   setOutputTab]   = React.useState<OutputTab>("testcases");
  const [customInput, setCustomInput] = React.useState("");

  // ── Panel / tab state ──
  const [panelTab, setPanelTab] = React.useState<PanelTab>("description");
  const [learning, setLearning] = React.useState<ProblemLearning | null>(null);
  const [learningLoading, setLearningLoading] = React.useState(false);
  const [history, setHistory]   = React.useState<ProblemHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // ── AI Tutor ──
  const [showAI, setShowAI] = React.useState(false);
  const [tutorContext, setTutorContext] = React.useState<string | undefined>(undefined);

  // ── Solved state (stops the timer, celebrates) + mobile panel toggle ──
  const [solved, setSolved] = React.useState(false);
  const [mobilePane, setMobilePane] = React.useState<"problem" | "code">("problem");

  // Draggable divider between the problem and the editor; the width is remembered.
  const splitRef = React.useRef<HTMLDivElement | null>(null);
  const [leftPct, setLeftPct] = React.useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("cm:split"));
      return saved >= 25 && saved <= 70 ? saved : 45;
    } catch {
      return 45;
    }
  });
  const setSplit = React.useCallback((pct: number) => {
    const clamped = Math.min(70, Math.max(25, pct));
    setLeftPct(clamped);
    try {
      localStorage.setItem("cm:split", String(Math.round(clamped * 10) / 10));
    } catch {
      /* the divider still works for this visit */
    }
  }, []);
  const onSplitDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = splitRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => setSplit(((ev.clientX - rect.left) / rect.width) * 100);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Timer (session + Pomodoro) lives in <TimerWidget>, keyed by problemId + solved.

  // Which list the arrows should walk, taken from the link that opened this page.
  const navContext = React.useMemo(() => {
    const course = searchParams.get("course");
    const moduleId = searchParams.get("module");
    if (course && moduleId) return `?course=${encodeURIComponent(course)}&module=${encodeURIComponent(moduleId)}`;
    if (assignmentId) return `?assignment=${encodeURIComponent(assignmentId)}`;
    return "";
  }, [searchParams, assignmentId]);

  // ── Load problem + adjacent ──
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    // Reset per-problem state when navigating between problems (the page
    // component is reused across param changes, so state would otherwise leak).
    setSolved(false);
    setVerdict(null);
    setMobilePane("problem");
    Promise.allSettled([
      api.get<{ success: boolean; data: ProblemDetail }>(`/api/problems/${problemId}`),
      // Context (module or assignment) makes prev/next follow the list the
      // student is actually working through, not the whole catalogue.
      api.get<{ success: boolean; data: AdjacentProblems }>(
        `/api/problems/${problemId}/adjacent${navContext}`,
      ),
    ]).then(([probRes, adjRes]) => {
      if (!active) return;
      if (probRes.status === "rejected") { setError(true); setLoading(false); return; }
      const prob = probRes.value.data.data;
      setProblem(prob);
      if (adjRes.status === "fulfilled") setAdjacent(adjRes.value.data.data);

      // Load saved code or stub
      // Use a language this problem accepts (the saved one may be Java on a Python-only course problem,
      // or Python 3.12 left over from the course on an ordinary problem).
      const allowed = allowedLanguageIds(prob.languages);
      const useLang = (allowed.includes(langId) ? langId : allowed[0]) as LangId;
      if (useLang !== langId) setLangId(useLang);
      const saved = localStorage.getItem(lsCode(problemId, useLang));
      setCode(saved ?? prob.stubs?.[String(useLang)] ?? "");
      setLoading(false);
    });
    return () => { active = false; };
  }, [problemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hints, goal and (once solved) the reference solution ──
  // Off during an exam or a proctored assignment: hints are help, like the AI tutor.
  const helpEnabled = !proctored;
  const loadLearning = React.useCallback(async () => {
    setLearningLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: ProblemLearning }>(`/api/student/problems/${problemId}/learning`);
      setLearning(res.data.data);
    } catch {
      setLearning(null);
    } finally {
      setLearningLoading(false);
    }
  }, [problemId]);

  React.useEffect(() => {
    setLearning(null);
    if (helpEnabled) loadLearning();
  }, [problemId, helpEnabled, loadLearning]);

  // The answer unlocks the moment the problem is solved, without a reload.
  React.useEffect(() => {
    if (solved && helpEnabled) loadLearning();
  }, [solved]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasHelp = !!learning && (learning.hints.length > 0 || learning.has_solution || learning.has_complexity || !!learning.objective);

  // ── Language switch ──
  React.useEffect(() => {
    if (!problem) return;
    const saved = localStorage.getItem(lsCode(problemId, langId));
    setCode(saved ?? problem.stubs?.[String(langId)] ?? "");
    localStorage.setItem(LS_LANG, String(langId));
  }, [langId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Code autosave (on change) ──
  const handleCodeChange = React.useCallback((val: string | undefined) => {
    const v = val ?? "";
    setCode(v);
    localStorage.setItem(lsCode(problemId, langId), v);
  }, [problemId, langId]);

  // ── Load submission history (lazy) ──
  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: ProblemHistoryEntry[] }>(
        `/api/submit/history/${problemId}`
      );
      setHistory(res.data.data ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [problemId]);

  // Only accepted work is shown back to the student; see the panel below.
  const acceptedHistory = React.useMemo(
    () => history.filter((h) => h.verdict === "Accepted"),
    [history],
  );

  const handlePanelTab = (_: React.SyntheticEvent, val: PanelTab) => {
    setPanelTab(val);
    if (val === "submissions" && history.length === 0 && !historyLoading) {
      loadHistory();
    }
  };

  // ── Verdict handler (invoked once polling resolves) ──
  const handleVerdict = React.useCallback((payload: VerdictPayload) => {
    pendingRef.current = false;
    setVerdict(payload);
    setSubmitting(false);
    setRunning(false);
    setOutputOpen(true);
    // A plain Run belongs on the Terminal tab (raw stdout/stderr against
    // custom input, not graded) — only a real Submit result should land on
    // Test cases. Previously this always forced "testcases", so a Run's
    // single ungraded result rendered through the pass/fail test-case UI
    // (undefined pass counts, a red "Accepted" row) whenever its callback
    // resolved after the tab had been switched.
    setOutputTab(payload.result?.custom_run ? "custom" : "testcases");
    const r = payload.result;
    // A sample-only Run never creates a submission record, so there's nothing
    // for the Submissions tab to refresh, and — critically — it must never
    // mark the problem solved or celebrate: passing the 1-2 visible examples
    // is not proof the hidden test cases pass too.
    if (panelTab === "submissions" && !r?.sample_only) loadHistory();
    if (r && !r.custom_run && !r.sample_only && r.verdict?.description === "Accepted") {
      // Celebrate + stop the timer (Peak-End Rule).
      setSolved(true);
      fireConfetti();
    } else if (r && !r.custom_run && r.verdict?.description && r.verdict.description !== "Accepted") {
      // Nudge the AI tutor toward debugging when a run or submission fails.
      // A sample-only Run has no submission_id to key off, so fall back to a
      // timestamp — this only needs to change on every failure, not be stable.
      setTutorContext(`${r.submission_id ?? Date.now()}:${r.verdict.id}`);
    }
  }, [panelTab, loadHistory]);

  // ── Execute (Run against samples, Submit for real, or a custom-input Terminal run) ──
  const execute = React.useCallback(
    async (mode: "submit" | "run" | "custom") => {
      if (!problem) return;
      if (pendingRef.current) return; // guard against concurrent run/submit (avoids 429)
      const currentCode = code;
      if (!currentCode.trim()) return;

      // Tear down any in-flight judging before starting a new one.
      if (cancelPollRef.current) { cancelPollRef.current(); cancelPollRef.current = null; }
      pendingRef.current = true;

      if (mode === "submit") setSubmitting(true);
      else setRunning(true);
      setVerdict(null);

      const settle = () => {
        pendingRef.current = false;
        if (cancelPollRef.current) { cancelPollRef.current(); cancelPollRef.current = null; }
      };

      try {
        const body: Record<string, unknown> = {
          source_code: currentCode,
          language_id: langId,
          problem_id: problem.id,
        };
        if (mode === "custom") body.custom_input = customInput;
        if (mode === "run") body.run_mode = "sample";
        // Attach assignment / contest / exam context so the submission is recorded against them.
        if (assignmentId) body.assignment_id = assignmentId;
        if (contestId) body.contest_id = contestId;
        if (examId) body.exam_id = examId;
        if (examSectionId) body.section_id = examSectionId;

        const res = await api.post<{ success: boolean; jobId?: string; error?: string }>("/api/submit", body);
        if (!res.data.success || !res.data.jobId) {
          setVerdict({ success: false, state: "failed", error: res.data.error ?? "Submission failed" });
          setOutputOpen(true);
          setSubmitting(false);
          setRunning(false);
          settle();
          return;
        }

        const jobId = res.data.jobId;
        cancelPollRef.current = pollUntilDone<VerdictPayload>(jobId, (payload) => {
          settle();
          handleVerdict(payload);
        });
      } catch (e) {
        // The judge returns 503 with a precise reason ("unreachable" vs
        // "overloaded"), and axios throws on it — so this branch, not the
        // !success branch above, is where that message has to be surfaced.
        // Reporting a blanket "check your connection" sent people hunting a
        // network fault when the judge was simply down.
        setVerdict({
          success: false,
          state: "failed",
          error: apiErrorMessage(e, "Could not reach the server. Please check your connection."),
        });
        setSubmitting(false);
        setRunning(false);
        setOutputOpen(true);
        settle();
      }
    },
    [problem, code, langId, customInput, assignmentId, contestId, examId, examSectionId, handleVerdict]
  );

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) execute("submit");
        else execute("run");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [execute]);

  // Keep the auto-submit ref pointed at the latest submit for the proctor hook.
  React.useEffect(() => {
    autoSubmitRef.current = () => execute("submit");
  }, [execute]);

  // Stop polling for a verdict when leaving the page.
  React.useEffect(
    () => () => {
      if (cancelPollRef.current) cancelPollRef.current();
    },
    [],
  );

  // Repeated fullscreen violations while sitting an Exam finish the WHOLE exam,
  // not just this one coding submission — unlike the exam-assignment path,
  // there's no attempt to also flush the in-progress code first (that would
  // need execute() to resolve before this fires, which it can't cheaply do
  // from a fire-and-forget poll callback); the student's last explicit Submit
  // for this problem, if any, already reconciled via the exam_id on execute().
  const examAutoSubmitRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    examAutoSubmitRef.current = () => {
      api.post(`/api/exams/${examId}/submit`, {}).catch(() => {
        // Already submitted (a race with a manual Finish) or a transient
        // error — either way, still navigate back to show the student where
        // they stand.
      }).finally(() => router.push(`/app/exams/${examId}`));
    };
  }, [examId, router]);

  // ── Proctored-exam monitor (assignment ?proctor=1, or any exam coding section) ──
  const proctor = useProctor({
    active: proctored,
    assignmentId,
    examId,
    problemId,
    onAutoSubmit: () => (examId ? examAutoSubmitRef.current() : autoSubmitRef.current()),
  });

  // Clipboard lock on the editor itself. Always on here — this is assessed or
  // course practice; the sandbox is the place for pasting your own code.
  useClipboardGuard({
    active: true,
    container: editorContainer,
    examId,
    assignmentId,
    problemId,
  });

  // Reflect Judge0 compile/runtime errors as inline editor markers (cleared on
  // the next run when `verdict` resets to null).
  React.useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const r = verdict?.result;
    const firstFail = r && !r.custom_run ? r.test_case_results.find((t) => !t.passed) : undefined;
    const errOut = firstFail ? firstFail.compile_output || firstFail.stderr || "" : "";
    const langName = LANGUAGES.find((l) => l.id === langId)?.name ?? "";
    const ranges = errOut ? parseJudge0Markers(errOut, langName) : [];
    monaco.editor.setModelMarkers(
      model,
      "judge0",
      ranges.map((rg) => ({ ...rg, severity: monaco.MarkerSeverity.Error })),
    );
  }, [verdict, langId]);

  // ── Reset code ──
  const resetCode = () => {
    const stub = problem?.stubs?.[String(langId)] ?? "";
    setCode(stub);
    localStorage.removeItem(lsCode(problemId, langId));
  };

  const lang = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
  const verdictResult = verdict?.result;
  const verdictDesc = verdictResult?.verdict?.description ?? (verdict?.error ? "Error" : null);
  const { bg: vBg, fg: vFg } = verdictDesc ? verdictBg(verdictDesc) : { bg: "", fg: "" };

  // First failing test case → context for the AI tutor (hidden cases withhold I/O).
  const failingTest: FailingTest | null = React.useMemo(() => {
    if (!verdictResult || verdictResult.custom_run) return null;
    const fail = verdictResult.test_case_results.find((r) => !r.passed);
    if (!fail) return null;
    return {
      input: fail.input,
      expected: fail.expected,
      output: fail.stdout ?? "",
      hidden: !fail.is_public,
    };
  }, [verdictResult]);

  // ── Loading state ──
  if (loading) {
    return (
      <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
        {/* Header skeleton */}
        <Box sx={{ height: 52, borderBottom: "1px solid", borderColor: "outlineVariant", px: 2, display: "flex", alignItems: "center", gap: 2 }}>
          <Skeleton width={100} />
          <Box sx={{ flex: 1 }} />
          <Skeleton width={60} height={36} />
          <Skeleton width={80} height={36} />
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "45fr 55fr" }, flex: 1, overflow: "hidden" }}>
          {/* Left skeleton */}
          <Box sx={{ p: 3, overflow: "auto" }}>
            <Skeleton width="60%" height={32} sx={{ mb: 1 }} />
            <Skeleton width={80} sx={{ mb: 2 }} />
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} sx={{ mb: 0.75 }} />)}
          </Box>
          {/* Right skeleton */}
          <Box sx={{ borderLeft: "1px solid", borderColor: "outlineVariant", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        </Box>
      </Box>
    );
  }

  if (error || !problem) {
    return (
      <Box sx={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
        <ErrorState
          title="Problem not found"
          description="This problem may have been removed or you don't have access."
          onRetry={() => { setError(false); setLoading(true); window.location.reload(); }}
        />
      </Box>
    );
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // ── Render ──
  return (
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      {/* No clipboard banner: paste is blocked silently (see useClipboardGuard).
          The attempt is still logged for faculty. */}
      {proctored && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: "secondaryContainer",
            color: "onSecondaryContainer",
            borderBottom: "1px solid",
            borderColor: "outlineVariant",
            flexShrink: 0,
          }}
        >
          <ShieldOutlinedIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>Proctored Exam</Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            Stay in fullscreen and don&apos;t switch tabs — this session is proctored.
          </Typography>
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
            {!proctor.fullscreen && (
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<FullscreenIcon />}
                onClick={proctor.requestFullscreen}
              >
                Enter fullscreen
              </Button>
            )}
            {examId && (
              <Button
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<ChevronLeftIcon />}
                onClick={() => router.push(`/app/exams/${examId}`)}
              >
                Back to Exam
              </Button>
            )}
          </Box>
        </Box>
      )}
      {proctored && proctor.warning && (
        <Alert
          severity="warning"
          icon={<ShieldOutlinedIcon fontSize="small" />}
          onClose={proctor.dismissWarning}
          sx={{ borderRadius: 0, flexShrink: 0 }}
        >
          {proctor.warning}
        </Alert>
      )}
      {proctored && <FullscreenGraceModal secondsLeft={proctor.fsGraceSecondsLeft} onReturn={proctor.requestFullscreen} />}

      {/* ── Header ── */}
      <IDEHeader
        problem={problem}
        problemId={problemId}
        adjacent={adjacent}
        submitting={submitting}
        running={running}
        solved={solved || !!learning?.solved}
        onRun={() => { setOutputTab("testcases"); setOutputOpen(true); execute("run"); }}
        onSubmit={() => execute("submit")}
        examId={examId}
        proctored={proctored}
        navContext={navContext}
        showAI={showAI}
        onToggleAI={() => setShowAI((v) => !v)}
      />

      {/* ── Mobile Problem | Code toggle (swaps full-height panels) ── */}
      {isMobile && (
        <Tabs
          value={mobilePane}
          onChange={(_, v: "problem" | "code") => setMobilePane(v)}
          variant="fullWidth"
          sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", bgcolor: "surface", flexShrink: 0, minHeight: 44 }}
        >
          <Tab value="problem" label="Problem" sx={{ minHeight: 44 }} />
          <Tab value="code" label="Code" sx={{ minHeight: 44 }} />
        </Tabs>
      )}

      {/* ── Workspace: split pane + optional AI Tutor sidebar ── */}
      <Box sx={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
      <Box
        ref={splitRef}
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: `${leftPct}fr 6px ${100 - leftPct}fr` },
          gridTemplateRows: "1fr",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* ── Left panel: description / submissions ── */}
        <Box
          sx={{
            display: isMobile && mobilePane !== "problem" ? "none" : "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {/* Tabs */}
          <Box sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", bgcolor: "surface", px: 1, flexShrink: 0 }}>
            <Tabs
              value={panelTab}
              onChange={handlePanelTab}
              sx={{ minHeight: 42, "& .MuiTab-root": { minHeight: 42, py: 1, fontSize: "0.8rem" } }}
            >
              <Tab label="Description" value="description" />
              {helpEnabled && hasHelp && <Tab label="Hints" value="help" />}
              <Tab label="My solution" value="submissions" />
            </Tabs>
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, sm: 2.5 } }}>
            {panelTab === "description" && (
              <Box>
                {/* Title + metadata */}
                <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {problem.title}
                </Typography>
                <Stack direction="row" alignItems="center" sx={{ mt: 1.25, flexWrap: "wrap", gap: 1 }}>
                  <DifficultyChip difficulty={cap(problem.difficulty)} />
                  {problem.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} />
                  ))}
                </Stack>

                {/* Limits and how the answer is checked, one quiet row */}
                <Stack
                  direction="row"
                  divider={<Divider orientation="vertical" flexItem />}
                  spacing={1.5}
                  sx={{ mt: 2, mb: 3, py: 1, px: 1.5, borderRadius: 2, bgcolor: "surfaceContainerLow", border: "1px solid", borderColor: "outlineVariant", flexWrap: "wrap", rowGap: 0.5 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Time <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{formatLimit(problem.time_limit)}</Box>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Memory <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{problem.memory_limit} MB</Box>
                  </Typography>
                  <Tooltip title={problem.exact_output ? "Your output must match line for line: spaces inside a line, blank lines in the middle and capital letters all count." : "Spacing between values is not important; the values are."}>
                    <Typography variant="caption" color="text.secondary">
                      Output <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{problem.exact_output ? "exact match" : "flexible spacing"}</Box>
                    </Typography>
                  </Tooltip>
                </Stack>

                {/* Teaching first, then the task */}
                {problem.lesson && (
                  <Box sx={{ mb: 3.5, p: 2.25, borderRadius: 2, bgcolor: "surfaceContainerLow", border: "1px solid", borderColor: "outlineVariant" }}>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.05em", display: "block", mb: 1 }}>
                      Learn the idea
                    </Typography>
                    <ProblemMarkdown content={problem.lesson} lesson />
                  </Box>
                )}

                {/* Problem description */}
                <ProblemMarkdown content={problem.description} />

                {/* Examples */}
                {problem.examples.length > 0 && (
                  <Box sx={{ mt: 4 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, pl: 1.25, borderLeft: "3px solid", borderColor: "primary.main", lineHeight: 1.4 }}>
                      {problem.examples.length === 1 ? "Example" : "Examples"}
                    </Typography>
                    <Stack spacing={2}>
                      {problem.examples.map((ex, i) => (
                        <Box
                          key={i}
                          sx={{
                            border: "1px solid",
                            borderColor: "outlineVariant",
                            borderRadius: 1.5,
                            overflow: "hidden",
                          }}
                        >
                          <Box
                            sx={{
                              px: 1.75,
                              py: 0.875,
                              bgcolor: "surfaceContainerHigh",
                              borderBottom: "1px solid",
                              borderColor: "outlineVariant",
                            }}
                          >
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                              <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                                Example {i + 1}
                              </Typography>
                              <Button
                                size="small"
                                onClick={() => { setCustomInput(ex.input); setOutputTab("custom"); setOutputOpen(true); }}
                                sx={{ py: 0, minHeight: 0 }}
                              >
                                Try in terminal
                              </Button>
                            </Stack>
                          </Box>
                          <Stack spacing={1.5} sx={{ p: 1.75 }}>
                            {/* Side by side when both are short; stacked when a line is wide (a banner, a table), so it
                                has the whole width and does not need to scroll. */}
                            <Box sx={{ display: "grid", gridTemplateColumns: [ex.input, ex.output].some((t) => t.split("\n").some((l) => l.length > 24)) ? "1fr" : { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                              <ExampleIO label="Input" value={ex.input} copyable />
                              <ExampleIO label="Output" value={ex.output} copyable />
                            </Box>
                            {ex.explanation && (
                              <Box>
                                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                  Explanation
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                                  {ex.explanation}
                                </Typography>
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            )}

            {panelTab === "help" && helpEnabled && (
              <LearningPanel key={problemId} problemId={problemId} learning={learning} loading={learningLoading} />
            )}

            {panelTab === "submissions" && (
              <Box>
                {historyLoading ? (
                  <Stack spacing={1.5}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} height={56} sx={{ borderRadius: 2 }} />
                    ))}
                  </Stack>
                ) : acceptedHistory.length === 0 ? (
                  <Box sx={{ py: 8, textAlign: "center" }}>
                    <Typography color="text.secondary" variant="body2">
                      {history.length === 0
                        ? "You haven't submitted this problem yet."
                        : "Not solved yet — your accepted solution will appear here."}
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => setPanelTab("description")} sx={{ mt: 2 }}>
                      Read the problem
                    </Button>
                  </Box>
                ) : (
                  <Stack spacing={1}>
                    <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: "surfaceContainerLow", border: "1px solid", borderColor: "outlineVariant" }}>
                      <PerformancePanel problemId={problemId} refreshKey={acceptedHistory.length} />
                    </Box>
                    {/* Accepted work only. A list of failed attempts is not a
                        useful record; unsolved problems collect in the Mistakes
                        notebook instead, where there is something to do. */}
                    {acceptedHistory.map((h) => (
                      <Box
                        key={h.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 1,
                          px: 2,
                          py: 1.25,
                          bgcolor: "surfaceContainerLow",
                          borderRadius: radius.sm,
                          border: "1px solid",
                          borderColor: "outlineVariant",
                        }}
                      >
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <CheckCircleOutlineIcon fontSize="small" color="success" />
                          <Typography variant="caption" fontWeight={600} color="success.main">
                            Accepted
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {historyLangName(h.language)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {h.runtime != null ? `${h.runtime} ms` : "—"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(h.submitted_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* ── Divider: drag, or focus it and use the arrow keys ── */}
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize problem and editor panels"
          aria-valuemin={25}
          aria-valuemax={70}
          aria-valuenow={Math.round(leftPct)}
          tabIndex={0}
          onPointerDown={onSplitDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") { e.preventDefault(); setSplit(leftPct - 2); }
            if (e.key === "ArrowRight") { e.preventDefault(); setSplit(leftPct + 2); }
          }}
          sx={{
            display: { xs: "none", lg: "block" },
            cursor: "col-resize",
            touchAction: "none",
            bgcolor: "outlineVariant",
            transition: "background-color 120ms",
            "&:hover, &:focus-visible": { bgcolor: "primary.main" },
            outline: "none",
          }}
        />

        {/* ── Right panel: editor + output ── */}
        <Box sx={{ display: isMobile && mobilePane !== "code" ? "none" : "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Editor toolbar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              height: 42,
              borderBottom: "1px solid",
              borderColor: "outlineVariant",
              bgcolor: "surface",
              flexShrink: 0,
            }}
          >
            {/* Language select */}
            <Select
              value={langId}
              onChange={(e) => setLangId(Number(e.target.value) as LangId)}
              size="small"
              variant="outlined"
              sx={{ height: 28, "& .MuiSelect-select": { py: 0.5, fontSize: "0.8rem" }, minWidth: 130 }}
              aria-label="Select language"
            >
              {LANGUAGES.filter((l) => allowedLanguageIds(problem.languages).includes(l.id)).map((l) => (
                <MenuItem key={l.id} value={l.id} sx={{ fontSize: "0.85rem" }}>
                  {l.name}
                </MenuItem>
              ))}
            </Select>

            {/* Font size */}
            <Select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              size="small"
              variant="outlined"
              sx={{ height: 28, "& .MuiSelect-select": { py: 0.5, fontSize: "0.8rem" }, width: 88 }}
              aria-label="Font size"
            >
              {[12, 14, 16, 18].map((s) => (
                <MenuItem key={s} value={s} sx={{ fontSize: "0.85rem" }}>{s}px</MenuItem>
              ))}
            </Select>

            <Box sx={{ flex: 1 }} />

            {/* Reset */}
            <Tooltip title="Reset to starter code">
              <IconButton size="small" onClick={resetCode} aria-label="Reset code to starter">
                <RestartAltOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Monaco editor — clipboard-guarded (see useClipboardGuard) */}
          <Box ref={setEditorContainer} sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <MonacoEditor
              height="100%"
              language={lang.monaco}
              value={code}
              onChange={handleCodeChange}
              theme={isDark ? "codementor-dark" : "codementor-light"}
              beforeMount={defineEditorThemes}
              options={{
                fontSize,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 12, bottom: 12 },
                lineNumbersMinChars: 3,
                folding: false,
                wordWrap: "on",
                automaticLayout: true,
                tabSize: lang.monaco === "python" ? 4 : 2,
              }}
              onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
            />
          </Box>

          {/* ── Output panel ── */}
          <Box
            sx={{
              flexShrink: 0,
              borderTop: "1px solid",
              borderColor: "outlineVariant",
              bgcolor: "surface",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Output toolbar */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                px: 1.5,
                height: 40,
                gap: 1,
              }}
            >
              <Tabs
                value={outputTab}
                onChange={(_, v) => setOutputTab(v as OutputTab)}
                sx={{ flex: 1, minHeight: 40, "& .MuiTab-root": { minHeight: 40, py: 0, fontSize: "0.75rem" } }}
              >
                <Tab label="Test cases" value="testcases" />
                <Tab label="Terminal" value="custom" />
              </Tabs>
              <IconButton
                size="small"
                onClick={() => setOutputOpen((v) => !v)}
                aria-label={outputOpen ? "Collapse output" : "Expand output"}
              >
                {outputOpen ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
              </IconButton>
            </Box>

            {/* Verdict banner */}
            {verdict && verdictDesc && (
              <Box sx={{ px: 1.5, pb: outputOpen ? 0 : 1 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    py: 0.875,
                    borderRadius: 2,
                    bgcolor: vBg,
                    color: vFg,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    {verdictDesc === "Accepted" ? (
                      <CheckCircleOutlineIcon fontSize="small" />
                    ) : (
                      <CancelOutlinedIcon fontSize="small" />
                    )}
                    <Typography variant="subtitle2" fontWeight={700}>
                      {verdictResult?.custom_run
                        ? verdictDesc === "Accepted" ? "Ran successfully" : verdictDesc
                        : verdictResult?.sample_only
                          ? `Sample check: ${verdictDesc}`
                          : verdictDesc}
                      {verdictResult && !verdictResult.custom_run && ` — ${verdictResult.passed_count}/${verdictResult.total_count} passed`}
                    </Typography>
                  </Stack>
                  {verdictResult && (
                    <Stack direction="row" spacing={2}>
                      <Typography variant="caption">{formatMs(verdictResult.time)}</Typography>
                      <Typography variant="caption">{formatKb(verdictResult.memory)}</Typography>
                    </Stack>
                  )}
                </Box>
              </Box>
            )}
            {verdict && !verdict.success && verdict.error && (
              <Box sx={{ px: 1.5, pb: outputOpen ? 0 : 1 }}>
                <Box sx={{ px: 2, py: 0.75, borderRadius: 2, bgcolor: "errorContainer", color: "onErrorContainer" }}>
                  <Typography variant="caption">{verdict.error}</Typography>
                </Box>
              </Box>
            )}

            {/* Output content */}
            <Collapse in={outputOpen}>
              <Box sx={{ maxHeight: "min(42vh, 380px)", overflow: "auto", px: 1.5, pb: 1.5, pt: 1 }}>
                {outputTab === "testcases" && (
                  <Box>
                    {(submitting || running) && (
                      <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }} spacing={1}>
                        <CircularProgress size={24} />
                        <Typography variant="caption" color="text.secondary">Judging…</Typography>
                      </Stack>
                    )}
                    {!submitting && !running && verdictResult && !verdictResult.custom_run && (
                      <Box>
                        <ResultsSummary result={verdictResult} />
                        {verdictResult.verdict?.description === "Accepted" && !verdictResult.sample_only && (
                          <Box sx={{ my: 1.5, p: 2, borderRadius: 2, bgcolor: "surfaceContainerLow", border: "1px solid", borderColor: "outlineVariant" }}>
                            <PerformancePanel problemId={problemId} refreshKey={verdictResult.submission_id ?? "now"} />
                          </Box>
                        )}
                        {verdictResult.error && (
                          <ErrorTerminal error={verdictResult.error} onGoToLine={goToLine} />
                        )}
                        <Stack spacing={1}>
                          {verdictResult.test_case_results.map((r, i) => (
                            <TestCaseRow
                              key={i}
                              index={i}
                              result={r}
                              // Don't repeat the compiler output that the
                              // terminal panel above is already showing.
                              hideErrorText={!!verdictResult.error}
                            />
                          ))}
                        </Stack>
                        {verdictResult.sample_only && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", pt: 2 }}>
                            This only checked the sample test cases shown above. Submit to grade your solution
                            against every test case, hidden ones included.
                          </Typography>
                        )}
                      </Box>
                    )}
                    {!submitting && !running && verdictResult?.custom_run && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", py: 3 }}>
                        That was a Terminal run against custom input — it doesn&apos;t check the problem&apos;s test
                        cases.
                        <br />
                        Use Run to check the sample test cases, or Submit to grade your solution.
                      </Typography>
                    )}
                    {!submitting && !running && !verdictResult && !verdict && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", py: 3 }}>
                        Run your code to check it against the sample test cases.
                        <br />
                        <Typography component="span" variant="caption" color="text.disabled">
                          Ctrl + Shift + Enter to submit · Ctrl + Enter to run
                        </Typography>
                      </Typography>
                    )}
                  </Box>
                )}
                {outputTab === "custom" && (
                  <Stack spacing={1.5}>
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75, flexWrap: "wrap", rowGap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Input (what your program reads)
                        </Typography>
                        {problem.examples.slice(0, 3).map((ex, i) => (
                          <Chip key={i} label={`Example ${i + 1}`} size="small" variant="outlined" onClick={() => setCustomInput(ex.input)} />
                        ))}
                      </Stack>
                      <Box
                        component="textarea"
                        value={customInput}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomInput(e.target.value)}
                        placeholder={problem.examples[0] ? `Type your own input, or pick an example above.\ne.g. ${problem.examples[0].input.split("\n")[0]}` : "Type your own input here"}
                        rows={4}
                        sx={{
                          width: "100%",
                          resize: "vertical",
                          fontFamily: "monospace",
                          fontSize: "0.85rem",
                          p: 1,
                          bgcolor: "surfaceContainerHigh",
                          color: "text.primary",
                          border: "1px solid",
                          borderColor: "outlineVariant",
                          borderRadius: 1.5,
                          outline: "none",
                          "&:focus": { borderColor: "primary.main" },
                          boxSizing: "border-box",
                        }}
                      />
                    </Box>
                    {verdictResult?.custom_run && verdictResult.test_case_results[0] && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                          Output
                        </Typography>
                        <Box
                          component="pre"
                          sx={{
                            m: 0,
                            p: 1,
                            bgcolor: "surfaceContainerHighest",
                            borderRadius: 1.5,
                            fontFamily: "monospace",
                            fontSize: "0.8rem",
                            maxHeight: 100,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {verdictResult.test_case_results[0].stdout || "(no output)"}
                        </Box>
                        {verdictResult.test_case_results[0].stderr && (
                          <Box component="pre" sx={{ m: 0, mt: 0.75, p: 1, bgcolor: "errorContainer", color: "onErrorContainer", borderRadius: 1.5, fontFamily: "monospace", fontSize: "0.8rem", maxHeight: 80, overflow: "auto" }}>
                            {verdictResult.test_case_results[0].stderr}
                          </Box>
                        )}
                      </Box>
                    )}
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={running ? <CircularProgress size={14} /> : <PlayArrowOutlinedIcon />}
                      onClick={() => execute("custom")}
                      disabled={running || submitting}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      {running ? "Running…" : "Run with custom input"}
                    </Button>
                  </Stack>
                )}
              </Box>
            </Collapse>
          </Box>

        </Box>

      </Box>

      {/* AI Tutor — inline column on desktop */}
      {showAI && !isMobile && (
        <Box sx={{ width: 340, flexShrink: 0, borderLeft: "1px solid", borderColor: "outlineVariant" }}>
          <AITutorSidebar
            onClose={() => setShowAI(false)}
            contextNote={tutorContext}
            problemTitle={problem.title}
            problemId={problem.id}
            code={code}
            language={lang.name}
            problemDescription={problem.description}
            failingTest={failingTest}
          />
        </Box>
      )}
      </Box>

      {/* AI Tutor — drawer on smaller screens */}
      {isMobile && (
        <Drawer
          anchor="right"
          open={showAI}
          onClose={() => setShowAI(false)}
          slotProps={{ paper: { sx: { width: { xs: "100%", sm: 360 }, maxWidth: "100%" } } }}
        >
          <AITutorSidebar
            onClose={() => setShowAI(false)}
            contextNote={tutorContext}
            problemTitle={problem.title}
            problemId={problem.id}
            code={code}
            language={lang.name}
            problemDescription={problem.description}
            failingTest={failingTest}
          />
        </Drawer>
      )}
    </Box>
  );
}
