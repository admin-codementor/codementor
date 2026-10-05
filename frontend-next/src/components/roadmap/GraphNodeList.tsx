"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ButtonBase from "@mui/material/ButtonBase";
import {
  CheckCircleIcon,
  RadioButtonUncheckedIcon,
  MenuBookOutlinedIcon,
  TimerOutlinedIcon,
  FlagOutlinedIcon,
  ExpandMoreIcon,
  TipsAndUpdatesOutlinedIcon,
} from "@/components/ui/icons";
import { radius, layout } from "@/theme/tokens";
import { NodeDetailBody } from "./NodeDetailBody";
import type { RoadmapGraphDetail, RoadmapNode } from "@/lib/queries/roadmaps";

/** A node that is a real step — never a note, which never reaches StatusDot
 * or NodeRow since both are only ever called from the filtered `steps` list. */
type StepNode = Exclude<RoadmapNode, { type: "note" }>;

/**
 * The same roadmap the graph draws, as a vertical list — a pan/zoom canvas
 * does not work at phone width. Same data, same `NodeDetailBody`, so a
 * student never sees two different stories depending on their screen size.
 *
 * Notes render inline, right after the node they comment on (`attachTo`),
 * rather than as a numbered step — they carry no number and no progress,
 * same rule the graph's dashed box follows.
 */

function StatusDot({ node, current }: { node: StepNode; current: boolean }) {
  const done = node.tracked && node.status === "done";
  const icon = done ? (
    <CheckCircleIcon fontSize="small" />
  ) : node.type === "checkpoint" ? (
    <FlagOutlinedIcon fontSize="small" />
  ) : !node.tracked ? (
    node.status === "test" ? <TimerOutlinedIcon fontSize="small" /> : <MenuBookOutlinedIcon fontSize="small" />
  ) : (
    <RadioButtonUncheckedIcon fontSize="small" />
  );

  return (
    <Box
      aria-hidden
      sx={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: radius.circle,
        display: "grid",
        placeItems: "center",
        zIndex: 1,
        color: done ? "success.contrastText" : current ? "onPrimaryContainer" : "text.secondary",
        backgroundColor: done ? "success.main" : current ? "primaryContainer" : "surfaceContainerHigh",
        border: current && !done ? "2px solid var(--mui-palette-primary-main)" : "2px solid transparent",
      }}
    >
      {icon}
    </Box>
  );
}

function NodeRow({
  node,
  index,
  last,
  current,
  expanded,
  onToggle,
  roadmapRole,
  roadmapId,
}: {
  node: StepNode;
  index: number;
  last: boolean;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  roadmapRole: string;
  roadmapId: string;
}) {
  const done = node.tracked && node.status === "done";

  return (
    <Box sx={{ display: "flex", gap: 2, position: "relative" }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <StatusDot node={node} current={current} />
        {!last && (
          <Box
            aria-hidden
            sx={{ flex: 1, width: 2, minHeight: 16, my: 0.5, backgroundColor: done ? "success.main" : "outlineVariant" }}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : layout.sectionGap }}>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          sx={{ width: "100%", textAlign: "left", justifyContent: "flex-start", borderRadius: radius.sm, px: 1, mx: -1, py: 0.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={current ? 700 : 600} sx={{ lineHeight: 1.3, color: done ? "text.secondary" : "text.primary" }}>
                <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
                  {index + 1}.
                </Box>
                {node.title}
              </Typography>
            </Box>

            {node.tracked ? (
              node.status === "unavailable" ? (
                <Chip size="small" variant="outlined" label="No problems yet" />
              ) : (
                <Typography variant="caption" fontWeight={600} color={done ? "success.main" : "text.secondary"} sx={{ whiteSpace: "nowrap" }}>
                  {node.solved} / {node.target}
                </Typography>
              )
            ) : (
              <Chip
                size="small"
                variant="outlined"
                label={node.status === "test" ? "Test" : node.status === "checkpoint" ? "Checkpoint" : "Reading"}
              />
            )}

            <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary", transition: "transform 150ms", transform: expanded ? "rotate(180deg)" : "none" }} />
          </Stack>
        </ButtonBase>

        {current && <Chip size="small" color="primary" label="You are here" sx={{ mt: 0.5, ml: 0.5 }} />}

        {expanded && (
          <Box sx={{ mt: 1.5 }}>
            <NodeDetailBody node={node} current={current} roadmapRole={roadmapRole} roadmapId={roadmapId} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function NoteCard({ note }: { note: Extract<RoadmapNode, { type: "note" }> }) {
  return (
    <Box sx={{ display: "flex", gap: 2 }}>
      <Box sx={{ width: 32, flexShrink: 0 }} aria-hidden />
      <Box
        sx={{
          flex: 1,
          mb: layout.sectionGap,
          p: 1.5,
          borderRadius: radius.sm,
          border: "1px dashed",
          borderColor: "outlineVariant",
          backgroundColor: "surfaceContainerLow",
          display: "flex",
          gap: 1,
        }}
      >
        <TipsAndUpdatesOutlinedIcon fontSize="small" sx={{ color: "warning.main", flexShrink: 0, mt: 0.25 }} />
        <Typography variant="body2" color="text.secondary">
          {note.text}
        </Typography>
      </Box>
    </Box>
  );
}

export function GraphNodeList({ roadmap, roadmapId }: { roadmap: RoadmapGraphDetail; roadmapId: string }) {
  const steps = roadmap.nodes.filter(
    (n): n is Exclude<RoadmapNode, { type: "note" }> => n.type !== "note",
  );
  const notesByTarget = new Map<string, Extract<RoadmapNode, { type: "note" }>[]>();
  for (const n of roadmap.nodes) {
    if (n.type !== "note") continue;
    const list = notesByTarget.get(n.attachTo) ?? [];
    list.push(n);
    notesByTarget.set(n.attachTo, list);
  }

  const currentId = roadmap.currentMilestone?.id ?? null;
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  if (currentId && openedFor !== currentId) {
    setOpenedFor(currentId);
    setExpanded(new Set([currentId]));
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Box>
      {steps.map((node, i) => (
        <React.Fragment key={node.id}>
          <NodeRow
            node={node}
            index={i}
            last={i === steps.length - 1 && !(notesByTarget.get(node.id)?.length)}
            current={node.id === currentId}
            expanded={expanded.has(node.id)}
            onToggle={() => toggle(node.id)}
            roadmapRole={roadmap.role}
            roadmapId={roadmapId}
          />
          {notesByTarget.get(node.id)?.map((note) => <NoteCard key={note.id} note={note} />)}
        </React.Fragment>
      ))}
    </Box>
  );
}
