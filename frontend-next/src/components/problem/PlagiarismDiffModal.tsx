"use client";

import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import CloseIcon from "@mui/icons-material/Close";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import { EmptyState, ErrorState } from "@/components/ui/States";
import api from "@/lib/api";

interface DiffProblem {
  title: string;
  language: string;
  codeA: string | null;
  codeB: string | null;
}
interface DiffData {
  similarity: number;
  studentA: { name: string; email: string };
  studentB: { name: string; email: string };
  problems: DiffProblem[];
}

const norm = (line: string) => line.trim().replace(/\s+/g, " ");

/** Normalized non-empty lines that appear on both sides — a lightweight
 *  "matched lines" heuristic for highlighting copied code. */
function matchedSet(a: string | null, b: string | null): Set<string> {
  const set = new Set<string>();
  if (!a || !b) return set;
  const bSet = new Set(b.split("\n").map(norm).filter((l) => l.length > 2));
  for (const l of a.split("\n").map(norm)) {
    if (l.length > 2 && bSet.has(l)) set.add(l);
  }
  return set;
}

function simColor(sim: number) {
  return sim >= 90 ? "error.main" : sim >= 75 ? "warning.main" : "primary.main";
}

function CodePane({ code, matched, title }: { code: string | null; matched: Set<string>; title: string }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
        {title}
      </Typography>
      {!code ? (
        <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, p: 2 }}>
          <Typography variant="caption" color="text.secondary" fontStyle="italic">
            No accepted submission for this problem.
          </Typography>
        </Box>
      ) : (
        <Box
          component="pre"
          sx={{
            m: 0,
            border: "1px solid",
            borderColor: "outlineVariant",
            borderRadius: 2,
            overflow: "auto",
            maxHeight: 360,
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            lineHeight: 1.6,
          }}
        >
          {code.split("\n").map((line, i) => {
            const hit = norm(line).length > 2 && matched.has(norm(line));
            return (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  bgcolor: hit ? "color-mix(in srgb, var(--mui-palette-warning-main) 20%, transparent)" : "transparent",
                }}
              >
                <Box component="span" sx={{ userSelect: "none", color: "text.disabled", px: 1, textAlign: "right", width: 36, flexShrink: 0 }}>
                  {i + 1}
                </Box>
                <Box component="code" sx={{ px: 1, whiteSpace: "pre" }}>
                  {line || " "}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export function PlagiarismDiffModal({
  assignmentId,
  pairId,
  onClose,
}: {
  assignmentId: string;
  pairId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<DiffData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pairId) return;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .get(`/api/faculty/assignments/${assignmentId}/plagiarism/${pairId}/diff`)
      .then((r) => {
        if (r.data?.success) setData(r.data.data);
        else setError("Failed to load comparison");
      })
      .catch((e) => setError(e?.response?.data?.error || "Failed to load comparison"))
      .finally(() => setLoading(false));
  }, [assignmentId, pairId]);

  const matchedByProblem = React.useMemo(
    () => (data?.problems ?? []).map((p) => matchedSet(p.codeA, p.codeB)),
    [data],
  );

  return (
    <Dialog open={pairId != null} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CodeOutlinedIcon sx={{ color: "warning.main" }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>Code Comparison</Typography>
            {data && (
              <Typography variant="caption" color="text.secondary">
                {data.studentA.name} vs {data.studentB.name} ·{" "}
                <Box component="span" sx={{ fontWeight: 700, color: simColor(data.similarity) }}>
                  {data.similarity.toFixed(0)}% similar
                </Box>
              </Typography>
            )}
          </Box>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Stack spacing={1}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
        ) : error || !data ? (
          <ErrorState title="Couldn't load comparison" description={error ?? undefined} />
        ) : data.problems.length === 0 ? (
          <EmptyState icon={<CodeOutlinedIcon />} title="No accepted submissions to compare" />
        ) : (
          <Stack spacing={3}>
            <Typography variant="caption" color="text.secondary">
              Highlighted lines appear in <Box component="span" sx={{ fontWeight: 700, color: "warning.main" }}>both</Box> submissions.
            </Typography>
            {data.problems.map((p, i) => (
              <Box key={i}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>{p.title}</Typography>
                  <Chip label={p.language} size="small" sx={{ fontFamily: "ui-monospace, monospace", bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                </Stack>
                <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
                  <CodePane code={p.codeA} matched={matchedByProblem[i]} title={data.studentA.name} />
                  <CodePane code={p.codeB} matched={matchedByProblem[i]} title={data.studentB.name} />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
