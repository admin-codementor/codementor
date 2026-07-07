"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import { AddIcon, EditOutlinedIcon, DeleteOutlineIcon, UploadFileOutlinedIcon, DescriptionOutlinedIcon, AutoAwesomeOutlinedIcon, CloseIcon, ExpandMoreIcon, CodeOffOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const STUB_LANGUAGES = [
  { id: 71, name: "Python", placeholder: "def solve(s: str) -> int:\n    pass\n" },
  { id: 63, name: "JavaScript", placeholder: "var solve = function(s) {\n    \n};\n" },
  { id: 62, name: "Java", placeholder: "class Solution {\n    public int solve(String s) {\n        \n    }\n}\n" },
  { id: 54, name: "C++", placeholder: "#include <bits/stdc++.h>\nusing namespace std;\nint solve(string s) {\n    \n}\n" },
];

interface TestCase {
  input: string;
  output: string;
  is_public?: boolean;
  score?: number;
}
interface Problem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
  totalSubmissions: number;
  acceptanceRate: number;
}

// ── Collapsible form section ──────────────────────────────────────────────────
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        sx={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          px: 2, py: 1.25, border: 0, bgcolor: "transparent", cursor: "pointer", color: "text.secondary", font: "inherit",
        }}
      >
        <Typography variant="overline">{label}</Typography>
        <ExpandMoreIcon sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

