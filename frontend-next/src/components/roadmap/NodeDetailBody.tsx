"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import MuiLink from "@mui/material/Link";
import { ArrowForwardIcon, LinkOutlinedIcon } from "@/components/ui/icons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { radius, layout } from "@/theme/tokens";
import { nodeHref, mcqHref, type RoadmapNode } from "@/lib/queries/roadmaps";

/**
 * The body shown for one node — why it matters, progress, what to solve next,
 * reference links, and where to go. Shared by the side panel (desktop graph)
 * and the inline-expanded row (mobile list), so the two surfaces never drift
 * into saying different things about the same node.
 */
export function NodeDetailBody({
  node,
  current,
  roadmapRole,
  roadmapId,
}: {
  node: RoadmapNode;
  current: boolean;
  roadmapRole: string;
  roadmapId: string;
}) {
  const done = node.tracked && node.status === "done";
  const href = nodeHref(node, roadmapRole, roadmapId);

  if (node.type === "note") {
    // A note is commentary, not a step — no progress bar, no "where to go".
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

      {node.tracked && node.target > 0 && (
        <Box sx={{ mt: 1.5, maxWidth: 360 }}>
          <LinearProgress
            variant="determinate"
            value={node.percent}
            color={done ? "success" : "primary"}
            sx={{ height: 6, borderRadius: radius.full }}
          />
        </Box>
      )}

      {node.tracked && node.nextProblems.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 2 }}>
          <Typography variant="overline" color="text.secondary">
            Next up
          </Typography>
          {node.nextProblems.map((p) => (
            <Card key={p.id} variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.sm }}>
              <ButtonBase
                component={NextLink}
                href={`/app/problems/${p.id}`}
                sx={{ width: "100%", px: 1.5, py: 1, justifyContent: "space-between", borderRadius: "inherit" }}
              >
                <Typography variant="body2" noWrap sx={{ mr: 1 }}>
                  {p.title}
                </Typography>
                {p.difficulty && <DifficultyChip difficulty={p.difficulty} />}
              </ButtonBase>
            </Card>
          ))}
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

      <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
        {href && (
          <Button component={NextLink} href={href} variant={current ? "contained" : "outlined"} size="small" endIcon={<ArrowForwardIcon />}>
            {node.tracked && node.link?.kind === "module" ? `Open ${node.link.moduleTitle}` : "Practise this"}
          </Button>
        )}
        {!node.tracked && node.status === "test" && (
          <Button component={NextLink} href={mcqHref(node.mcq)} variant={current ? "contained" : "outlined"} size="small" endIcon={<ArrowForwardIcon />}>
            Go to Tests
          </Button>
        )}
      </Stack>

      {!node.tracked && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          {node.status === "test"
            ? "Test rounds are not counted in the percentage above — we score attempts, not readiness."
            : node.status === "checkpoint"
              ? "A project or mock round we cannot verify by running code. It still counts as part of the path — just not towards the percentage."
              : "We cannot check whether you have read this, so it does not count towards your progress."}
        </Typography>
      )}

      {node.tracked && node.status === "unavailable" && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          Your college has not added problems for this topic yet. It will start counting as soon as it does.
        </Typography>
      )}
    </Box>
  );
}
