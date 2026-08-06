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
import Tooltip from "@mui/material/Tooltip";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import Drawer from "@mui/material/Drawer";
import ListItemIcon from "@mui/material/ListItemIcon";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { CodeIcon, ChevronLeftIcon, ChevronRightIcon, PlayArrowOutlinedIcon, UploadOutlinedIcon, RestartAltOutlinedIcon, ExpandMoreIcon, ExpandLessIcon, CheckCircleOutlineIcon, CancelOutlinedIcon, LogoutIcon, PersonOutlineIcon, SmartToyOutlinedIcon, ContentCopyOutlinedIcon, CheckIcon, ShieldOutlinedIcon, FullscreenIcon } from "@/components/ui/icons";
import Alert from "@mui/material/Alert";
import api from "@/lib/api";
import { pollUntilDone } from "@/lib/pollJudging";
import { useProctor } from "@/hooks/useProctor";
import { fireConfetti } from "@/components/feedback/confetti";
import { clearSession, getUser } from "@/lib/auth";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { VerdictChip } from "@/components/ui/VerdictChip";
import { ErrorState } from "@/components/ui/States";
import { AITutorSidebar, type FailingTest } from "@/components/problem/AITutorSidebar";
import { TimerWidget } from "@/components/problem/TimerWidget";
import { darkScheme, lightScheme } from "@/theme/tokens";
import type {
  ProblemDetail,
  AdjacentProblems,
  VerdictPayload,
  VerdictResult,
  ProblemHistoryEntry,
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
  { id: 71, name: "Python 3", monaco: "python" },
  { id: 62, name: "Java",     monaco: "java" },
  { id: 54, name: "C++",      monaco: "cpp" },
  { id: 63, name: "JavaScript", monaco: "javascript" },
] as const;

type LangId = (typeof LANGUAGES)[number]["id"];

const LS_LANG   = "cm:lang";
const lsCode    = (pid: string, lid: number) => `cm:code:${pid}:${lid}`;

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