// ── Create / Edit dialog ──────────────────────────────────────────────────────
function ProblemDialog({
  open,
  editing,
  onClose,
  onSaved,
  toast,
}: {
  open: boolean;
  editing: Problem | null;
  onClose: () => void;
  onSaved: () => void;
  toast: (m: string, t?: "success" | "error") => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [difficulty, setDifficulty] = React.useState<string>("easy");
  const [tagsInput, setTagsInput] = React.useState("");
  const [testCases, setTestCases] = React.useState<TestCase[]>([{ input: "", output: "", is_public: true }]);
  const [stubs, setStubs] = React.useState<Record<number, string>>({});
  const [scoringMode, setScoringMode] = React.useState<"acm" | "oi">("acm");
  const [maxScore, setMaxScore] = React.useState(100);
  const [editorial, setEditorial] = React.useState("");
  const [editorialVisibleAt, setEditorialVisibleAt] = React.useState("");
  const [usesChecker, setUsesChecker] = React.useState(false);
  const [checkerLanguageId, setCheckerLanguageId] = React.useState(STUB_LANGUAGES[0].id);
  const [checkerCode, setCheckerCode] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [aiGenerating, setAiGenerating] = React.useState(false);

  // Reset form whenever the dialog opens (create or edit).
  React.useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setDescription("");
    setDifficulty(editing?.difficulty?.toLowerCase() ?? "easy");
    setTagsInput((editing?.tags ?? []).join(", "));
    setTestCases([{ input: "", output: "", is_public: true }]);
    setStubs({});
    setScoringMode("acm");
    setMaxScore(100);
    setEditorial("");
    setEditorialVisibleAt("");
    setUsesChecker(false);
    setCheckerLanguageId(STUB_LANGUAGES[0].id);
    setCheckerCode("");
  }, [open, editing]);

  const updateTC = (i: number, field: keyof TestCase, val: string | boolean | number) =>
    setTestCases((tcs) => tcs.map((tc, idx) => (idx === i ? { ...tc, [field]: val } : tc)));

  const handleAIGenerate = async () => {
    if (!title.trim() || !description.trim()) {
      toast("Enter title and description first", "error");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await api.post("/api/faculty/ai/generate-tests", { title, description });
      if (res.data?.success && res.data.data?.testCases) {
        setTestCases(res.data.data.testCases.map((tc: { input: string; output: string }) => ({ input: tc.input, output: tc.output, is_public: false })));
        if (res.data.data.suggestedDifficulty) setDifficulty(res.data.data.suggestedDifficulty);
        toast(`Generated ${res.data.data.testCases.length} test cases`);
      }
    } catch {
      toast("AI generation failed", "error");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      toast("Title and description are required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        difficulty,
        tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        test_cases: testCases.filter((tc) => tc.input.trim() && tc.output.trim()),
        stubs,
        scoring_mode: scoringMode,
        max_score: maxScore,
        editorial: editorial.trim() || undefined,
        editorial_visible_at: editorialVisibleAt || undefined,
        uses_checker: usesChecker,
        checker_code: usesChecker ? checkerCode : "",
        checker_language_id: usesChecker ? checkerLanguageId : null,
      };
      if (editing) {
        await api.put(`/api/faculty/problems/${editing.id}`, payload);
        toast("Problem updated");
      } else {
        await api.post("/api/faculty/problems", payload);
        toast("Problem created");
      }
      onSaved();
      onClose();
    } catch {
      toast("Failed to save problem", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {editing ? "Edit Problem" : "Create New Problem"}
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum" size="small" fullWidth />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} size="small" sx={{ width: { sm: 160 } }}>
              {DIFFICULTIES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
            </TextField>
            <TextField label="Tags (comma-separated)" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="array, hashmap, sorting" size="small" sx={{ flex: 1 }} />
          </Stack>
          <TextField label="Description" required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Given an array of integers…" size="small" fullWidth multiline rows={5} />

          {/* Scoring mode */}
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>Scoring Mode</Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <SegmentedButtons<"acm" | "oi">
                value={scoringMode}
                onChange={setScoringMode}
                segments={[{ value: "acm", label: "ACM" }, { value: "oi", label: "OI" }]}
                ariaLabel="Scoring mode"
              />
              {scoringMode === "oi" && (
                <TextField label="Max score" type="number" size="small" value={maxScore} onChange={(e) => setMaxScore(Math.max(1, parseInt(e.target.value) || 100))} sx={{ width: 120 }} />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {scoringMode === "acm" ? "ACM: binary verdict — first accepted counts, penalties for wrong submissions." : "OI: partial score — points per passing test case."}
            </Typography>
          </Box>

          {/* Test cases */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="overline" color="text.secondary">Test Cases</Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" color="secondary" startIcon={<AutoAwesomeOutlinedIcon />} onClick={handleAIGenerate} disabled={aiGenerating}>
                  {aiGenerating ? "Generating…" : "AI Generate"}
                </Button>
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setTestCases((t) => [...t, { input: "", output: "", is_public: false }])}>Add</Button>
              </Stack>
            </Stack>
            <Stack spacing={1.5} sx={{ maxHeight: 260, overflowY: "auto", pr: 0.5 }}>
              {testCases.map((tc, i) => (
                <Box key={i} sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, p: 1.5 }}>
                  <Stack direction="row" spacing={1}>
                    <TextField label={`Input ${i + 1}`} value={tc.input} onChange={(e) => updateTC(i, "input", e.target.value)} size="small" fullWidth multiline rows={2} slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }} />
                    <TextField label={`Expected ${i + 1}`} value={tc.output} onChange={(e) => updateTC(i, "output", e.target.value)} size="small" fullWidth multiline rows={2} slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }} />
                    <IconButton size="small" onClick={() => setTestCases((tcs) => tcs.filter((_, idx) => idx !== i))} aria-label="Remove test case"><CloseIcon fontSize="small" /></IconButton>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.5 }}>
                    <FormControlLabel control={<Checkbox size="small" checked={tc.is_public ?? false} onChange={(e) => updateTC(i, "is_public", e.target.checked)} />} label={<Typography variant="caption">Public (shown to students)</Typography>} />
                    {scoringMode === "oi" && (
                      <TextField label="Points" type="number" size="small" value={tc.score ?? 0} onChange={(e) => updateTC(i, "score", parseInt(e.target.value) || 0)} sx={{ width: 100 }} />
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Editorial */}
          <FormSection label="Editorial (optional)">
            <Stack spacing={1.5}>
              <TextField value={editorial} onChange={(e) => setEditorial(e.target.value)} placeholder="Explain the solution approach, complexity, key insights…" size="small" fullWidth multiline rows={5} />
              <TextField label="Auto-publish at (optional)" type="datetime-local" value={editorialVisibleAt} onChange={(e) => setEditorialVisibleAt(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} helperText="Leave blank to keep hidden. Students see it after this time." />
            </Stack>
          </FormSection>

          {/* Stubs */}
          <FormSection label="Starter Code (optional)">
            <Stack spacing={1.5}>
              {STUB_LANGUAGES.map((lang) => (
                <TextField
                  key={lang.id}
                  label={lang.name}
                  value={stubs[lang.id] ?? ""}
                  onChange={(e) => setStubs((prev) => ({ ...prev, [lang.id]: e.target.value }))}
                  placeholder={lang.placeholder}
                  size="small"
                  fullWidth
                  multiline
                  rows={4}
                  slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }}
                />
              ))}
            </Stack>
          </FormSection>

          {/* Special judge */}
          <FormSection label="Special Judge / Custom Checker (optional)">
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                For problems with multiple correct outputs. The checker reads input, expected, and contestant output from stdin and prints <b>AC</b> on the first line to accept.
              </Typography>
              <FormControlLabel control={<Checkbox checked={usesChecker} onChange={(e) => setUsesChecker(e.target.checked)} />} label={<Typography variant="body2">Enable special judge for this problem</Typography>} />
              {usesChecker && (
                <>
                  <TextField select label="Checker language" value={checkerLanguageId} onChange={(e) => setCheckerLanguageId(parseInt(e.target.value, 10))} size="small">
                    {STUB_LANGUAGES.map((lang) => <MenuItem key={lang.id} value={lang.id}>{lang.name}</MenuItem>)}
                  </TextField>
                  <TextField label="Checker code" value={checkerCode} onChange={(e) => setCheckerCode(e.target.value)} size="small" fullWidth multiline rows={8} slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: "ui-monospace, monospace", fontSize: 12 } } }} />
                </>
              )}
            </Stack>
          </FormSection>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Update Problem" : "Create Problem"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FacultyProblemsPage() {
  const [problems, setProblems] = React.useState<Problem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Problem | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  // Question-paper builder
  const [paperMode, setPaperMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [paperTitle, setPaperTitle] = React.useState("");
  const [exportingPaper, setExportingPaper] = React.useState(false);

  const fileRef = React.useRef<HTMLInputElement>(null);

  const showToast = React.useCallback(
    (message: string, type: "success" | "error" = "success") => toast(message, { severity: type }),
    [toast],
  );

  const fetchProblems = React.useCallback(() => {
    setLoading(true);
    api
      .get("/api/faculty/problems")
      .then((r) => {
        if (r.data?.success) setProblems(r.data.data);
      })
      .catch(() => showToast("Failed to load problems", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  React.useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete problem?",
      description: "This permanently removes the problem and its test cases. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/faculty/problems/${id}`);
      showToast("Problem deleted");
      fetchProblems();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const list = Array.isArray(data) ? data : [data];
        let created = 0;
        for (const p of list) {
          await api.post("/api/faculty/problems", p);
          created++;
        }
        showToast(`Imported ${created} problem${created > 1 ? "s" : ""}`);
        fetchProblems();
      } catch {
        showToast("Import failed — check JSON format", "error");
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const handleExportPaper = async () => {
    if (selectedIds.size === 0) return;
    setExportingPaper(true);
    try {
      const res = await api.post(
        "/api/pdf/question-paper",
        { problem_ids: Array.from(selectedIds), title: paperTitle.trim() || "Question Paper" },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "question_paper.pdf";
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported paper with ${selectedIds.size} problem${selectedIds.size === 1 ? "" : "s"}`);
      setPaperMode(false);
      setSelectedIds(new Set());
      setPaperTitle("");
    } catch {
      showToast("Failed to export question paper", "error");
    } finally {
      setExportingPaper(false);
    }
  };

  return (
    <Box>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={handleBulkImport} />

      <PageHeader
        title="Manage Problems"
        subtitle={`${problems.length} problems created`}
        actions={
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileRef.current?.click()}>Import JSON</Button>
            <Button size="small" variant={paperMode ? "contained" : "outlined"} color="secondary" startIcon={<DescriptionOutlinedIcon />} onClick={() => { setPaperMode((m) => !m); setSelectedIds(new Set()); }}>
              Question Paper
            </Button>
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setDialogOpen(true); }}>Add Problem</Button>
          </Stack>
        }
      />

      {/* Question-paper action bar */}
      {paperMode && (
        <Card variant="outlined" sx={{ p: 1.5, mb: 2, borderColor: "secondary.main", bgcolor: "secondaryContainer" }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
            <Typography variant="body2" fontWeight={600} color="onSecondaryContainer">{selectedIds.size} selected</Typography>
            <TextField value={paperTitle} onChange={(e) => setPaperTitle(e.target.value)} placeholder="Paper title (e.g. Midterm — Set A)" size="small" sx={{ flex: 1 }} />
            <Button variant="contained" color="secondary" startIcon={<DescriptionOutlinedIcon />} disabled={exportingPaper || selectedIds.size === 0} onClick={handleExportPaper}>
              {exportingPaper ? "Exporting…" : "Export Paper PDF"}
            </Button>
          </Stack>
        </Card>
      )}

      {/* Table */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table aria-label="Problems" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                {paperMode && <TableCell padding="checkbox" />}
                <TableCell>Title</TableCell>
                <TableCell sx={{ width: 120 }}>Difficulty</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Submissions</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>AC Rate</TableCell>
                {!paperMode && <TableCell align="right" sx={{ width: 110 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: paperMode ? 5 : 5 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                ))
              ) : problems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={paperMode ? 5 : 6} sx={{ border: 0 }}>
                    <EmptyState icon={<CodeOffOutlinedIcon />} title="No problems yet" description='Click "Add Problem" to create one.' />
                  </TableCell>
                </TableRow>
              ) : (
                problems.map((p) => {
                  const selected = selectedIds.has(p.id);
                  return (
                    <TableRow
                      key={p.id}
                      hover
                      onClick={paperMode ? () => toggleSelect(p.id) : undefined}
                      selected={paperMode && selected}
                      sx={{ cursor: paperMode ? "pointer" : "default", "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}
                    >
                      {paperMode && (
                        <TableCell padding="checkbox"><Checkbox checked={selected} /></TableCell>
                      )}
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{p.title}</Typography>
                        {p.tags?.length > 0 && (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                            {p.tags.slice(0, 3).map((t) => (
                              <Chip key={t} label={t} size="small" variant="outlined" sx={{ height: 20, fontSize: 10, borderColor: "outlineVariant", color: "text.secondary" }} />
                            ))}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell><DifficultyChip difficulty={p.difficulty} /></TableCell>
                      <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace" }}>{p.totalSubmissions}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace" }}>{p.acceptanceRate}%</TableCell>
                      {!paperMode && (
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => { setEditing(p); setDialogOpen(true); }} aria-label="Edit problem"><EditOutlinedIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(p.id)} aria-label="Delete problem"><DeleteOutlineIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <ProblemDialog open={dialogOpen} editing={editing} onClose={() => setDialogOpen(false)} onSaved={fetchProblems} toast={showToast} />
    </Box>
  );
}
