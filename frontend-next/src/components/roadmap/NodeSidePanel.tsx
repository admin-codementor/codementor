"use client";

import * as React from "react";
import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import { CloseIcon, CheckCircleIcon, FlagOutlinedIcon, TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";
import { layout } from "@/theme/tokens";
import { NodeDetailBody } from "./NodeDetailBody";
import type { RoadmapNode } from "@/lib/queries/roadmaps";

/**
 * The panel a node click opens — matches the reference image's behaviour
 * exactly (click a box, a panel slides in with the detail) rather than
 * jumping the student straight to a module. Same content as the mobile list's
 * expanded row, via `NodeDetailBody`, so the two surfaces can't disagree.
 */
export function NodeSidePanel({
  node,
  current,
  roadmapRole,
  roadmapId,
  onClose,
}: {
  node: RoadmapNode | null;
  current: boolean;
  roadmapRole: string;
  roadmapId: string;
  onClose: () => void;
}) {
  const done = node?.tracked && node.status === "done";

  return (
    <Drawer anchor="right" open={!!node} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 } } } }}>
      {node && (
        <Box sx={{ p: layout.cardPadding }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              {node.type === "checkpoint" && <FlagOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />}
              {node.type === "note" && <TipsAndUpdatesOutlinedIcon fontSize="small" sx={{ color: "warning.main" }} />}
              {done && <CheckCircleIcon fontSize="small" sx={{ color: "success.main" }} />}
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                {node.type === "note" ? "Note" : node.title}
              </Typography>
            </Stack>
            <IconButton aria-label="Close" size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          {current && node.type !== "note" && (
            <Chip size="small" color="primary" label="You are here" sx={{ mt: 1 }} />
          )}

          <Box sx={{ mt: 2 }}>
            <NodeDetailBody node={node} current={current} roadmapRole={roadmapRole} roadmapId={roadmapId} />
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
