"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AddIcon, CloseIcon, AutoAwesomeOutlinedIcon, VisibilityOutlinedIcon, VisibilityOffOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { AuthoringShell, CheckLine, type SaveState, type AuthoringStep } from "@/components/faculty/AuthoringShell";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

interface TestCase { input: string; output: string; is_public?: boolean; score?: number }
interface ProblemDraft {
  title: string;
  description: string;
  difficulty: string;
  tags: string[];
  test_cases: TestCase[];
  scoring_mode: "acm" | "oi";
  max_score: number;
  editorial: string;
  editorial_visible_at: string;
  status: string;
}

const EMPTY: ProblemDraft = {
  title: "", description: "", difficulty: "easy", tags: [], test_cases: [],
  scoring_mode: "acm", max_score: 100, editorial: "", editorial_visible_at: "", status: "draft",
};

export default function ProblemAuthoringPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [step, setStep] = React.useState(0);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [draft, setDraft] = React.useState<ProblemDraft>(EMPTY);
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [genNotice, setGenNotice] = React.useState<{ severity: "success" | "warning" | "error"; text: string } | null>(null);

  // Mirror of `draft` advanced synchronously, so two edits in one tick compose
  // instead of the second overwriting the first, and so the debounced save always
  // sends the newest values.
  const draftRef = React.useRef<ProblemDraft>(EMPTY);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);

  React.useEffect(() => {
    let alive = true;
    api
      .get(`/api/faculty/problems/${id}`)
      .then((r) => {
        if (!alive || !r.data?.success) return;
        const p = r.data.data;
        const next: ProblemDraft = {
          title: p.title ?? "",
          description: p.description ?? "",
          difficulty: (p.difficulty ?? "easy").toLowerCase(),
          tags: p.tags ?? [],
          test_cases: p.test_cases ?? [],
          scoring_mode: p.scoring_mode === "oi" ? "oi" : "acm",
          max_score: p.max_score ?? 100,
          editorial: p.editorial ?? "",
          editorial_visible_at: p.editorial_visible_at ? String(p.editorial_visible_at).slice(0, 16) : "",
          status: p.status ?? "published",
        };
        draftRef.current = next;
        setDraft(next);
      })
      .catch((e) => { if (alive) setLoadError(apiErrorMessage(e, "Couldn't load this problem.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const save = React.useCallback(() => {
    const cur = draftRef.current;
    setSaveState("saving");
    return api
      .put(`/api/faculty/problems/${id}`, {
        title: cur.title,
        description: cur.description,
        difficulty: cur.difficulty,
        tags: cur.tags,
        scoring_mode: cur.scoring_mode,
        max_score: cur.max_score,
        editorial: cur.editorial,
        editorial_visible_at: cur.editorial_visible_at || undefined,
        // Only send test cases once there is at least one complete pair — the API
        // rejects an all-empty set, and a half-typed row shouldn't fail the autosave.
        ...(cur.test_cases.some((t) => t.input.trim() && t.output.trim())
          ? { test_cases: cur.test_cases.filter((t) => t.input.trim() && t.output.trim()) }
          : {}),
      })
      .then(() => { dirty.current = false; setSaveState("saved"); })
      .catch((e) => {
        setSaveState("error");
        toast(apiErrorMessage(e, "Autosave failed."), { severity: "error" });
      });
  }, [id, toast]);

  const edit = React.useCallback((make: (cur: ProblemDraft) => Partial<ProblemDraft>) => {
    const next = { ...draftRef.current, ...make(draftRef.current) };
    draftRef.current = next;
    setDraft(next);
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  // Flush a pending save on unmount so navigating away can't drop the last edit.
  React.useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirty.current) save();
  }, [save]);

  // Warn on tab close while a save is still pending.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const completeCases = draft.test_cases.filter((t) => t.input.trim() && t.output.trim());
  const readyToPublish = !!draft.title.trim() && !!draft.description.trim() && completeCases.length > 0;

  const generateTests = async () => {
    if (!draft.title.trim() || !draft.description.trim()) {
      toast("Add a title and statement first — generation reads them.", { severity: "warning" });
      return;
    }
    setGenerating(true);
    setGenNotice(null);
    try {
      const r = await api.post("/api/faculty/ai/generate-tests", {
        title: draft.title, description: draft.description,
      });
      const data = r.data?.data;
      if (data?.testCases) {
        edit(() => ({
          test_cases: data.testCases.map((tc: TestCase) => ({
            input: tc.input, output: tc.output, is_public: !!tc.is_public,
          })),
          difficulty: data.suggestedDifficulty ?? draftRef.current.difficulty,
        }));
        const v = data.verification;
        const dropped = v?.rejected?.length ?? 0;
        setGenNotice({
          severity: "success",
          text: `${data.testCases.length} case${data.testCases.length === 1 ? "" : "s"} verified by running a reference solution`
            + (v?.samplesChecked ? ` (reproduced ${v.samplesPassed}/${v.samplesChecked} example${v.samplesChecked === 1 ? "" : "s"} from your statement)` : "")
            + (dropped ? `. ${dropped} generated input${dropped === 1 ? "" : "s"} dropped — the reference couldn't run on ${dropped === 1 ? "it" : "them"}.` : "."),
        });
      }
    } catch (e) {
      const err = e as { response?: { data?: { code?: string; error?: string } } };
      const code = err?.response?.data?.code;
      if (code === "REFERENCE_UNRELIABLE" || code === "NO_CASES") {
        setGenNotice({ severity: "warning", text: `${err.response?.data?.error} Nothing was changed.` });
      } else if (code === "JUDGE0_UNREACHABLE") {
        setGenNotice({
          severity: "error",
          text: "Judge0 isn't reachable, so expected outputs can't be verified. Test cases are never generated unverified — start Judge0 and try again.",
        });
      } else {
        toast(apiErrorMessage(e, "Generation failed."), { severity: "error" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (status: "draft" | "published") => {
    setPublishing(true);
    setPublishError("");
    try {
      // Make sure the newest edits are stored before flipping visibility.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) await save();

      const r = await api.patch(`/api/faculty/problems/${id}/status`, { status });
      edit(() => ({ status }));
      const warnings: string[] = r.data?.data?.warnings ?? [];
      toast(status === "published" ? "Published — students can see it now" : "Unpublished — hidden from students", {
        severity: "success",
      });
      warnings.forEach((w) => toast(w, { severity: "warning", duration: 8000 }));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setPublishError(err?.response?.data?.error || apiErrorMessage(e, "Couldn't change visibility."));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={40} width="40%" />
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }
  if (loadError) {
    return (
      <Box>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/faculty/problems")}>Back</Button>}>
          {loadError}
        </Alert>
      </Box>
    );
  }

  // ── Step 1: details ────────────────────────────────────────────────────────
  const detailsStep: AuthoringStep = {
    label: "Details",
    hint: "Name the problem and describe how it is scored.",
    blockedReason: draft.title.trim() ? undefined : "Give the problem a title first",
    content: (
      <Stack spacing={2.5}>
        <TextField
          label="Title" required fullWidth size="small" value={draft.title}
          placeholder="Two Sum"
          onChange={(e) => { const v = e.target.value; edit(() => ({ title: v })); }}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select label="Difficulty" size="small" sx={{ width: { sm: 160 } }} value={draft.difficulty}
            onChange={(e) => { const v = e.target.value; edit(() => ({ difficulty: v })); }}
          >
            {DIFFICULTIES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
          </TextField>
          <TextField
            label="Tags (comma separated)" size="small" sx={{ flex: 1 }} value={draft.tags.join(", ")}
            placeholder="array, hashmap, sorting"
            onChange={(e) => { const v = e.target.value; edit(() => ({ tags: v.split(",").map((t) => t.trim()).filter(Boolean) })); }}
          />
        </Stack>

        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>Scoring</Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <SegmentedButtons<"acm" | "oi">
              value={draft.scoring_mode}
              onChange={(v) => edit(() => ({ scoring_mode: v }))}
              segments={[{ value: "acm", label: "ACM" }, { value: "oi", label: "OI" }]}
              ariaLabel="Scoring mode"
            />
            {draft.scoring_mode === "oi" && (
              <TextField
                label="Max score" type="number" size="small" sx={{ width: 130 }} value={draft.max_score}
                onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 100); edit(() => ({ max_score: v })); }}
              />
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            {draft.scoring_mode === "acm"
              ? "ACM: binary verdict — the first accepted submission counts, wrong ones carry a penalty."
              : "OI: partial credit — points awarded per passing test case."}
          </Typography>
        </Box>
      </Stack>
    ),
  };

  // ── Step 2: statement ──────────────────────────────────────────────────────
  const statementStep: AuthoringStep = {
    label: "Statement",
    hint: "Markdown is supported. The preview is exactly what students will read.",
    blockedReason: draft.description.trim() ? undefined : "Write the problem statement first",
    content: (
      <Stack spacing={2}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <TextField
            label="Statement (Markdown)" required fullWidth multiline minRows={14} size="small"
            value={draft.description}
            placeholder={"Given an array of integers `nums`…\n\n**Constraints**\n- 1 <= n <= 1000\n\n**Example**\n\nInput:\n`2 3`\n\nOutput:\n`5`"}
            onChange={(e) => { const v = e.target.value; edit(() => ({ description: v })); }}
            slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 13 } } }}
          />
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, p: 2, minHeight: 320, overflowX: "auto" }}>
            <Typography variant="overline" color="text.secondary">Student preview</Typography>
            {draft.description.trim() ? (
              <Box sx={{ "& pre": { overflowX: "auto", bgcolor: "surfaceContainerHigh", p: 1.5, borderRadius: 1 }, "& code": { fontFamily: "ui-monospace, monospace", fontSize: 13 }, "& table": { borderCollapse: "collapse" }, "& td, & th": { border: "1px solid", borderColor: "outlineVariant", px: 1, py: 0.5 } }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.description}</ReactMarkdown>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Nothing to preview yet.</Typography>
            )}
          </Box>
        </Box>

        <Divider />
        <Typography variant="overline" color="text.secondary">Editorial (optional)</Typography>
        <TextField
          fullWidth multiline minRows={4} size="small" value={draft.editorial}
          placeholder="Explain the intended approach, complexity and key insight…"
          onChange={(e) => { const v = e.target.value; edit(() => ({ editorial: v })); }}
        />
        <TextField
          label="Reveal editorial at" type="datetime-local" size="small" sx={{ maxWidth: 260 }}
          value={draft.editorial_visible_at}
          onChange={(e) => { const v = e.target.value; edit(() => ({ editorial_visible_at: v })); }}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText="Leave blank to keep it hidden from students."
        />
      </Stack>
    ),
  };

  // ── Step 3: test cases ─────────────────────────────────────────────────────
  const testCasesStep: AuthoringStep = {
    label: "Test cases",
    hint: "Expected outputs from AI generation come from executing a reference solution, never from the model guessing.",
    blockedReason: completeCases.length > 0 ? undefined : "Add at least one complete test case",
    content: (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button
            size="small" variant="outlined" color="secondary" startIcon={<AutoAwesomeOutlinedIcon />}
            onClick={generateTests} disabled={generating}
          >
            {generating ? "Generating & verifying…" : "Generate verified cases"}
          </Button>
          <Button
            size="small" variant="outlined" startIcon={<AddIcon />}
            onClick={() => edit((cur) => ({ test_cases: [...cur.test_cases, { input: "", output: "", is_public: cur.test_cases.length === 0 }] }))}
          >
            Add case
          </Button>
        </Stack>

        {genNotice && (
          <Alert severity={genNotice.severity} onClose={() => setGenNotice(null)}>{genNotice.text}</Alert>
        )}

        {draft.test_cases.length === 0 ? (
          <Alert severity="info">
            No test cases yet. Add them by hand, or generate a verified set from the statement.
          </Alert>
        ) : (
          <TableContainer sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
            <Table size="small" sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600 } }}>
                  <TableCell sx={{ width: 44 }}>#</TableCell>
                  <TableCell>Input</TableCell>
                  <TableCell>Expected output</TableCell>
                  <TableCell align="center" sx={{ width: 96 }}>
                    <Tooltip title="Shown to students as a worked example"><span>Sample</span></Tooltip>
                  </TableCell>
                  <TableCell sx={{ width: 48 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {draft.test_cases.map((tc, i) => {
                  const incomplete = !tc.input.trim() || !tc.output.trim();
                  return (
                    <TableRow key={i} sx={{ bgcolor: incomplete ? "warningContainer" : undefined }}>
                      <TableCell sx={{ color: "text.secondary" }}>{i + 1}</TableCell>
                      <TableCell>
                        <TextField
                          fullWidth multiline maxRows={6} size="small" variant="standard" placeholder="stdin"
                          value={tc.input}
                          onChange={(e) => { const v = e.target.value; edit((cur) => ({ test_cases: cur.test_cases.map((x, j) => (j === i ? { ...x, input: v } : x)) })); }}
                          slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth multiline maxRows={6} size="small" variant="standard" placeholder="expected stdout"
                          value={tc.output}
                          onChange={(e) => { const v = e.target.value; edit((cur) => ({ test_cases: cur.test_cases.map((x, j) => (j === i ? { ...x, output: v } : x)) })); }}
                          slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Checkbox
                          size="small" checked={!!tc.is_public}
                          onChange={(e) => { const v = e.target.checked; edit((cur) => ({ test_cases: cur.test_cases.map((x, j) => (j === i ? { ...x, is_public: v } : x)) })); }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small" aria-label={`Remove test case ${i + 1}`}
                          onClick={() => edit((cur) => ({ test_cases: cur.test_cases.filter((_, j) => j !== i) }))}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography variant="caption" color="text.secondary">
          {completeCases.length} of {draft.test_cases.length} case{draft.test_cases.length === 1 ? "" : "s"} complete
          {draft.test_cases.length > completeCases.length ? " — incomplete rows are highlighted and won't be saved." : "."}
        </Typography>
      </Stack>
    ),
  };

  // ── Step 4: review & publish ────────────────────────────────────────────────
  const isPublished = draft.status === "published";
  const reviewStep: AuthoringStep = {
    label: "Review & publish",
    hint: isPublished
      ? "This problem is live. Edits are saved immediately — unpublish it first if you need to rework it."
      : "Nothing here is visible to students until you publish.",
    content: (
      <Stack spacing={2}>
        <Stack spacing={1}>
          <CheckLine ok={!!draft.title.trim()}>Title</CheckLine>
          <CheckLine ok={!!draft.description.trim()}>Problem statement</CheckLine>
          <CheckLine ok={completeCases.length > 0}>
            {completeCases.length} complete test case{completeCases.length === 1 ? "" : "s"}
          </CheckLine>
          <CheckLine ok={completeCases.some((t) => t.is_public)}>
            At least one sample case shown to students {completeCases.some((t) => t.is_public) ? "" : "(optional, but students see no example without one)"}
          </CheckLine>
          <CheckLine ok={!!draft.editorial.trim()}>Editorial {draft.editorial.trim() ? "" : "(optional)"}</CheckLine>
        </Stack>

        {publishError && <Alert severity="warning">{publishError}</Alert>}

        <Divider />

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={isPublished ? "Published" : "Draft"}
            sx={{
              bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh",
              color: isPublished ? "onSuccessContainer" : "onSurfaceVariant",
              fontWeight: 600,
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {isPublished
              ? "Students can find this in the problem list."
              : "Hidden from the student catalogue, and it can't be added to an assignment yet."}
          </Typography>
        </Stack>

        {!isPublished && !readyToPublish && (
          <Alert severity="warning">
            <AlertTitle sx={{ fontSize: 14 }}>Not ready to publish</AlertTitle>
            A problem needs a title, a statement and at least one complete test case, otherwise it
            cannot be graded.
          </Alert>
        )}
      </Stack>
    ),
  };

  const steps = [detailsStep, statementStep, testCasesStep, reviewStep];

  return (
    <AuthoringShell
      title={draft.title}
      subtitle={`${draft.difficulty} · ${completeCases.length} test case${completeCases.length === 1 ? "" : "s"}`}
      statusChip={
        <Chip
          size="small"
          label={isPublished ? "Published" : "Draft"}
          sx={{
            height: 22, fontWeight: 600,
            bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh",
            color: isPublished ? "onSuccessContainer" : "onSurfaceVariant",
          }}
        />
      }
      steps={steps}
      step={step}
      onStepChange={(n) => setStep(Math.max(0, Math.min(steps.length - 1, n)))}
      saveState={saveState}
      onRetrySave={save}
      onExit={() => router.push("/faculty/problems")}
      finalAction={
        isPublished ? (
          <Button
            variant="outlined" color="warning" startIcon={<VisibilityOffOutlinedIcon />}
            disabled={publishing} onClick={() => setStatus("draft")}
          >
            {publishing ? "Working…" : "Unpublish"}
          </Button>
        ) : (
          <Tooltip title={readyToPublish ? "" : "Complete the checklist above first"}>
            <span>
              <Button
                variant="contained" color="success" startIcon={<VisibilityOutlinedIcon />}
                disabled={publishing || !readyToPublish} onClick={() => setStatus("published")}
              >
                {publishing ? "Publishing…" : "Publish to students"}
              </Button>
            </span>
          </Tooltip>
        )
      }
    />
  );
}
