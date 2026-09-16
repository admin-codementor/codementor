"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import { AutoAwesomeOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export interface QuickCreatedProblem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
  status?: string;
}

/**
 * Lightweight "quick add" form for authoring a brand-new problem without
 * leaving the exam wizard. Mirrors the faculty problem bank's create flow
 * (including AI test-case generation) but only the fields a fast, in-context
 * add needs — no checker/editorial/OI scoring, which stay in the full
 * problem-bank editor for later refinement.
 */
export function QuickCreateProblemForm({
  onCreated,
  onCancel,
}: {
  onCreated: (problem: QuickCreatedProblem) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [difficulty, setDifficulty] = React.useState<string>("easy");
  const [tagsInput, setTagsInput] = React.useState("");
  const [input, setInput] = React.useState("");
  const [output, setOutput] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [generatedCases, setGeneratedCases] = React.useState<{ input: string; output: string; is_public: boolean }[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleGenerate = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Enter a title and description first, then generate test cases.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const res = await api.post("/api/faculty/ai/generate-tests", { title, description });
      const data = res.data?.data;
      if (res.data?.success && data?.testCases?.length) {
        setGeneratedCases(
          data.testCases.map((tc: { input: string; output: string; is_public?: boolean }) => ({
            input: tc.input, output: tc.output, is_public: !!tc.is_public,
          })),
        );
        if (data.suggestedDifficulty) setDifficulty(data.suggestedDifficulty);
      } else {
        setError("Couldn't generate test cases — add one manually below.");
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Test-case generation failed — add one manually below."));
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    const manual = input.trim() && output.trim() ? [{ input, output, is_public: true }] : [];
    const cases = generatedCases.length ? generatedCases : manual;
    if (cases.length === 0) {
      setError("Add at least one test case (or generate with AI) with both an input and an expected output.");
      return;
    }
    setSaving(true);
    setError("");
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const res = await api.post("/api/faculty/problems", {
        title: title.trim(), description: description.trim(), difficulty, tags, test_cases: cases,
      });
      if (res.data?.success) {
        onCreated({ id: res.data.data.id, title: title.trim(), difficulty, tags, status: res.data.data.status });
      }
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't create the problem."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 1.5, mb: 1, border: "1px dashed", borderColor: "outline", borderRadius: 2, bgcolor: "surfaceContainerLow" }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">New problem</Typography>
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        <TextField label="Title" size="small" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Stack direction="row" spacing={1.5}>
          <TextField
            select label="Difficulty" size="small" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} sx={{ width: 130 }}
          >
            {DIFFICULTIES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
          </TextField>
          <TextField label="Tags (comma-separated)" size="small" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="array, sorting" sx={{ flex: 1 }} />
        </Stack>
        <TextField label="Description" size="small" fullWidth multiline rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />

        {generatedCases.length > 0 ? (
          <Alert severity="success" onClose={() => setGeneratedCases([])}>
            {generatedCases.length} test case{generatedCases.length === 1 ? "" : "s"} generated and verified.
          </Alert>
        ) : (
          <Stack direction="row" spacing={1.5}>
            <TextField label="Sample input" size="small" value={input} onChange={(e) => setInput(e.target.value)} multiline rows={2} sx={{ flex: 1 }} />
            <TextField label="Expected output" size="small" value={output} onChange={(e) => setOutput(e.target.value)} multiline rows={2} sx={{ flex: 1 }} />
          </Stack>
        )}

        <Stack direction="row" spacing={1} justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Button size="small" startIcon={<AutoAwesomeOutlinedIcon />} onClick={handleGenerate} disabled={generating || saving}>
            {generating ? "Generating…" : "Generate tests with AI"}
          </Button>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handleSave} disabled={saving || generating}>
              {saving ? "Creating…" : "Create & add"}
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
