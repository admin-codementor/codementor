"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import { CheckCircleIcon, FlagOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";
import type { StepNode } from "./spineLayout";

/**
 * One box on the spine canvas — a topic (brand colour, filled once done) or
 * a checkpoint (its own dark shape, "you built something" reads differently
 * from "you learned something"). Branch nodes use the same tone rules at a
 * smaller size, same as the reference's topic leaves.
 */

function tone(node: StepNode): { bg: string; border: string; fg: string } {
  if (!node.tracked) return { bg: "surfaceContainerHigh", border: "outlineVariant", fg: "text.primary" };
  if (node.status === "done") return { bg: "success.main", border: "success.main", fg: "success.contrastText" };
  if (node.status === "in_progress") return { bg: "primaryContainer", border: "primary.main", fg: "onPrimaryContainer" };
  return { bg: "surfaceContainerHighest", border: "outlineVariant", fg: "text.primary" };
}

function ProgressBadge({ node }: { node: StepNode }) {
  if (!node.tracked) {
    const label = node.status === "test" ? "Test" : node.status === "checkpoint" ? "Checkpoint" : "Reading";
    return (
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {label}
      </Typography>
    );
  }
  if (node.status === "done") return <CheckCircleIcon fontSize="small" />;
  return (
    <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
      {node.solved}/{node.target}
    </Typography>
  );
}

export function SpineNodeBox({
  node,
  x,
  y,
  w,
  h,
  branch,
  selected,
  onClick,
}: {
  node: StepNode;
  x: number;
  y: number;
  w: number;
  h: number;
  branch: boolean;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const t = tone(node);
  const isCheckpoint = node.type === "checkpoint";

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        minHeight: h,
        px: branch ? 1.25 : 2,
        py: branch ? 0.75 : 1.25,
        borderRadius: branch ? radius.sm : radius.md,
        border: "2px solid",
        borderColor: selected ? "primary.main" : isCheckpoint ? "transparent" : t.border,
        backgroundColor: isCheckpoint ? "inverseSurface" : t.bg,
        color: isCheckpoint ? "inverseOnSurface" : t.fg,
        display: "flex",
        flexDirection: branch ? "row" : "column",
        alignItems: branch ? "center" : "stretch",
        justifyContent: branch ? "flex-start" : "center",
        gap: branch ? 0.75 : 0.5,
        textAlign: "left",
        boxShadow: selected ? "0 0 0 3px color-mix(in srgb, var(--mui-palette-primary-main) 25%, transparent)" : "0 1px 2px rgba(0,0,0,0.08)",
        transition: "box-shadow 150ms, border-color 150ms",
      }}
    >
      {isCheckpoint && <FlagOutlinedIcon fontSize="small" />}
      <Typography variant={branch ? "caption" : "subtitle2"} fontWeight={700} sx={{ lineHeight: 1.25, flex: 1, minWidth: 0 }} noWrap={branch}>
        {node.title}
      </Typography>
      {!branch && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <ProgressBadge node={node} />
        </Box>
      )}
    </ButtonBase>
  );
}
