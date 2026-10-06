"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import { LinkOutlinedIcon } from "@/components/ui/icons";
import { layout } from "@/theme/tokens";
import type { RoadmapNode } from "@/lib/queries/roadmaps";

/**
 * The body shown for one node — why it matters, its sub-skills, and
 * reference links. Shared by the side panel (desktop graph) and the
 * inline-expanded row (mobile list), so the two surfaces never drift into
 * saying different things about the same node.
 *
 * Pure content: this is a map of the roadmap and its resources, not a
 * progress tracker — no solved count, no link into Problems/Practice (D18).
 */
export function NodeDetailBody({ node }: { node: RoadmapNode }) {
  if (node.type === "note") {
    // A note is commentary, not a step — no sub-skills, no reading list.
    return (
      <Typography variant="body2" color="text.secondary">
        {node.text}
      </Typography>
    );
  }

  return (
    <Box>
      {node.why && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: layout.proseMaxWidth }}>
          {node.why}
        </Typography>
      )}

      {node.subtopics.length > 0 && (
        <Stack spacing={0.75} sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Covers
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {node.subtopics.map((t) => (
              <Chip key={t} size="small" variant="outlined" label={t} />
            ))}
          </Stack>
        </Stack>
      )}

      {node.reading.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Reference
          </Typography>
          {node.reading.map((r) => (
            <Stack key={r.url} direction="row" spacing={0.75} alignItems="center">
              <LinkOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
              <MuiLink href={r.url} target="_blank" rel="noopener noreferrer" variant="body2">
                {r.label}
              </MuiLink>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
