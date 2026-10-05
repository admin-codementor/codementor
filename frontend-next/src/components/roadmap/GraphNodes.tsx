"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Handle, Position, type NodeProps, type Node as FlowNode } from "@xyflow/react";
import { CheckCircleIcon, FlagOutlinedIcon, TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";
import type { RoadmapNode } from "@/lib/queries/roadmaps";
import type { RoadmapFlowData } from "./dagreLayout";
import { NODE_HEIGHT, NODE_WIDTH } from "./dagreLayout";

/**
 * The three boxes the reference image draws: a topic (our brand colour,
 * filled once done), a checkpoint (its own dark shape — "you built something"
 * reads differently from "you learned something"), and a note (a quiet aside,
 * never mistaken for a step because it never carries a progress number).
 *
 * Deliberately not roadmap.sh's yellow — recoloured to our brand, the same
 * rule the unDraw illustrations follow (D2).
 */

function topicTone(data: RoadmapNode): { bg: string; border: string; fg: string } {
  if (data.type === "note") return { bg: "surfaceContainerLow", border: "outlineVariant", fg: "text.secondary" };
  if (!data.tracked) {
    return { bg: "surfaceContainerHigh", border: "outlineVariant", fg: "text.primary" };
  }
  if (data.status === "done") return { bg: "success.main", border: "success.main", fg: "success.contrastText" };
  if (data.status === "in_progress") return { bg: "primaryContainer", border: "primary.main", fg: "onPrimaryContainer" };
  return { bg: "surfaceContainerHighest", border: "outlineVariant", fg: "text.primary" };
}

function ProgressBadge({ data }: { data: RoadmapNode }) {
  if (data.type === "note") return null;
  if (!data.tracked) {
    const label = data.status === "test" ? "Test" : data.status === "checkpoint" ? "Checkpoint" : "Reading";
    return (
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {label}
      </Typography>
    );
  }
  if (data.status === "done") {
    return <CheckCircleIcon fontSize="small" />;
  }
  return (
    <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
      {data.solved}/{data.target}
    </Typography>
  );
}

function TopicNode({ data, selected }: NodeProps<FlowNode<RoadmapFlowData>>) {
  if (data.type !== "topic") return null;
  const tone = topicTone(data);
  return (
    <Box
      sx={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        px: 2,
        py: 1.25,
        borderRadius: radius.md,
        border: "2px solid",
        borderColor: selected ? "primary.main" : tone.border,
        backgroundColor: tone.bg,
        color: tone.fg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 0.5,
        cursor: "pointer",
        boxShadow: selected ? "0 0 0 3px color-mix(in srgb, var(--mui-palette-primary-main) 25%, transparent)" : "none",
        transition: "box-shadow 150ms, border-color 150ms",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.25 }}>
        {data.title}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <ProgressBadge data={data} />
      </Box>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </Box>
  );
}

function CheckpointNode({ data, selected }: NodeProps<FlowNode<RoadmapFlowData>>) {
  if (data.type !== "checkpoint") return null;
  return (
    <Box
      sx={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        px: 2,
        py: 1.25,
        borderRadius: radius.md,
        border: "2px solid",
        borderColor: selected ? "primary.main" : "transparent",
        backgroundColor: "inverseSurface",
        color: "inverseOnSurface",
        display: "flex",
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        boxShadow: selected ? "0 0 0 3px color-mix(in srgb, var(--mui-palette-primary-main) 25%, transparent)" : "none",
        transition: "box-shadow 150ms, border-color 150ms",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <FlagOutlinedIcon fontSize="small" />
      <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.25 }}>
        {data.title}
      </Typography>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </Box>
  );
}

function NoteNode({ data, selected }: NodeProps<FlowNode<RoadmapFlowData>>) {
  if (data.type !== "note") return null;
  return (
    <Box
      sx={{
        maxWidth: 200,
        px: 1.5,
        py: 1,
        borderRadius: radius.sm,
        border: "1px dashed",
        borderColor: selected ? "primary.main" : "outlineVariant",
        backgroundColor: "surfaceContainerLow",
        display: "flex",
        gap: 0.75,
        alignItems: "flex-start",
      }}
    >
      <TipsAndUpdatesOutlinedIcon fontSize="small" sx={{ color: "warning.main", flexShrink: 0, mt: 0.25 }} />
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
        {data.text}
      </Typography>
    </Box>
  );
}

export const roadmapNodeTypes = {
  topic: TopicNode,
  checkpoint: CheckpointNode,
  note: NoteNode,
};
