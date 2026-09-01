"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

export type QuestionStatus = "not_visited" | "visited" | "answered" | "marked" | "answered_marked";

export interface NavigatorItem {
  id: string;
  status: QuestionStatus;
}
export interface NavigatorSection {
  id: string;
  title: string;
  type: "mcq" | "coding";
  items: NavigatorItem[];
}

const STATUS_STYLE: Record<QuestionStatus, { bg: string; fg: string; border: string; label: string }> = {
  not_visited: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant", border: "outlineVariant", label: "Not visited" },
  visited: { bg: "errorContainer", fg: "onErrorContainer", border: "error.main", label: "Not answered" },
  answered: { bg: "successContainer", fg: "onSuccessContainer", border: "success.main", label: "Answered" },
  marked: { bg: "tertiaryContainer", fg: "onTertiaryContainer", border: "tertiary.main", label: "Marked for review" },
  answered_marked: { bg: "successContainer", fg: "onSuccessContainer", border: "tertiary.main", label: "Answered & marked for review" },
};

function Legend() {
  const entries: QuestionStatus[] = ["answered", "visited", "not_visited", "marked"];
  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mb: 1.5 }}>
      {entries.map((s) => (
        <Stack key={s} direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: STATUS_STYLE[s].bg, border: "1.5px solid", borderColor: STATUS_STYLE[s].border }} />
          <Typography variant="caption" color="text.secondary">{STATUS_STYLE[s].label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The CodeTantra-style color-coded question grid — genuinely new UI, no
 * existing precedent in this codebase (the MCQ/aptitude taking screen is a
 * single scroll with no navigator at all). Clicking a cell jumps to that
 * question, across sections if needed.
 */
export function QuestionNavigator({
  sections, activeSectionId, activeItemId, onJump,
}: {
  sections: NavigatorSection[];
  activeSectionId: string;
  activeItemId: string | null;
  onJump: (sectionId: string, itemId: string) => void;
}) {
  return (
    <Box>
      <Legend />
      <Stack spacing={2}>
        {sections.map((s) => (
          <Box key={s.id}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              {s.title}
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))", gap: 0.75 }}>
              {s.items.map((item, i) => {
                const style = STATUS_STYLE[item.status];
                const isActive = s.id === activeSectionId && item.id === activeItemId;
                return (
                  <Tooltip key={item.id} title={style.label}>
                    <Box
                      component="button"
                      onClick={() => onJump(s.id, item.id)}
                      aria-label={`${s.title} question ${i + 1} — ${style.label}`}
                      sx={{
                        position: "relative",
                        width: 34, height: 34,
                        borderRadius: 1.5,
                        border: "2px solid",
                        borderColor: isActive ? "primary.main" : style.border,
                        bgcolor: style.bg,
                        color: style.fg,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        font: "inherit",
                        outlineOffset: 2,
                      }}
                    >
                      {i + 1}
                      {(item.status === "marked" || item.status === "answered_marked") && (
                        <Box
                          aria-hidden
                          sx={{
                            position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%",
                            bgcolor: "tertiary.main", border: "1.5px solid", borderColor: "background.paper",
                          }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
