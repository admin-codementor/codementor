"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import {
  CodeOutlinedIcon, PsychologyOutlinedIcon, LayersOutlinedIcon, EditOutlinedIcon, SellOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { DifficultyChip } from "@/components/ui/DifficultyChip";

interface BankProblem {
  kind: "problem"; id: string; title: string; difficulty: string; tags: string[];
  status: string; test_case_count: number; used_in_assignments: number; used_in_contests: number;
  author: string | null; can_edit: boolean;
}
interface BankMcq {
  kind: "mcq"; id: string; test_id: string; test_title: string; title: string;
  topic: string | null; category: string; marks: number; option_count: number;
  is_published: boolean; author: string | null;
}
interface Summary {
  problems: number; publishedProblems: number; unusedProblems: number;
  mcqQuestions: number; tests: number;
}

type Kind = "problems" | "mcq";
type Usage = "all" | "unused" | "used";

export default function QuestionBankPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [problems, setProblems] = React.useState<BankProblem[]>([]);
  const [mcq, setMcq] = React.useState<BankMcq[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);

  const [kind, setKind] = React.useState<Kind>("problems");
  const [search, setSearch] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [usage, setUsage] = React.useState<Usage>("all");
  const [tag, setTag] = React.useState("all");

  const load = React.useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get("/api/faculty/question-bank")
      .then((r) => {
        if (!r.data?.success) return;
        setProblems(r.data.data.problems ?? []);
        setMcq(r.data.data.mcqQuestions ?? []);
        setSummary(r.data.data.summary ?? null);
      })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load the question bank.")))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const allTags = React.useMemo(() => {
    const counts = new Map<string, number>();
    problems.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [problems]);

  const q = search.trim().toLowerCase();

  const filteredProblems = problems.filter((p) => {
    if (q && !p.title.toLowerCase().includes(q) && !p.tags.some((t) => t.toLowerCase().includes(q))) return false;
    if (difficulty !== "all" && p.difficulty !== difficulty) return false;
    if (status !== "all" && p.status !== status) return false;
    if (tag !== "all" && !p.tags.includes(tag)) return false;
    const used = p.used_in_assignments + p.used_in_contests > 0;
    if (usage === "unused" && used) return false;
    if (usage === "used" && !used) return false;
    return true;
  });

  const filteredMcq = mcq.filter((m) => {
    if (q && !m.title.toLowerCase().includes(q) && !(m.topic ?? "").toLowerCase().includes(q) && !m.test_title.toLowerCase().includes(q)) return false;
    if (status === "published" && !m.is_published) return false;
    if (status === "draft" && m.is_published) return false;
    return true;
  });

  return (
    <Box>
      <PageHeader
        title="Question bank"
        subtitle="Everything you can reuse, in one place — with how often each item has been used."
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {summary && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
          <StatCard icon={<CodeOutlinedIcon />} label="Coding problems" value={summary.problems} helper={`${summary.publishedProblems} live`} accent="primary" />
          <StatCard icon={<PsychologyOutlinedIcon />} label="MCQ questions" value={summary.mcqQuestions} helper={`across ${summary.tests} test${summary.tests === 1 ? "" : "s"}`} accent="tertiary" />
          <StatCard icon={<LayersOutlinedIcon />} label="Never used" value={summary.unusedProblems} helper="not in any assignment or contest" accent="warning" />
          <StatCard icon={<SellOutlinedIcon />} label="Distinct tags" value={allTags.length} accent="success" />
        </Box>
      )}

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
        <SegmentedButtons<Kind>
          value={kind}
          onChange={setKind}
          segments={[
            { value: "problems", label: `Problems (${problems.length})` },
            { value: "mcq", label: `MCQ (${mcq.length})` },
          ]}
          ariaLabel="Item type"
        />
        <SearchField value={search} onChange={setSearch} placeholder="Title, tag or topic" sx={{ minWidth: 220 }} />
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 130 }}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="published">Published</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
        {kind === "problems" && (
          <>
            <TextField select size="small" label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} sx={{ width: 130 }}>
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="easy">Easy</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="hard">Hard</MenuItem>
            </TextField>
            <TextField select size="small" label="Usage" value={usage} onChange={(e) => setUsage(e.target.value as Usage)} sx={{ width: 140 }}>
              <MenuItem value="all">Any usage</MenuItem>
              <MenuItem value="unused">Never used</MenuItem>
              <MenuItem value="used">Used at least once</MenuItem>
            </TextField>
            <TextField select size="small" label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} sx={{ width: 170 }}>
              <MenuItem value="all">All tags</MenuItem>
              {allTags.map(([t, n]) => <MenuItem key={t} value={t}>{t} ({n})</MenuItem>)}
            </TextField>
          </>
        )}
      </Stack>

      {loading ? (
        <Stack spacing={1}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={52} />)}</Stack>
      ) : kind === "problems" ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 760 }} aria-label="Coding problems">
              <TableHead>
                <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                  <TableCell>Title</TableCell>
                  <TableCell sx={{ width: 96 }}>Status</TableCell>
                  <TableCell sx={{ width: 110 }}>Difficulty</TableCell>
                  <TableCell align="right" sx={{ width: 90 }}>Tests</TableCell>
                  <TableCell align="right" sx={{ width: 130 }}>
                    <Tooltip title="Assignments + contests referencing this problem"><span>Used in</span></Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ width: 70 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredProblems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ border: 0 }}>
                      <EmptyState
                        icon={<CodeOutlinedIcon />}
                        title={problems.length === 0 ? "Nothing in the bank yet" : "Nothing matches those filters"}
                        description={problems.length === 0 ? "Author or import a problem to get started." : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : filteredProblems.map((p) => {
                  const used = p.used_in_assignments + p.used_in_contests;
                  return (
                    <TableRow key={p.id} hover sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{p.title}</Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.25, flexWrap: "wrap", gap: 0.5 }}>
                          {p.author && p.author !== "You" && (
                            <Typography variant="caption" color="text.secondary">by {p.author} ·&nbsp;</Typography>
                          )}
                          {p.tags.slice(0, 4).map((t) => (
                            <Chip
                              key={t} label={t} size="small" variant="outlined"
                              onClick={() => setTag(t)}
                              sx={{ height: 18, fontSize: 10, borderColor: "outlineVariant", color: "text.secondary" }}
                            />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={p.status === "draft" ? "Draft" : "Live"} size="small"
                          sx={{
                            height: 20, fontSize: 10, fontWeight: 600,
                            bgcolor: p.status === "draft" ? "surfaceContainerHigh" : "successContainer",
                            color: p.status === "draft" ? "onSurfaceVariant" : "onSuccessContainer",
                          }}
                        />
                      </TableCell>
                      <TableCell><DifficultyChip difficulty={p.difficulty} /></TableCell>
                      <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: p.test_case_count === 0 ? "warning.main" : undefined }}>
                        {p.test_case_count}
                      </TableCell>
                      <TableCell align="right">
                        {used === 0 ? (
                          <Typography variant="caption" color="text.disabled">never</Typography>
                        ) : (
                          <Tooltip title={`${p.used_in_assignments} assignment(s), ${p.used_in_contests} contest(s)`}>
                            <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace" }}>{used}×</Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={p.can_edit ? "Open in the authoring flow" : `Authored by ${p.author ?? "another faculty member"}`}>
                          <span>
                            <Button
                              size="small" disabled={!p.can_edit} startIcon={<EditOutlinedIcon />}
                              onClick={() => router.push(`/faculty/problems/${p.id}/edit`)}
                            >
                              Open
                            </Button>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ) : (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 700 }} aria-label="MCQ questions">
              <TableHead>
                <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                  <TableCell>Question</TableCell>
                  <TableCell sx={{ width: 150 }}>Topic</TableCell>
                  <TableCell sx={{ width: 180 }}>From test</TableCell>
                  <TableCell align="right" sx={{ width: 80 }}>Marks</TableCell>
                  <TableCell align="right" sx={{ width: 70 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredMcq.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ border: 0 }}>
                      <EmptyState
                        icon={<PsychologyOutlinedIcon />}
                        title={mcq.length === 0 ? "No MCQ questions yet" : "Nothing matches those filters"}
                        description={mcq.length === 0 ? "Create an MCQ test and add questions." : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ) : filteredMcq.map((m) => (
                  <TableRow key={m.id} hover sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                    <TableCell>
                      <Typography variant="body2">{m.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {m.option_count} options{m.author && m.author !== "You" ? ` · by ${m.author}` : ""}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {m.topic
                        ? <Chip label={m.topic} size="small" variant="outlined" sx={{ height: 18, fontSize: 10, borderColor: "outlineVariant" }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{m.test_title}</Typography>
                      <Chip
                        label={m.is_published ? "Live" : "Draft"} size="small"
                        sx={{
                          ml: 0.5, height: 18, fontSize: 9, fontWeight: 600,
                          bgcolor: m.is_published ? "successContainer" : "surfaceContainerHigh",
                          color: m.is_published ? "onSuccessContainer" : "onSurfaceVariant",
                        }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace" }}>{m.marks}</TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => router.push(`/faculty/mcq/${m.test_id}/edit`)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {!loading && kind === "problems" && filteredProblems.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Showing {filteredProblems.length} of {problems.length} problems.
          {usage === "all" && summary && summary.unusedProblems > 0 && (
            <> {summary.unusedProblems} have never been assigned — filter by <strong>Never used</strong> to find reusable material.</>
          )}
        </Typography>
      )}
    </Box>
  );
}
