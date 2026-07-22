"use client";

import * as React from "react";
import NextLink from "next/link";
import dynamic from "next/dynamic";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import { useTheme } from "@mui/material/styles";
import {
  ChevronLeftIcon,
  PlayArrowOutlinedIcon,
  RestartAltOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { createSocket, joinRoomAck, leaveRoom } from "@/lib/socket";
import { darkScheme, lightScheme } from "@/theme/tokens";
import type { VerdictPayload, VerdictResult } from "@/lib/types";

// ── Monaco editor (client-only) — same self-hosted setup as the problem IDE ──

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

type MonacoNamespace = Parameters<import("@monaco-editor/react").OnMount>[1];

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
  { id: 62, name: "Java", monaco: "java" },
  { id: 54, name: "C++", monaco: "cpp" },
  { id: 50, name: "C", monaco: "c" },
  { id: 63, name: "JavaScript", monaco: "javascript" },
  { id: 74, name: "TypeScript", monaco: "typescript" },
  { id: 75, name: "Go", monaco: "go" },
] as const;

type LangId = (typeof LANGUAGES)[number]["id"];

const STARTERS: Record<LangId, string> = {
  71: 'print("Hello, world!")\n',
  62: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n',
  54: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, world!" << endl;\n    return 0;\n}\n',
  50: '#include <stdio.h>\n\nint main() {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
  63: 'console.log("Hello, world!");\n',
  74: 'console.log("Hello, world!");\n',
  75: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, world!")\n}\n',
};

const LS_LANG = "cm:sandbox:lang";
const lsCode = (langId: number) => `cm:sandbox:code:${langId}`;
const LS_STDIN = "cm:sandbox:stdin";

function formatMs(secs: number): string {
  return secs < 1 ? `${Math.round(secs * 1000)} ms` : `${secs.toFixed(2)} s`;
}
function formatKb(kb: number): string {
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}

