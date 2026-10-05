"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import { ReactFlow, ReactFlowProvider, Background, Controls, BackgroundVariant } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { radius } from "@/theme/tokens";
import type { RoadmapGraphDetail } from "@/lib/queries/roadmaps";
import { layoutRoadmap } from "./dagreLayout";
import { roadmapNodeTypes } from "./GraphNodes";
import { NodeSidePanel } from "./NodeSidePanel";

/**
 * The desktop view of a graph roadmap: a pannable, zoomable canvas of boxes
 * and connectors, auto-laid-out by dagre from the authored groups/edges.
 *
 * Not used below ~768px — see the roadmap detail page, which renders
 * `GraphNodeList` instead on a phone. A pan/zoom canvas does not work at
 * phone width; the data is identical either way.
 */
export function RoadmapGraph({ roadmap, roadmapId }: { roadmap: RoadmapGraphDetail; roadmapId: string }) {
  const { flowNodes, flowEdges } = React.useMemo(
    () => layoutRoadmap(roadmap.nodes, roadmap.edges),
    [roadmap.nodes, roadmap.edges],
  );

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = roadmap.nodes.find((n) => n.id === selectedId) ?? null;
  const currentId = roadmap.currentMilestone?.id ?? null;

  const nodesWithSelection = React.useMemo(
    () => flowNodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [flowNodes, selectedId],
  );

  return (
    <>
      <Box
        sx={{
          height: { xs: 480, md: 620 },
          borderRadius: radius.md,
          border: "1px solid",
          borderColor: "outlineVariant",
          overflow: "hidden",
          // React Flow ships its own CSS variables for canvas chrome (the dotted
          // background, the controls box) that don't follow our theme on their
          // own — pointed at our tokens so dark mode doesn't leave a pale canvas
          // behind dark nodes.
          "--xy-background-color": "var(--mui-palette-surfaceContainerLowest)",
          "--xy-controls-button-background-color": "var(--mui-palette-surfaceContainer)",
          "--xy-controls-button-color": "var(--mui-palette-onSurface)",
          "--xy-controls-button-border-color": "var(--mui-palette-outlineVariant)",
        }}
      >
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodesWithSelection}
            edges={flowEdges}
            nodeTypes={roadmapNodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.4}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </Box>

      <NodeSidePanel
        node={selected}
        current={selected?.id === currentId}
        roadmapRole={roadmap.role}
        roadmapId={roadmapId}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
