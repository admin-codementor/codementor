"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import { SmartToyOutlinedIcon, SendIcon, CloseIcon, AutoAwesomeOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";

// AI accent — theme token (scheme-aware), kept distinct from the primary palette
// so the tutor reads as a separate assistant surface. Tonal pairs via color-mix.
const AI = "var(--mui-palette-ai)";

interface Message {
  role: "user" | "ai";
  content: string;
}

export interface FailingTest {
  input: string | null;
  expected: string | null;
  output: string;
  hidden: boolean;
}

const GREETING: Message = {
  role: "ai",
  content:
    "I'm your AI Tutor! I'll guide you with questions rather than giving away the solution. What aspect of this problem are you stuck on?",
};

const SUGGESTIONS = [
  "I'm getting a wrong answer",
  "How do I make it faster?",
  "What's the time complexity?",
  "Give me a smaller hint",
];

const FALLBACK_REPLIES = [
  "Good instinct. What would you need to remember about each number as you scan the array once?",
  "Think about lookups: which data structure gives you O(1) membership checks?",
  "Try tracing your code on a small example by hand. Which line produces the wrong result?",
  "You're close. For each element, what single value are you really searching for?",
];

function TypingDots() {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ py: 0.5 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: AI,
            animation: "tutorBounce 1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
            "@keyframes tutorBounce": {
              "0%,80%,100%": { transform: "translateY(0)", opacity: 0.5 },
              "40%": { transform: "translateY(-4px)", opacity: 1 },
            },
          }}
        />
      ))}
    </Stack>
  );
}

