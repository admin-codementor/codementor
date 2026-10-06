"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import ButtonBase from "@mui/material/ButtonBase";
import {
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
 * rather than as a numbered step — they carry no number, same rule the
 * graph's dashed box follows. Pure content map: no progress state (D18).
 */

function StatusDot({ node }: { node: StepNode }) {
  const icon = node.type === "checkpoint" ? (
    <FlagOutlinedIcon fontSize="small" />
  ) : !node.tracked && node.status === "test" ? (
    <TimerOutlinedIcon fontSize="small" />
  ) : !node.tracked ? (
    <MenuBookOutlinedIcon fontSize="small" />
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
        color: "text.secondary",
        backgroundColor: "surfaceContainerHigh",
        border: "2px solid transparent",
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
  expanded,
  onToggle,
}: {
  node: StepNode;
  index: number;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 2, position: "relative" }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <StatusDot node={node} />
        {!last && (
          <Box aria-hidden sx={{ flex: 1, width: 2, minHeight: 16, my: 0.5, backgroundColor: "outlineVariant" }} />
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
              <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
                  {index + 1}.
                </Box>
                {node.title}
              </Typography>
            </Box>

            {!node.tracked && (
              <Chip
                size="small"
                variant="outlined"
                label={node.status === "test" ? "Test" : node.status === "checkpoint" ? "Checkpoint" : "Reading"}
              />
            )}

            <ExpandMoreIcon fontSize="small" sx={{ color: "text.secondary", transition: "transform 150ms", transform: expanded ? "rotate(180deg)" : "none" }} />
          </Stack>
        </ButtonBase>

        {expanded && (
          <Box sx={{ mt: 1.5 }}>
            <NodeDetailBody node={node} />
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

export function GraphNodeList({ roadmap }: { roadmap: RoadmapGraphDetail }) {
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

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
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
            expanded={expanded.has(node.id)}
            onToggle={() => toggle(node.id)}
          />
          {notesByTarget.get(node.id)?.map((note) => <NoteCard key={note.id} note={note} />)}
        </React.Fragment>
      ))}
    </Box>
  );
}
