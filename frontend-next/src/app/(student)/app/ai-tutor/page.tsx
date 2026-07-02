"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import SendIcon from "@mui/icons-material/Send";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import api from "@/lib/api";

const AI = "var(--mui-palette-ai)";

type Mode = "tutor" | "explain" | "review";
interface Message {
  id: number;
  role: "user" | "ai";
  content: string;
  mode?: Mode;
}

const MODES: { key: Mode; label: string; icon: React.ElementType; color: string; desc: string }[] = [
  { key: "tutor", label: "AI Tutor", icon: SmartToyOutlinedIcon, color: AI, desc: "Socratic guidance — never gives direct answers" },
  { key: "explain", label: "Explain Error", icon: BugReportOutlinedIcon, color: "#E5484D", desc: "Explains why your code failed in plain English" },
  { key: "review", label: "Code Review", icon: CodeOutlinedIcon, color: "#30A46C", desc: "Reviews quality, complexity, and code smells" },
];

const QUICK_PROMPTS = [
  "What is Dynamic Programming?",
  "Explain BFS vs DFS with examples",
  "When should I use a hash map?",
  "How do I detect a cycle in a linked list?",
  "Explain Big O notation",
  "What is memoization?",
  "Sliding window technique explained",
  "Two pointers pattern explained",
];