function ProblemMarkdown({ content }: { content: string }) {
  return (
    <Box
      sx={{
        "& p": { mb: 1.5, lineHeight: 1.7 },
        "& ul, & ol": { pl: 3, mb: 1.5 },
        "& li": { mb: 0.5 },
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
        "& blockquote": { borderLeft: "3px solid", borderColor: "primary.main", pl: 2, my: 1.5, color: "text.secondary" },
        "& strong": { fontWeight: 600 },
        "& h1, & h2, & h3": { mt: 2, mb: 1, fontWeight: 600 },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </Box>
  );
}

// ── Test case result row ──────────────────────────────────────────────────────

function TestCaseRow({
  index,
  result,
}: {
  index: number;
  result: VerdictResult["test_case_results"][number];
}) {
  const [open, setOpen] = React.useState(index === 0);
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
          {result.is_public && result.input != null && (
            <TestIOBlock label="Input" value={result.input} />
          )}
          {result.is_public && result.expected != null && (
            <TestIOBlock label="Expected" value={result.expected} />
          )}
          {result.stdout && (
            <TestIOBlock label="Your output" value={result.stdout} highlight={!passed} />
          )}
          {(result.stderr || result.compile_output || result.message) && (
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
  const cases = result.test_case_results;
  if (cases.length === 0) return null;
  const timesMs = cases.map((c) => Math.max(0, Math.round(c.time * 1000)));
  const avg = timesMs.length ? Math.round(timesMs.reduce((a, b) => a + b, 0) / timesMs.length) : 0;
  const max = timesMs.length ? Math.max(...timesMs) : 0;
  const shown = cases.filter((c) => c.is_public);
  const hidden = cases.filter((c) => !c.is_public);
  const shownPassed = shown.filter((c) => c.passed).length;
  const hiddenPassed = hidden.filter((c) => c.passed).length;

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
              <SparkLineChart data={timesMs} height={24} width={56} area colors={["var(--mui-palette-primary-main)"]} />
            </Box>
          )}
        </Stack>
      </SummaryCard>
      {shown.length > 0 && countChip(shownPassed, shown.length, "shown")}
      {hidden.length > 0 && countChip(hiddenPassed, hidden.length, "hidden")}
    </Stack>
  );
}

function TestIOBlock({
  label,
  value,
  highlight,
  isError,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isError?: boolean;
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
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 120,
          overflow: "auto",
        }}
      >
        {value || "(empty)"}
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
}) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const user = React.useMemo(() => getUser(), []);

  const handleSignOut = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <Box
      component="header"
      sx={{
        height: 52,
        display: "flex",
        alignItems: "center",
        px: 1.5,
        gap: 1,
        borderBottom: "1px solid",
        borderColor: "outlineVariant",
        bgcolor: "surface",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <IconButton component={NextLink} href="/app/problems" aria-label="Back to problems" size="small">
        <CodeIcon fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Prev / Next */}
      <Tooltip title="Previous problem">
        <span>
          <IconButton
            component={NextLink}
            href={adjacent?.prev ? `/app/problems/${adjacent.prev}` : "#"}
            aria-label="Previous problem"
            size="small"
            disabled={!adjacent?.prev}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {adjacent && (
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 52, textAlign: "center" }}>
          {adjacent.position}/{adjacent.total}
        </Typography>
      )}

      <Tooltip title="Next problem">
        <span>
          <IconButton
            component={NextLink}
            href={adjacent?.next ? `/app/problems/${adjacent.next}` : "#"}
            aria-label="Next problem"
            size="small"
            disabled={!adjacent?.next}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {/* Problem title */}
      <Typography
        variant="body2"
        fontWeight={600}
        noWrap
        sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", mx: 1 }}
      >
        {problem?.title ?? "Loading…"}
      </Typography>

      {/* Timer (session + Pomodoro) */}
      <Box sx={{ mr: 0.5 }}>
        <TimerWidget problemId={problemId} solved={solved} />
      </Box>

      {/* Run */}
      <Button
        variant="outlined"
        size="small"
        startIcon={running ? <CircularProgress size={14} /> : <PlayArrowOutlinedIcon />}
        onClick={onRun}
        disabled={submitting || running}
        sx={{ minWidth: 70 }}
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
        sx={{ minWidth: 88 }}
      >
        {submitting ? "Judging…" : "Submit"}
      </Button>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* AI Tutor toggle */}
      <Tooltip title={showAI ? "Hide AI Tutor" : "Ask the AI Tutor"}>
        <IconButton
          size="small"
          onClick={onToggleAI}
          aria-label="Toggle AI Tutor"
          aria-pressed={showAI}
          sx={{
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
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </Typography>
        {copyable && (
          <Tooltip title={copied ? "Copied" : "Copy"}>
            <IconButton size="small" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} sx={{ p: 0.25 }}>
              {copied ? <CheckIcon sx={{ fontSize: 14, color: "success.main" }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.25,
          bgcolor: "surfaceContainerHighest",
          borderRadius: 1,
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value}
      </Box>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type OutputTab = "testcases" | "custom";
type PanelTab  = "description" | "submissions";

export default function ProblemSolvingPage() {
  const params  = useParams<{ id: string }>();
  const problemId = params.id;
  const theme   = useTheme();
  const isDark  = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("lg"));

  // ── Assignment / contest / proctor context (from the query string) ──
  // Read once from window.location so we avoid a Suspense boundary for useSearchParams.
  const [searchParams] = React.useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams(),
  );
  const assignmentId = searchParams.get("assignment");
  const contestId = searchParams.get("contest");
  const proctored = !!assignmentId && searchParams.get("proctor") === "1";

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

  // ── Submission state ──
  const [submitting,  setSubmitting]  = React.useState(false);
  const [running,     setRunning]     = React.useState(false);
  const [verdict,     setVerdict]     = React.useState<VerdictPayload | null>(null);
  const [outputOpen,  setOutputOpen]  = React.useState(false);
  const [outputTab,   setOutputTab]   = React.useState<OutputTab>("testcases");
  const [customInput, setCustomInput] = React.useState("");

  // ── Panel / tab state ──
  const [panelTab, setPanelTab] = React.useState<PanelTab>("description");
  const [history, setHistory]   = React.useState<ProblemHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  // ── AI Tutor ──
  const [showAI, setShowAI] = React.useState(false);
  const [tutorContext, setTutorContext] = React.useState<string | undefined>(undefined);

  // ── Solved state (stops the timer, celebrates) + mobile panel toggle ──
  const [solved, setSolved] = React.useState(false);
  const [mobilePane, setMobilePane] = React.useState<"problem" | "code">("problem");

  // Timer (session + Pomodoro) lives in <TimerWidget>, keyed by problemId + solved.

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
      api.get<{ success: boolean; data: AdjacentProblems }>(`/api/problems/${problemId}/adjacent`),
    ]).then(([probRes, adjRes]) => {
      if (!active) return;
      if (probRes.status === "rejected") { setError(true); setLoading(false); return; }
      const prob = probRes.value.data.data;
      setProblem(prob);
      if (adjRes.status === "fulfilled") setAdjacent(adjRes.value.data.data);

      // Load saved code or stub
      const saved = localStorage.getItem(lsCode(problemId, langId));
      setCode(saved ?? prob.stubs?.[String(langId)] ?? "");
      setLoading(false);
    });
    return () => { active = false; };
  }, [problemId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setOutputTab("testcases");
    // Refresh history if on submissions tab
    if (panelTab === "submissions") loadHistory();
    const r = payload.result;
    if (r && !r.custom_run && r.verdict?.description === "Accepted") {
      // Celebrate + stop the timer (Peak-End Rule).
      setSolved(true);
      fireConfetti();
    } else if (r && !r.custom_run && r.verdict?.description && r.verdict.description !== "Accepted") {
      // Nudge the AI tutor toward debugging when a real submission fails.
      setTutorContext(`${r.submission_id}:${r.verdict.id}`);
    }
  }, [panelTab, loadHistory]);

  // ── Execute (run or submit) ──
  const execute = React.useCallback(
    async (isSubmit: boolean) => {
      if (!problem) return;
      if (pendingRef.current) return; // guard against concurrent run/submit (avoids 429)
      const currentCode = code;
      if (!currentCode.trim()) return;

      // Tear down any in-flight judging before starting a new one.
      if (cancelPollRef.current) { cancelPollRef.current(); cancelPollRef.current = null; }
      pendingRef.current = true;

      if (isSubmit) setSubmitting(true);
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
        if (!isSubmit) body.custom_input = customInput;
        // Attach assignment / contest context so the submission is recorded against them.
        if (assignmentId) body.assignment_id = assignmentId;
        if (contestId) body.contest_id = contestId;

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
      } catch {
        setVerdict({ success: false, state: "failed", error: "Network error. Please check your connection." });
        setSubmitting(false);
        setRunning(false);
        setOutputOpen(true);
        settle();
      }
    },
    [problem, code, langId, customInput, assignmentId, contestId, handleVerdict]
  );

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) execute(true);
        else execute(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [execute]);

  // Keep the auto-submit ref pointed at the latest submit for the proctor hook.
  React.useEffect(() => {
    autoSubmitRef.current = () => execute(true);
  }, [execute]);

  // Stop polling for a verdict when leaving the page.
  React.useEffect(
    () => () => {
      if (cancelPollRef.current) cancelPollRef.current();
    },
    [],
  );

  // ── Proctored-exam monitor (only when ?proctor=1 on an assignment) ──
  const proctor = useProctor({
    active: proctored,
    assignmentId,
    problemId,
    onAutoSubmit: () => autoSubmitRef.current(),
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
      {/* ── Proctored exam banner ── */}
      {proctored && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1,
            bgcolor: "errorContainer",
            color: "onErrorContainer",
            borderBottom: "1px solid",
            borderColor: "outlineVariant",
            flexShrink: 0,
          }}
        >
          <ShieldOutlinedIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>Proctored Exam</Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>
            {proctor.violations} flag{proctor.violations === 1 ? "" : "s"} recorded · stay in fullscreen, don&apos;t switch tabs
          </Typography>
          {!proctor.fullscreen && (
            <Button
              size="small"
              variant="contained"
              color="error"
              startIcon={<FullscreenIcon />}
              onClick={proctor.requestFullscreen}
              sx={{ ml: "auto" }}
            >
              Enter fullscreen
            </Button>
          )}
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

      {/* ── Header ── */}
      <IDEHeader
        problem={problem}
        problemId={problemId}
        adjacent={adjacent}
        submitting={submitting}
        running={running}
        solved={solved}
        onRun={() => { setOutputTab("custom"); setOutputOpen(true); execute(false); }}
        onSubmit={() => execute(true)}
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
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "45fr 55fr" },
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
            borderRight: { lg: "1px solid" },
            borderColor: { lg: "outlineVariant" },
            overflow: "hidden",
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
              <Tab label="Submissions" value="submissions" />
            </Tabs>
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, sm: 2.5 } }}>
            {panelTab === "description" && (
              <Box>
                {/* Title + metadata */}
                <Typography variant="h5" fontWeight={600} gutterBottom>
                  {problem.title}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                  <DifficultyChip difficulty={cap(problem.difficulty)} />
                  {problem.tags.map((tag) => (
                    <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />
                  ))}
                </Stack>

                {/* Limits */}
                <Stack direction="row" spacing={3} sx={{ mb: 2.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Time limit</Typography>
                    <Typography variant="body2" fontWeight={500}>{problem.time_limit} ms</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Memory limit</Typography>
                    <Typography variant="body2" fontWeight={500}>{problem.memory_limit} MB</Typography>
                  </Box>
                </Stack>

                {/* Problem description */}
                <ProblemMarkdown content={problem.description} />

                {/* Examples */}
                {problem.examples.length > 0 && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                      Examples
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
                            <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
                              Example {i + 1}
                            </Typography>
                          </Box>
                          <Stack spacing={1.5} sx={{ p: 1.75 }}>
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                              <ExampleIO label="Input" value={ex.input} copyable />
                              <ExampleIO label="Output" value={ex.output} />
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

            {panelTab === "submissions" && (
              <Box>
                {historyLoading ? (
                  <Stack spacing={1.5}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} height={56} sx={{ borderRadius: 2 }} />
                    ))}
                  </Stack>
                ) : history.length === 0 ? (
                  <Box sx={{ py: 8, textAlign: "center" }}>
                    <Typography color="text.secondary" variant="body2">
                      No submissions yet for this problem.
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => setPanelTab("description")} sx={{ mt: 2 }}>
                      Read the problem
                    </Button>
                  </Box>
                ) : (
                  <Stack spacing={1}>
                    {history.map((h) => (
                      <Box
                        key={h.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          px: 2,
                          py: 1.25,
                          bgcolor: "surfaceContainerLow",
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: "outlineVariant",
                        }}
                      >
                        <VerdictChip verdict={h.verdict} />
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
              {LANGUAGES.map((l) => (
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
              sx={{ height: 28, "& .MuiSelect-select": { py: 0.5, fontSize: "0.8rem" }, width: 72 }}
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

          {/* Monaco editor */}
          <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
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
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: vBg,
                    color: vFg,
                  }}
                >
                  <Typography variant="subtitle2" fontWeight={700}>
                    {verdictDesc}
                    {verdictResult && ` — ${verdictResult.passed_count}/${verdictResult.total_count} passed`}
                  </Typography>
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
              <Box sx={{ maxHeight: 260, overflow: "auto", px: 1.5, pb: 1.5, pt: 1 }}>
                {outputTab === "testcases" && (
                  <Box>
                    {(submitting || running) && (
                      <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }} spacing={1}>
                        <CircularProgress size={24} />
                        <Typography variant="caption" color="text.secondary">Judging…</Typography>
                      </Stack>
                    )}
                    {!submitting && !running && verdictResult && (
                      <Box>
                        {!verdictResult.custom_run && <ResultsSummary result={verdictResult} />}
                        <Stack spacing={1}>
                          {verdictResult.test_case_results.map((r, i) => (
                            <TestCaseRow key={i} index={i} result={r} />
                          ))}
                        </Stack>
                      </Box>
                    )}
                    {!submitting && !running && !verdictResult && !verdict && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", py: 3 }}>
                        Submit your code to see test results here.
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
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                        Standard input (stdin)
                      </Typography>
                      <Box
                        component="textarea"
                        value={customInput}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCustomInput(e.target.value)}
                        placeholder="Enter custom input here…"
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
                      onClick={() => execute(false)}
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

          {/* Bottom action bar (Prev · Reset · Submit · Next) */}
          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.5,
              height: 48,
              borderTop: "1px solid",
              borderColor: "outlineVariant",
              bgcolor: "surface",
            }}
          >
            <Button
              {...(adjacent?.prev
                ? { component: NextLink, href: `/app/problems/${adjacent.prev}` }
                : { disabled: true })}
              size="small"
              variant="text"
              startIcon={<ChevronLeftIcon />}
              sx={{ color: "text.secondary" }}
            >
              Prev
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              onClick={resetCode}
              size="small"
              variant="text"
              startIcon={<RestartAltOutlinedIcon />}
              sx={{ color: "text.secondary" }}
            >
              Reset
            </Button>
            <Button
              onClick={() => execute(true)}
              disabled={submitting || running}
              size="small"
              variant="contained"
              startIcon={submitting ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : <UploadOutlinedIcon />}
            >
              {submitting ? "Judging…" : "Submit"}
            </Button>
            <Button
              {...(adjacent?.next
                ? { component: NextLink, href: `/app/problems/${adjacent.next}` }
                : { disabled: true })}
              size="small"
              variant="text"
              endIcon={<ChevronRightIcon />}
              sx={{ color: "text.secondary" }}
            >
              Next
            </Button>
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
