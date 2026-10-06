"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";
import type { RoadmapGraphDetail } from "@/lib/queries/roadmaps";
import { layoutRoadmapSpine } from "./spineLayout";
import { SpineNodeBox } from "./SpineNodeBox";
import { NodeSidePanel } from "./NodeSidePanel";

/**
 * The desktop view of a graph roadmap: a vertical spine of stage boxes with
 * curved bezier branches and notes, roadmap.sh's balsamiq look — plain SVG
 * connectors under absolutely-positioned MUI boxes, not a pan/zoom canvas
 * library. Scrolls vertically like a long page; nothing to pan or zoom.
 *
 * Not used below ~768px — see the roadmap detail page, which renders
 * `GraphNodeList` instead on a phone.
 */
export function RoadmapGraph({ roadmap }: { roadmap: RoadmapGraphDetail }) {
  const layout = React.useMemo(
    () => layoutRoadmapSpine(roadmap.nodes, roadmap.edges, roadmap.groups),
    [roadmap.nodes, roadmap.edges, roadmap.groups],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = roadmap.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <>
      <Box
        onClick={() => setSelectedId(null)}
        sx={{
          position: "relative",
          height: { xs: 480, md: 640 },
          overflow: "auto",
          borderRadius: radius.md,
          border: "1px solid",
          borderColor: "outlineVariant",
          backgroundColor: "surfaceContainerLowest",
          backgroundImage: "radial-gradient(var(--mui-palette-outlineVariant) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <Box sx={{ position: "relative", width: layout.width, height: layout.height, mx: "auto" }}>
          <Box component="svg" aria-hidden width={layout.width} height={layout.height} sx={{ position: "absolute", inset: 0 }}>
            {layout.connectors.map((c) => (
              <path
                key={c.id}
                d={c.d}
                fill="none"
                stroke="var(--mui-palette-outline)"
                strokeWidth={c.dashed ? 1.5 : 2}
                strokeDasharray={c.dashed ? "4 4" : undefined}
              />
            ))}
          </Box>

          {layout.groupHeaders.map(
            (gh) =>
              gh.label && (
                <Box key={gh.id} sx={{ position: "absolute", left: 0, right: 0, top: gh.y, textAlign: "center" }}>
                  <Typography variant="overline" color="text.secondary" fontWeight={700} sx={{ letterSpacing: "0.08em" }}>
                    {gh.label}
                  </Typography>
                </Box>
              ),
          )}

          {layout.steps.map(({ node, x, y, w, h, branch }) => (
            <SpineNodeBox
              key={node.id}
              node={node}
              x={x}
              y={y}
              w={w}
              h={h}
              branch={branch}
              selected={node.id === selectedId}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(node.id);
              }}
            />
          ))}

          {layout.subtopics.map((sub) => (
            <Box
              key={sub.id}
              sx={{
                position: "absolute",
                left: sub.x,
                top: sub.y,
                width: sub.w,
                minHeight: sub.h,
                px: 1.25,
                py: 0.75,
                borderRadius: radius.sm,
                border: "1px solid",
                borderColor: "outlineVariant",
                backgroundColor: "surfaceContainer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Typography variant="caption" fontWeight={600} noWrap>
                {sub.text}
              </Typography>
            </Box>
          ))}

          {layout.notes.map((note) => (
            <Box
              key={note.id}
              sx={{
                position: "absolute",
                left: note.x,
                top: note.y,
                width: note.w,
                px: 1.5,
                py: 1,
                borderRadius: radius.sm,
                border: "1px dashed",
                borderColor: "outlineVariant",
                backgroundColor: "surfaceContainerLow",
                display: "flex",
                gap: 0.75,
                alignItems: "flex-start",
              }}
            >
              <TipsAndUpdatesOutlinedIcon fontSize="small" sx={{ color: "warning.main", flexShrink: 0, mt: 0.25 }} />
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                {note.text}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <NodeSidePanel node={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
