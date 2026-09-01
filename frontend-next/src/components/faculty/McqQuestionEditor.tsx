"use client";

import * as React from "react";
import { Reorder, useDragControls } from "framer-motion";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Radio from "@mui/material/Radio";
import Tooltip from "@mui/material/Tooltip";
import Card from "@mui/material/Card";
import {
  AddIcon, CloseIcon, DragHandleIcon, DeleteOutlineIcon, ExpandLessIcon, ExpandMoreIcon,
} from "@/components/ui/icons";

/**
 * The MCQ question list editor — same drag-to-reorder, radio-marks-correct-
 * answer card UI as the standalone MCQ test builder
 * (faculty/mcq/[id]/edit/page.tsx's QuestionCard), pulled out so the new
 * multi-section Exams builder can reuse it per section without duplicating the
 * whole editing UI. The MCQ test builder itself is left untouched — this is a
 * fresh, generalized sibling, not a refactor of a component already relied on
 * in production.
 */
export interface McqQuestion {
  /** Stable client key so reorder and edits survive re-renders. */
  key: string;
  question_text: string;
  options: string[];
  correct_index: number;
  marks: number;
  topic: string;
  explanation: string;
}

let keySeq = 0;
export const newQuestionKey = () => `q${++keySeq}-${Math.random().toString(36).slice(2, 7)}`;
export const blankMcqQuestion = (marks = 1): McqQuestion => ({
  key: newQuestionKey(), question_text: "", options: ["", ""], correct_index: 0, marks, topic: "", explanation: "",
});

export const isMcqQuestionComplete = (q: McqQuestion) =>
  !!q.question_text.trim() &&
  q.options.length >= 2 &&
  q.options.every((o) => o.trim()) &&
  q.correct_index >= 0 &&
  q.correct_index < q.options.length;

function QuestionCard({
  q, index, total, onChange, onDelete, onMove,
}: {
  q: McqQuestion;
  index: number;
  total: number;
  onChange: (make: (cur: McqQuestion) => Partial<McqQuestion>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  const complete = isMcqQuestionComplete(q);

  return (
    <Reorder.Item value={q.key} dragListener={false} dragControls={controls} style={{ listStyle: "none" }}>
      <Card variant="outlined" sx={{ mb: 1.5, borderColor: complete ? "outlineVariant" : "warning.main", p: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box
            onPointerDown={(e) => controls.start(e)}
            sx={{ cursor: "grab", display: "flex", color: "text.disabled", touchAction: "none" }}
            role="button"
            aria-label={`Reorder question ${index + 1}`}
          >
            <DragHandleIcon fontSize="small" />
          </Box>
          <Typography variant="caption" fontWeight={700} color="primary.main">Question {index + 1}</Typography>
          {!complete && (
            <Chip label="Incomplete" size="small" sx={{ height: 18, fontSize: 10, bgcolor: "warningContainer", color: "onWarningContainer" }} />
          )}
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move question ${index + 1} up`}>
            <ExpandLessIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move question ${index + 1} down`}>
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={onDelete} aria-label={`Delete question ${index + 1}`}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>

        <TextField
          fullWidth size="small" multiline minRows={2} placeholder="Question text"
          value={q.question_text}
          onChange={(e) => { const v = e.target.value; onChange(() => ({ question_text: v })); }}
          sx={{ mb: 1.5 }}
        />

        <Stack spacing={1}>
          {q.options.map((opt, oi) => (
            <Stack key={oi} direction="row" spacing={1} alignItems="center">
              <Tooltip title="Mark as the correct answer">
                <Radio
                  size="small" color="success" checked={q.correct_index === oi}
                  onChange={() => onChange(() => ({ correct_index: oi }))}
                  inputProps={{ "aria-label": `Option ${String.fromCharCode(65 + oi)} is correct` }}
                />
              </Tooltip>
              <TextField
                fullWidth size="small" placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                value={opt}
                onChange={(e) => { const v = e.target.value; onChange((cur) => ({ options: cur.options.map((o, j) => (j === oi ? v : o)) })); }}
              />
              {q.options.length > 2 && (
                <IconButton
                  size="small" aria-label={`Remove option ${String.fromCharCode(65 + oi)}`}
                  onClick={() => onChange((cur) => ({
                    options: cur.options.filter((_, j) => j !== oi),
                    correct_index: cur.correct_index > oi
                      ? cur.correct_index - 1
                      : Math.min(cur.correct_index, cur.options.length - 2),
                  }))}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          {q.options.length < 6 && (
            <Button size="small" onClick={() => onChange((cur) => ({ options: [...cur.options, ""] }))}>+ option</Button>
          )}
          <TextField
            size="small" placeholder="Topic (optional)" sx={{ width: 180 }} value={q.topic}
            onChange={(e) => { const v = e.target.value; onChange(() => ({ topic: v })); }}
          />
          <TextField
            size="small" label="Marks" type="number" sx={{ width: 90 }} value={q.marks}
            onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); onChange(() => ({ marks: v })); }}
          />
        </Stack>

        <TextField
          fullWidth size="small" sx={{ mt: 1.5 }} placeholder="Explanation shown after submitting (optional)"
          value={q.explanation}
          onChange={(e) => { const v = e.target.value; onChange(() => ({ explanation: v })); }}
        />
      </Card>
    </Reorder.Item>
  );
}

export function McqQuestionEditor({
  questions, onChange, defaultMarks = 1,
}: {
  questions: McqQuestion[];
  onChange: (next: McqQuestion[]) => void;
  /** Marks a freshly-added question starts with — the section's marksPerQuestion. */
  defaultMarks?: number;
}) {
  const editQuestion = (key: string, make: (cur: McqQuestion) => Partial<McqQuestion>) => {
    onChange(questions.map((q) => (q.key === key ? { ...q, ...make(q) } : q)));
  };

  const reorder = (keys: string[]) => {
    const byKey = new Map(questions.map((q) => [q.key, q]));
    onChange(keys.map((k) => byKey.get(k)).filter(Boolean) as McqQuestion[]);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" color="text.secondary">
          {questions.filter(isMcqQuestionComplete).length} of {questions.length} complete
        </Typography>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => onChange([...questions, blankMcqQuestion(defaultMarks)])}>
          Add question
        </Button>
      </Stack>

      {questions.length === 0 ? (
        <Alert severity="info">No questions yet. Add the first one.</Alert>
      ) : (
        <Reorder.Group axis="y" values={questions.map((q) => q.key)} onReorder={reorder} style={{ padding: 0, margin: 0 }}>
          {questions.map((q, i) => (
            <QuestionCard
              key={q.key}
              q={q}
              index={i}
              total={questions.length}
              onChange={(make) => editQuestion(q.key, make)}
              onDelete={() => onChange(questions.filter((x) => x.key !== q.key))}
              onMove={(delta) => {
                const from = questions.findIndex((x) => x.key === q.key);
                const to = from + delta;
                if (from < 0 || to < 0 || to >= questions.length) return;
                const next = [...questions];
                [next[from], next[to]] = [next[to], next[from]];
                onChange(next);
              }}
            />
          ))}
        </Reorder.Group>
      )}
    </Stack>
  );
}
