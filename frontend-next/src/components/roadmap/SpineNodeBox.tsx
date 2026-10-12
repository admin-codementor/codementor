"use client";

import * as React from "react";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import { FlagOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";
import type { StepNode } from "./spineLayout";

/**
 * One box on the spine canvas — a topic (neutral tone, same for every topic
 * regardless of status) or a checkpoint (its own dark shape, a project or
 * mock round rather than a lesson). This is a content map, not a progress
 * tracker: no solved count, no done/not-done styling — see S13's canvas
 * reskin decision (D18). Branch/subtopic leaves use the same shape, smaller.
 */

function typeLabel(node: StepNode): string | null {
  if (node.tracked) return null;
  if (node.status === "test") return "Test";
  if (node.status === "checkpoint") return null; // the flag icon + dark tone already say this
  return "Reading";
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
  const isCheckpoint = node.type === "checkpoint";
  const label = typeLabel(node);

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
        borderColor: selected ? "primary.main" : isCheckpoint ? "transparent" : "outlineVariant",
        backgroundColor: isCheckpoint ? "inverseSurface" : branch ? "surfaceContainerHigh" : "surfaceContainerHighest",
        color: isCheckpoint ? "inverseOnSurface" : "text.primary",
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
      {!branch && label && (
        <Typography variant="caption" sx={{ opacity: 0.8, alignSelf: "flex-end" }}>
          {label}
        </Typography>
      )}
    </ButtonBase>
  );
}
