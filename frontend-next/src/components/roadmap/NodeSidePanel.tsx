"use client";

import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import { CloseIcon, FlagOutlinedIcon, TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";
import { layout } from "@/theme/tokens";
import { NodeDetailBody } from "./NodeDetailBody";
import type { RoadmapNode } from "@/lib/queries/roadmaps";

/**
 * The panel a node click opens — matches the reference image's behaviour
 * exactly (click a box, a panel slides in with the detail) rather than
 * jumping the student straight to a module. Same content as the mobile list's
 * expanded row, via `NodeDetailBody`, so the two surfaces can't disagree.
 *
 * Pure content: why this topic matters, its sub-skills, and reference links —
 * no progress state and no link into Problems/Practice (D18).
 */
export function NodeSidePanel({
  node,
  onClose,
}: {
  node: RoadmapNode | null;
  onClose: () => void;
}) {
  return (
    <Drawer anchor="right" open={!!node} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 } } } }}>
      {node && (
        <Box sx={{ p: layout.cardPadding }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              {node.type === "checkpoint" && <FlagOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />}
              {node.type === "note" && <TipsAndUpdatesOutlinedIcon fontSize="small" sx={{ color: "warning.main" }} />}
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                {node.type === "note" ? "Note" : node.title}
              </Typography>
            </Stack>
            <IconButton aria-label="Close" size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <NodeDetailBody node={node} />
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
