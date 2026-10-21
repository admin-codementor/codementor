"use client";

import * as React from "react";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { CheckCircleIcon, RadioButtonUncheckedIcon } from "@/components/ui/icons";
import { careerKey, type CareerMine, type ReadinessBand, type ResumeResult, type Scorecard } from "@/lib/queries/career";

export const BAND_STYLE: Record<ReadinessBand, { bg: string; fg: string }> = {
  ready: { bg: "successContainer", fg: "onSuccessContainer" },
  almost: { bg: "primaryContainer", fg: "onPrimaryContainer" },
  building: { bg: "warningContainer", fg: "onWarningContainer" },
  not_started: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};

const PART_LABEL: Record<string, string> = {
  contact: "Contact details", sections: "Sections", summary: "Summary", impact: "Impact in bullets",
  length: "Length", keywords: "Role keywords", clean: "Clean writing",
};

function ScoreBar({ label, got, max }: { label: string; got: number; max: number }) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between">
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight={600}>{got} / {max}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={max ? (got / max) * 100 : 0} aria-label={`${label}: ${got} of ${max}`} sx={{ height: 6, borderRadius: 3, mt: 0.5 }} />
    </Box>
  );
}

/** The three checks behind the band, so the student sees exactly what is missing. */
export function ReadinessTab({ data }: { data: CareerMine }) {
  const { readiness: r, rule, labels } = data;
  const s = BAND_STYLE[r.band];
  const rows = [
    { key: "resume", title: "Resume check", ok: r.checks.resume.ok, now: r.checks.resume.value == null ? "Not checked yet" : `Score ${r.checks.resume.value}`, need: `Score ${rule.resume} or more`, tab: "resume", action: "Check my resume" },
    { key: "interview", title: "Mock interview", ok: r.checks.interview.ok, now: r.checks.interview.value == null ? "Not taken yet" : `Best ${r.checks.interview.value} out of 10`, need: `${rule.interview} out of 10 or more`, tab: "interview", action: "Take a mock interview" },
    { key: "practice", title: "Practice", ok: r.checks.practice.ok, now: `${r.checks.practice.value ?? 0} problems solved`, need: `${rule.practice} problems solved`, href: "/app/problems", action: "Practise now" },
  ];
  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip label={labels[r.band]} sx={{ fontWeight: 700, bgcolor: s.bg, color: s.fg }} />
          <Typography variant="body1">{r.passed} of 3 checks passed</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Your placement cell sees this same band. It only counts what you have done on CodeMentor.
        </Typography>
      </Card>
      <Stack spacing={1.5}>
        {rows.map((x) => (
          <Card key={x.key} variant="outlined" sx={{ p: 2, borderColor: "outlineVariant" }}>
            <Stack direction="row" spacing={2} alignItems="center">
              {x.ok ? <CheckCircleIcon color="success" aria-label="Passed" /> : <RadioButtonUncheckedIcon color="disabled" aria-label="Not yet" />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={600}>{x.title}</Typography>
                <Typography variant="body2" color="text.secondary">{x.now} · needs {x.need}</Typography>
              </Box>
              {!x.ok && (x.href
                ? <Button size="small" component={NextLink} href={x.href}>{x.action}</Button>
                : <Button size="small" component={NextLink} href={`/app/career?tab=${x.tab}`}>{x.action}</Button>)}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

function ResumeReport({ r }: { r: ResumeResult }) {
  const tone = r.band === "strong" || r.band === "good" ? "success" : r.band === "needs_work" ? "warning" : "error";
  return (
    <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
      <Stack direction="row" spacing={2} alignItems="baseline" sx={{ mb: 2 }}>
        <Typography variant="h3" component="p" fontWeight={700} color={`${tone}.main`}>{r.score}</Typography>
        <Typography variant="body1" color="text.secondary">out of 100</Typography>
      </Stack>
      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {r.breakdown.map((p) => <ScoreBar key={p.key} label={PART_LABEL[p.key] ?? p.key} got={p.got} max={p.max} />)}
      </Stack>
      {r.suggestions.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>What to fix</Typography>
          <Box component="ul" sx={{ m: 0, pl: 3 }}>
            {r.suggestions.map((t, i) => <Typography key={i} component="li" variant="body2" sx={{ mb: 0.5 }}>{t}</Typography>)}
          </Box>
        </>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        This is a checklist of common resume rules, not a judgement of your experience. Your resume text is not saved, only the score and advice.
      </Typography>
    </Card>
  );
}

export function ResumeTab({ data }: { data: CareerMine }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [role, setRole] = React.useState("software");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ResumeResult | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: ResumeResult }>("/api/career/resume", { text, role });
      setResult(res.data.data);
      qc.invalidateQueries({ queryKey: careerKey });
      toast("Resume checked.", { severity: "success" });
    } catch (e) {
      setError(apiErrorMessage(e, "Could not check your resume."));
    } finally {
      setBusy(false);
    }
  };
  const shown = result ?? data.prep.resume;

  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Paste your resume as plain text. You get a score out of 100 and a list of what to fix. It is free and gives the same answer every time.
        </Typography>
        <Stack spacing={2}>
          <TextField select label="Role you are applying for" value={role} onChange={(e) => setRole(e.target.value)} size="small" sx={{ maxWidth: 280 }}>
            {data.roles.map((r) => <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>)}
          </TextField>
          <TextField label="Resume text" value={text} onChange={(e) => setText(e.target.value)} multiline minRows={10} maxRows={24} fullWidth slotProps={{ htmlInput: { maxLength: 30000 } }} placeholder="Paste your whole resume here" />
          {error && <Alert severity="error">{error}</Alert>}
          <Box><Button variant="contained" onClick={check} disabled={busy || text.trim().length < 30}>{busy ? "Checking…" : "Check my resume"}</Button></Box>
        </Stack>
      </Card>
      {shown && <ResumeReport r={shown} />}
    </Stack>
  );
}

interface Turn { question: string; answer: string }

function ScorecardView({ card }: { card: Scorecard }) {
  return (
    <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
      <Stack direction="row" spacing={2} alignItems="baseline" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Typography variant="h3" component="p" fontWeight={700}>{card.overall}</Typography>
        <Typography variant="body1" color="text.secondary">out of 10 · {card.trackLabel}</Typography>
      </Stack>
      <Stack spacing={2}>
        {card.answers.map((a, i) => (
          <Box key={i}>
            <Typography variant="subtitle2" fontWeight={600}>Q{i + 1}. {a.question}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", my: 0.5 }}>{a.answer || "(no answer)"}</Typography>
            <Typography variant="body2"><b>{a.score} / 10</b>{a.feedback ? ` · ${a.feedback}` : ""}</Typography>
          </Box>
        ))}
        {card.strengths.length > 0 && <Typography variant="body2"><b>Strengths:</b> {card.strengths.join(" · ")}</Typography>}
        {card.improve.length > 0 && <Typography variant="body2"><b>To improve:</b> {card.improve.join(" · ")}</Typography>}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Marked by an AI interviewer, so treat it as practice feedback, not a verdict.
      </Typography>
    </Card>
  );
}

export function InterviewTab({ data }: { data: CareerMine }) {
  const qc = useQueryClient();
  const total = data.interview.questions;
  const [track, setTrack] = React.useState(data.tracks[0]?.key ?? "dsa");
  const [level, setLevel] = React.useState("fresher");
  const [done, setDone] = React.useState<Turn[]>([]);
  const [question, setQuestion] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [card, setCard] = React.useState<Scorecard | null>(null);

  const ask = async (transcript: Turn[]) => {
    const res = await api.post<{ success: boolean; data: { question: string } }>("/api/career/interview/next", { track, level, transcript });
    setQuestion(res.data.data.question);
    setAnswer("");
  };

  const start = async () => {
    setBusy(true); setError(null); setCard(null); setDone([]);
    try { await ask([]); } catch (e) { setError(apiErrorMessage(e, "Could not start the interview.")); } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!question) return;
    const transcript = [...done, { question, answer }];
    setBusy(true); setError(null);
    try {
      if (transcript.length < total) {
        await ask(transcript);
        setDone(transcript);
      } else {
        const res = await api.post<{ success: boolean; data: { scorecard: Scorecard } }>("/api/career/interview/finish", { track, level, transcript });
        setCard(res.data.data.scorecard);
        setQuestion(null); setDone([]);
        qc.invalidateQueries({ queryKey: careerKey });
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Something went wrong. Your answer is still here; try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!data.aiConfigured) {
    return <Alert severity="info">The mock interview uses the AI service, which is not switched on for your college yet. The resume check and your readiness band work without it.</Alert>;
  }

  const number = done.length + 1;
  return (
    <Stack spacing={3}>
      {!question && (
        <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {total} questions, one at a time, then a scorecard. Answer in your own words in a few sentences. Do not use notes or other tools; this is practice for the real thing.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
            <TextField select size="small" label="Interview type" value={track} onChange={(e) => setTrack(e.target.value)} sx={{ minWidth: 240 }}>
              {data.tracks.map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Level" value={level} onChange={(e) => setLevel(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="fresher">Fresher</MenuItem>
              <MenuItem value="intermediate">With internship or projects</MenuItem>
            </TextField>
          </Stack>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Button variant="contained" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start interview"}</Button>
        </Card>
      )}

      {question && (
        <Card variant="outlined" sx={{ p: 3, borderColor: "outlineVariant" }}>
          <Typography variant="caption" color="text.secondary">Question {number} of {total}</Typography>
          <LinearProgress variant="determinate" value={((number - 1) / total) * 100} aria-label={`Question ${number} of ${total}`} sx={{ height: 4, borderRadius: 2, my: 1 }} />
          <Typography variant="h6" component="p" sx={{ mb: 2 }}>{question}</Typography>
          <TextField label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} multiline minRows={4} maxRows={12} fullWidth slotProps={{ htmlInput: { maxLength: data.interview.maxAnswer } }} helperText={`${answer.length} / ${data.interview.maxAnswer}`} />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Button variant="contained" onClick={submit} disabled={busy} sx={{ mt: 2 }}>
            {busy ? "Please wait…" : number === total ? "Finish and get my scorecard" : "Next question"}
          </Button>
        </Card>
      )}

      {card && <ScorecardView card={card} />}

      {!question && !card && data.prep.interviews.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Your earlier interviews</Typography>
          <Stack spacing={1}>
            {data.prep.interviews.map((c, i) => (
              <Card key={i} variant="outlined" sx={{ p: 1.5, borderColor: "outlineVariant" }}>
                <Typography variant="body2">{c.trackLabel} · <b>{c.overall} / 10</b></Typography>
              </Card>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