export default function SandboxPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [langId, setLangId] = React.useState<LangId>(71);
  const [code, setCode] = React.useState(STARTERS[71]);
  const [stdin, setStdin] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<VerdictResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const socketRef = React.useRef<ReturnType<typeof createSocket> | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = React.useRef(false);

  const lang = LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];

  // Restore last-used language, per-language code, and stdin from localStorage.
  React.useEffect(() => {
    const savedLang = Number(localStorage.getItem(LS_LANG));
    const initialLang = (LANGUAGES.find((l) => l.id === savedLang)?.id ?? 71) as LangId;
    setLangId(initialLang);
    setCode(localStorage.getItem(lsCode(initialLang)) ?? STARTERS[initialLang]);
    setStdin(localStorage.getItem(LS_STDIN) ?? "");
  }, []);

  const handleLangChange = (newLangId: LangId) => {
    setLangId(newLangId);
    localStorage.setItem(LS_LANG, String(newLangId));
    setCode(localStorage.getItem(lsCode(newLangId)) ?? STARTERS[newLangId]);
    setResult(null);
    setError(null);
  };

  const handleCodeChange = (value: string | undefined) => {
    const next = value ?? "";
    setCode(next);
    localStorage.setItem(lsCode(langId), next);
  };

  const handleStdinChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setStdin(e.target.value);
    localStorage.setItem(LS_STDIN, e.target.value);
  };

  const resetCode = () => {
    setCode(STARTERS[langId]);
    localStorage.setItem(lsCode(langId), STARTERS[langId]);
  };

  const execute = React.useCallback(async () => {
    if (pendingRef.current || !code.trim()) return;

    if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    pendingRef.current = true;
    setRunning(true);
    setResult(null);
    setError(null);

    const settle = () => {
      pendingRef.current = false;
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    };

    // Generate the job id ourselves and join its socket room BEFORE submitting,
    // waiting for the server's join ack — a trivial run can finish faster than
    // a fire-and-forget join would land, and the worker would emit "verdict"
    // into a room we hadn't actually joined yet.
    const jobId = crypto.randomUUID();
    const socket = createSocket();
    socketRef.current = socket;
    socket.once("verdict", (payload: VerdictPayload) => {
      leaveRoom(socket, jobId);
      settle();
      setRunning(false);
      if (!payload.success) {
        setError(payload.error ?? "Run failed");
      } else if (payload.result) {
        setResult(payload.result);
      }
    });

    try {
      await joinRoomAck(socket, jobId);

      timeoutRef.current = setTimeout(() => {
        if (!pendingRef.current) return;
        settle();
        setRunning(false);
        setError("Run timed out. Please try again.");
      }, 60_000);

      const res = await api.post<{ success: boolean; jobId?: string; error?: string }>("/api/submit", {
        source_code: code,
        language_id: langId,
        custom_input: stdin,
        job_id: jobId,
      });
      if (!res.data.success) {
        leaveRoom(socket, jobId);
        setError(res.data.error ?? "Run failed");
        setRunning(false);
        settle();
      }
    } catch {
      setError("Network error. Please check your connection.");
      setRunning(false);
      settle();
    }
  }, [code, langId, stdin]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        execute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [execute]);

  React.useEffect(
    () => () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const single = result?.test_case_results?.[0];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      {/* Top bar */}
      <Box
        sx={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          height: 56,
          borderBottom: "1px solid",
          borderColor: "outlineVariant",
          bgcolor: "surface",
        }}
      >
        <Tooltip title="Back">
          <IconButton size="small" component={NextLink} href="/app/dashboard" aria-label="Back to dashboard">
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="subtitle1" fontWeight={700}>
          Sandbox
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Scratch space to try out code — nothing here is graded or saved to your submission history.
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Select
          size="small"
          value={langId}
          onChange={(e) => handleLangChange(Number(e.target.value) as LangId)}
          sx={{ minWidth: 140 }}
        >
          {LANGUAGES.map((l) => (
            <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
          ))}
        </Select>

        <Tooltip title="Reset to starter code">
          <IconButton size="small" onClick={resetCode} aria-label="Reset code to starter">
            <RestartAltOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Button
          variant="contained"
          size="small"
          startIcon={running ? <CircularProgress size={14} color="inherit" /> : <PlayArrowOutlinedIcon />}
          onClick={execute}
          disabled={running}
        >
          {running ? "Running…" : "Run"}
        </Button>
      </Box>

      {/* Editor + stdin/output */}
      <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Box sx={{ flex: 2, minWidth: 0, borderRight: "1px solid", borderColor: "outlineVariant" }}>
          <MonacoEditor
            height="100%"
            language={lang.monaco}
            value={code}
            onChange={handleCodeChange}
            theme={isDark ? "codementor-dark" : "codementor-light"}
            beforeMount={defineEditorThemes}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              lineNumbersMinChars: 3,
              folding: false,
              wordWrap: "on",
              automaticLayout: true,
              tabSize: lang.monaco === "python" ? 4 : 2,
            }}
          />
        </Box>

        <Stack sx={{ flex: 1, minWidth: 320, p: 2, gap: 1.5, overflow: "auto" }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Standard input (stdin)
            </Typography>
            <Box
              component="textarea"
              value={stdin}
              onChange={handleStdinChange}
              placeholder="Enter input for your program here…"
              rows={5}
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

          {running && (
            <Stack alignItems="center" justifyContent="center" sx={{ py: 4 }} spacing={1}>
              <CircularProgress size={24} />
              <Typography variant="caption" color="text.secondary">Running…</Typography>
            </Stack>
          )}

          {error && (
            <Box sx={{ px: 2, py: 0.75, borderRadius: 2, bgcolor: "errorContainer", color: "onErrorContainer" }}>
              <Typography variant="caption">{error}</Typography>
            </Box>
          )}

          {!running && result && (
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {result.verdict?.description ?? "Done"}
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <Typography variant="caption" color="text.secondary">{formatMs(result.time)}</Typography>
                  <Typography variant="caption" color="text.secondary">{formatKb(result.memory)}</Typography>
                </Stack>
              </Stack>

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
                  minHeight: 60,
                  maxHeight: 220,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {single?.stdout || "(no output)"}
              </Box>

              {single?.compile_output && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, mb: 0.5 }}>
                    Compile output
                  </Typography>
                  <Box component="pre" sx={{ m: 0, p: 1, bgcolor: "errorContainer", color: "onErrorContainer", borderRadius: 1.5, fontFamily: "monospace", fontSize: "0.8rem", maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap" }}>
                    {single.compile_output}
                  </Box>
                </>
              )}

              {single?.stderr && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, mb: 0.5 }}>
                    stderr
                  </Typography>
                  <Box component="pre" sx={{ m: 0, p: 1, bgcolor: "errorContainer", color: "onErrorContainer", borderRadius: 1.5, fontFamily: "monospace", fontSize: "0.8rem", maxHeight: 160, overflow: "auto", whiteSpace: "pre-wrap" }}>
                    {single.stderr}
                  </Box>
                </>
              )}
            </Box>
          )}

          {!running && !result && !error && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", py: 3 }}>
              Run your code to see output here.
              <br />
              <Typography component="span" variant="caption" color="text.disabled">
                Ctrl + Enter to run
              </Typography>
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