export function AITutorSidebar({
  onClose,
  contextNote,
  problemTitle,
  problemId,
  code,
  language,
  problemDescription,
  failingTest,
}: {
  onClose: () => void;
  contextNote?: string;
  problemTitle?: string;
  problemId?: string | number;
  code?: string;
  language?: string;
  problemDescription?: string;
  failingTest?: FailingTest | null;
}) {
  const [messages, setMessages] = React.useState<Message[]>([GREETING]);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const replyIdx = React.useRef(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  // Restore saved conversation when the tutor opens for a real problem.
  React.useEffect(() => {
    if (!problemId || problemId === "general") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/api/ai/tutor/${problemId}`);
        const hist = res.data?.history || res.data?.data?.history || [];
        if (!cancelled && hist.length) {
          setMessages([
            GREETING,
            ...hist.map((m: { role: string; content: string }) => ({
              role: (m.role === "user" ? "user" : "ai") as "user" | "ai",
              content: m.content,
            })),
          ]);
        }
      } catch {
        /* keep the greeting on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  // When a submission fails, nudge the conversation toward debugging.
  React.useEffect(() => {
    if (!contextNote) return;
    const content =
      failingTest && !failingTest.hidden
        ? `I see your submission failed on the input \`${failingTest.input}\` — your code returned \`${failingTest.output}\` but the expected answer was \`${failingTest.expected}\`. Before changing anything, can you trace your logic by hand on that input and tell me where it diverges?`
        : failingTest && failingTest.hidden
          ? `Your submission failed on a hidden test. The public samples passed, so think about edge cases — empty input, the largest values, duplicates, or boundaries. Which edge case do you think your code might not handle?`
          : `I see your submission failed on a test. Let's not jump to the fix — what does your code currently return for that input, and what did you expect instead?`;
    setMessages((prev) => [...prev, { role: "ai", content }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextNote]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setIsTyping(true);

    try {
      let failContext: string | null = null;
      if (failingTest) {
        failContext = failingTest.hidden
          ? `\n\n[The student's latest submission failed on a HIDDEN test case. The specific input/expected output are withheld — guide them to reason about edge cases without revealing answers.]`
          : `\n\n[The student's latest submission failed on this test]\nInput: ${failingTest.input}\nExpected output: ${failingTest.expected}\nTheir output: ${failingTest.output}\nGuide them to find the discrepancy themselves — do NOT give the corrected code.`;
      }
      const descParts = [
        problemTitle ? `Title: ${problemTitle}` : null,
        problemDescription || null,
        failContext,
      ].filter(Boolean);
      const res = await api.post(
        "/api/ai/tutor",
        {
          problemId: problemId || "general",
          problemDescription: descParts.length ? descParts.join("\n\n") : "General coding question",
          code:
            code && code.trim()
              ? `Language: ${language || "unknown"}\n\n${code}`
              : "(the student has not written any code yet)",
          message: text,
        },
        { timeout: 15000 },
      );
      const reply =
        res.data?.data?.response ||
        res.data?.response ||
        FALLBACK_REPLIES[replyIdx.current % FALLBACK_REPLIES.length];
      setMessages((prev) => [...prev, { role: "ai", content: reply }]);
    } catch {
      const reply = FALLBACK_REPLIES[replyIdx.current % FALLBACK_REPLIES.length];
      setMessages((prev) => [...prev, { role: "ai", content: reply }]);
    } finally {
      replyIdx.current += 1;
      setIsTyping(false);
    }
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "surface" }}>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "outlineVariant", flexShrink: 0 }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 26,
              height: 26,
              bgcolor: `color-mix(in srgb, ${AI} 18%, transparent)`,
              color: AI,
              border: "1px solid",
              borderColor: `color-mix(in srgb, ${AI} 40%, transparent)`,
            }}
          >
            <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />
          </Avatar>
          <Typography variant="subtitle2" fontWeight={600}>
            AI Tutor
          </Typography>
          {problemTitle && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 120 }}>
              — {problemTitle}
            </Typography>
          )}
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Close tutor">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Messages */}
      <Box ref={scrollRef} sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
        <Stack spacing={1.5}>
          {messages.map((m, i) => (
            <Stack
              key={i}
              direction="row"
              spacing={1}
              justifyContent={m.role === "user" ? "flex-end" : "flex-start"}
              alignItems="flex-start"
            >
              {m.role === "ai" && (
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 22,
                    height: 22,
                    mt: 0.25,
                    flexShrink: 0,
                    bgcolor: `color-mix(in srgb, ${AI} 18%, transparent)`,
                    color: AI,
                  }}
                >
                  <SmartToyOutlinedIcon sx={{ fontSize: 13 }} />
                </Avatar>
              )}
              <Box
                sx={{
                  maxWidth: "82%",
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  fontSize: "0.85rem",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  ...(m.role === "ai"
                    ? { bgcolor: "surfaceContainerHigh", color: "text.primary", border: "1px solid", borderColor: "outlineVariant" }
                    : { bgcolor: AI, color: "#fff" }),
                }}
              >
                {m.content}
              </Box>
            </Stack>
          ))}

          {isTyping && (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <Avatar variant="rounded" sx={{ width: 22, height: 22, mt: 0.25, flexShrink: 0, bgcolor: `color-mix(in srgb, ${AI} 18%, transparent)`, color: AI }}>
                <SmartToyOutlinedIcon sx={{ fontSize: 13 }} />
              </Avatar>
              <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: "surfaceContainerHigh", border: "1px solid", borderColor: "outlineVariant" }}>
                <TypingDots />
              </Box>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Suggestions (only at the start) */}
      {messages.length <= 2 && !isTyping && (
        <Box sx={{ px: 1.5, pb: 1, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {SUGGESTIONS.map((s) => (
            <Chip
              key={s}
              icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: "0.85rem !important" }} />}
              label={s}
              size="small"
              onClick={() => send(s)}
              sx={{
                cursor: "pointer",
                color: AI,
                bgcolor: `color-mix(in srgb, ${AI} 8%, transparent)`,
                border: "1px solid",
                borderColor: `color-mix(in srgb, ${AI} 30%, transparent)`,
                "& .MuiChip-icon": { color: "inherit" },
                "&:hover": { bgcolor: `color-mix(in srgb, ${AI} 16%, transparent)` },
              }}
            />
          ))}
        </Box>
      )}

      {/* Input */}
      <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "outlineVariant", flexShrink: 0 }}>
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Ask a guiding question…"
          size="small"
          fullWidth
          slotProps={{
            htmlInput: { "aria-label": "Ask the AI tutor" },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => send(input)}
                    disabled={!input.trim()}
                    aria-label="Send"
                    sx={{ color: AI }}
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, textAlign: "center" }}>
          The tutor guides with questions — it won&apos;t hand over the full solution.
        </Typography>
      </Box>
    </Box>
  );
}