// ── Code block with copy ──────────────────────────────────────────────────────
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Box sx={{ my: 1, border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, overflow: "hidden" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.5, py: 0.5, bgcolor: "surfaceContainerHigh" }}>
        <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", textTransform: "uppercase", color: "text.secondary" }}>{lang || "code"}</Typography>
        <Button size="small" startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />} onClick={copy} sx={{ minWidth: 0 }}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </Stack>
      <Box component="pre" sx={{ m: 0, p: 1.5, fontFamily: "ui-monospace, monospace", fontSize: 12, overflow: "auto", bgcolor: "surfaceContainerLowest" }}>
        <code>{code}</code>
      </Box>
    </Box>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <Box sx={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0].trim();
          const code = lines.slice(1).join("\n").trimEnd();
          return <CodeBlock key={i} code={code} lang={lang} />;
        }
        return (
          <Box key={i}>
            {part.split("\n").map((line, j) => (
              <Typography key={j} variant="body2" sx={{ minHeight: line === "" ? 8 : undefined, whiteSpace: "pre-wrap" }}>{line}</Typography>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

interface Review {
  qualityScore?: number;
  timeComplexity?: string;
  spaceComplexity?: string;
  codeSmells?: string[];
  improvementSuggestions?: string[];
}
function ReviewCard({ content }: { content: string }) {
  let review: Review | null = null;
  try {
    review = JSON.parse(content) as Review;
  } catch {
    return <MessageContent content={content} />;
  }
  if (!review || review.qualityScore == null) return <MessageContent content={content} />;
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h5" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace" }}>{review.qualityScore}/100</Typography>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Quality Score</Typography>
          <LinearProgress variant="determinate" value={Math.min(100, review.qualityScore)} color="success" sx={{ mt: 0.5, height: 6, borderRadius: 3 }} />
        </Box>
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <Card variant="outlined" sx={{ flex: 1, p: 1.25, borderColor: "outlineVariant" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Time</Typography>
          <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "ui-monospace, monospace", color: "primary.main" }}>{review.timeComplexity ?? "—"}</Typography>
        </Card>
        <Card variant="outlined" sx={{ flex: 1, p: 1.25, borderColor: "outlineVariant" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Space</Typography>
          <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "ui-monospace, monospace", color: "secondary.main" }}>{review.spaceComplexity ?? "—"}</Typography>
        </Card>
      </Stack>
      {review.codeSmells && review.codeSmells.length > 0 && (
        <Box>
          <Typography variant="overline" color="text.secondary">Code Smells</Typography>
          {review.codeSmells.map((s, i) => (
            <Typography key={i} variant="caption" sx={{ display: "block", color: "warning.main" }}>• {s}</Typography>
          ))}
        </Box>
      )}
      {review.improvementSuggestions && review.improvementSuggestions.length > 0 && (
        <Box>
          <Typography variant="overline" color="text.secondary">Suggestions</Typography>
          {review.improvementSuggestions.map((s, i) => (
            <Typography key={i} variant="caption" sx={{ display: "block", color: "success.main" }}>• {s}</Typography>
          ))}
        </Box>
      )}
    </Stack>
  );
}

export default function AITutorPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [mode, setMode] = React.useState<Mode>("tutor");
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 1,
      role: "ai",
      mode: "tutor",
      content:
        "Hello! I'm your CodeMentor AI Tutor.\n\nI use the Socratic method — I'll guide you to the answer through questions rather than giving it to you directly.\n\nAsk me anything about data structures, algorithms, or paste your code for a review!",
    },
  ]);
  const [input, setInput] = React.useState("");
  const [codeInput, setCodeInput] = React.useState("");
  const [showCodePanel, setShowCodePanel] = React.useState(false);
  const [isTyping, setIsTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim();
    if (!text || isTyping) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: text, mode }]);
    setInput("");
    setIsTyping(true);
    try {
      let aiText = "";
      if (mode === "tutor") {
        const res = await api.post("/api/ai/tutor", { problemId: "general", problemDescription: "General coding/algorithm question", code: codeInput || "", message: text });
        aiText = res.data?.response || res.data?.data?.response || "I couldn't process that. Try again.";
      } else if (mode === "explain") {
        const res = await api.post("/api/ai/explain-error", { problemDescription: "User-provided code context", code: codeInput || text, errorTrace: text });
        aiText = res.data?.explanation || res.data?.data?.explanation || "I couldn't explain that error.";
      } else {
        const res = await api.post("/api/ai/review-code", { problemDescription: "User-submitted code for review", code: codeInput || text });
        aiText = JSON.stringify(res.data?.review || res.data?.data?.review || {});
      }
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "ai", content: aiText, mode }]);
    } catch {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "ai", content: "Sorry, I couldn't connect to the AI service right now. Please try again.", mode }]);
    } finally {
      setIsTyping(false);
    }
  };

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <Box sx={{ mx: { xs: -2, sm: -3, md: -4 }, mt: { xs: -2, sm: -3, md: -4 }, height: "calc(100dvh - 64px)", display: "flex" }}>
      {/* Sidebar (desktop) */}
      {isDesktop && (
        <Box sx={{ width: 260, flexShrink: 0, borderRight: "1px solid", borderColor: "outlineVariant", overflowY: "auto", p: 2 }}>
          <Typography variant="overline" color="text.secondary">Mode</Typography>
          <Stack spacing={1} sx={{ mt: 1, mb: 3 }}>
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.key;
              return (
                <Box
                  key={m.key}
                  component="button"
                  onClick={() => setMode(m.key)}
                  sx={{
                    display: "flex", gap: 1.25, alignItems: "flex-start", textAlign: "left", width: "100%",
                    p: 1.25, borderRadius: 2, cursor: "pointer", font: "inherit", color: "inherit",
                    border: "1px solid", borderColor: active ? "outlineVariant" : "transparent",
                    bgcolor: active ? "surfaceContainerHigh" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Icon sx={{ fontSize: 18, color: m.color, mt: 0.25, flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{m.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>{m.desc}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>
          <Typography variant="overline" color="text.secondary">Quick Asks</Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {QUICK_PROMPTS.map((q) => (
              <Box
                key={q}
                component="button"
                onClick={() => { setMode("tutor"); handleSend(q); }}
                disabled={isTyping}
                sx={{
                  display: "flex", gap: 1, alignItems: "center", textAlign: "left", width: "100%",
                  px: 1, py: 0.75, borderRadius: 1.5, border: 0, bgcolor: "transparent", cursor: "pointer",
                  color: "text.secondary", font: "inherit", "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                  "&:disabled": { opacity: 0.4, cursor: "default" },
                }}
              >
                <AutoAwesomeOutlinedIcon sx={{ fontSize: 14, color: AI, flexShrink: 0 }} />
                <Typography variant="caption">{q}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Chat area */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "outlineVariant", flexShrink: 0 }}>
          <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: `color-mix(in srgb, ${activeMode.color} 18%, transparent)`, color: activeMode.color }}>
            <activeMode.icon sx={{ fontSize: 18 }} />
          </Avatar>
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>{activeMode.label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>ONLINE</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant={showCodePanel ? "contained" : "outlined"} startIcon={<CodeOutlinedIcon />} onClick={() => setShowCodePanel((v) => !v)}>Code Panel</Button>
        </Stack>

        <Box sx={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Messages */}
          <Box ref={scrollRef} sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
            <Stack spacing={2.5}>
              {messages.map((msg) => {
                const msgMode = MODES.find((m) => m.key === msg.mode);
                const isUser = msg.role === "user";
                return (
                  <Stack key={msg.id} direction={isUser ? "row-reverse" : "row"} spacing={1.5} alignItems="flex-start">
                    <Avatar variant="rounded" sx={{ width: 32, height: 32, flexShrink: 0, bgcolor: isUser ? "primary.main" : `color-mix(in srgb, ${msgMode?.color || AI} 18%, transparent)`, color: isUser ? "primary.contrastText" : msgMode?.color || AI }}>
                      {isUser ? <PersonOutlineIcon sx={{ fontSize: 18 }} /> : <SmartToyOutlinedIcon sx={{ fontSize: 18 }} />}
                    </Avatar>
                    <Box
                      sx={{
                        maxWidth: "78%", px: 2, py: 1.25, borderRadius: 2,
                        border: "1px solid", borderColor: isUser ? "primary.main" : "outlineVariant",
                        bgcolor: isUser ? "primaryContainer" : "surfaceContainerHigh",
                        color: isUser ? "onPrimaryContainer" : "text.primary",
                      }}
                    >
                      {!isUser && msg.mode === "review" ? <ReviewCard content={msg.content} /> : <MessageContent content={msg.content} />}
                    </Box>
                  </Stack>
                );
              })}
              {isTyping && (
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar variant="rounded" sx={{ width: 32, height: 32, bgcolor: `color-mix(in srgb, ${AI} 18%, transparent)`, color: AI }}><SmartToyOutlinedIcon sx={{ fontSize: 18 }} /></Avatar>
                  <Box sx={{ px: 2, py: 1.25, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant", bgcolor: "surfaceContainerHigh" }}>
                    <Typography variant="caption" color="text.secondary">Thinking…</Typography>
                  </Box>
                </Stack>
              )}
            </Stack>
          </Box>

          {/* Code panel */}
          {showCodePanel && (
            <Box sx={{ width: { xs: "100%", sm: 320 }, flexShrink: 0, borderLeft: "1px solid", borderColor: "outlineVariant", display: "flex", flexDirection: "column" }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
                <Typography variant="overline" color="text.secondary">Code Context</Typography>
                <Typography variant="caption" color="text.secondary">Sent with every message</Typography>
              </Stack>
              <Box
                component="textarea"
                value={codeInput}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCodeInput(e.target.value)}
                placeholder="Paste your code here…"
                spellCheck={false}
                sx={{ flex: 1, p: 2, border: 0, outline: "none", resize: "none", bgcolor: "transparent", color: "text.primary", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              />
            </Box>
          )}
        </Box>

        {/* Input */}
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "outlineVariant", flexShrink: 0 }}>
          {!isDesktop && (
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5 }}>
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <Chip
                    key={m.key}
                    icon={<Icon sx={{ fontSize: "1rem !important", color: `${m.color} !important` }} />}
                    label={m.label}
                    onClick={() => setMode(m.key)}
                    variant={mode === m.key ? "filled" : "outlined"}
                    sx={{ flexShrink: 0, bgcolor: mode === m.key ? "surfaceContainerHigh" : "transparent" }}
                  />
                );
              })}
            </Stack>
          )}
          <TextField
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              mode === "tutor" ? "Ask a question about algorithms or your approach…" : mode === "explain" ? "Paste your error trace or describe what went wrong…" : "Describe what your code does, then send…"
            }
            size="small"
            fullWidth
            multiline
            maxRows={5}
            slotProps={{
              input: {
                endAdornment: (
                  <Tooltip title="Send">
                    <span>
                      <IconButton onClick={() => handleSend()} disabled={!input.trim() || isTyping} aria-label="Send" color="primary">
                        <SendIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                ),
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 1, fontFamily: "ui-monospace, monospace" }}>
            SHIFT+ENTER FOR NEW LINE · AI CAN MAKE MISTAKES
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
