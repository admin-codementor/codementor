import dagre from "dagre";
import type { Node as FlowNode, Edge as FlowEdge } from "@xyflow/react";
import type { RoadmapNode } from "@/lib/queries/roadmaps";

// React Flow's Node<T> generic requires T to satisfy Record<string, unknown>,
// which RoadmapNode (a plain discriminated union, no index signature) never
// structurally will — the constraint is a TS-level formality for the library's
// generic bound, not a real runtime shape requirement, so the two `as
// RoadmapFlowData` casts below are the sanctioned way past it, not a hidden
// unsafe cast: every read of `.data` elsewhere narrows by `.type` before
// touching a field that is not common to all three node kinds.
export type RoadmapFlowData = RoadmapNode & Record<string, unknown>;

/**
 * Turns a resolved roadmap (nodes + edges + groups) into positioned React
 * Flow nodes — the auto-layout half of the roadmap.sh look. Hand-computing
 * this (rank by longest path, avoid overlaps, route edges around other boxes)
 * is its own multi-week project; dagre is the standard choice for exactly
 * this, which is the whole reason it is a dependency here.
 *
 * Notes are laid out separately: they are not steps, so they never enter
 * dagre's graph — they are positioned just to the side of the node they
 * comment on (`attachTo`), after the real layout is computed.
 */

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
const NOTE_WIDTH = 200;
const RANK_SEP = 70;
const NODE_SEP = 32;

export interface LaidOutGraph {
  flowNodes: FlowNode<RoadmapFlowData>[];
  flowEdges: FlowEdge[];
}

// `groups` is authored and returned by the API (and shown in the side panel
// / list view's data) but not yet drawn as its own swim-lane header on the
// canvas — dagre ranks by edges alone for now. Labelled lanes are a real
// visual improvement worth doing, deliberately deferred rather than rushed
// into this pass; nothing about the node/edge schema needs to change to add
// it later.
export function layoutRoadmap(nodes: RoadmapNode[], edges: { from: string; to: string }[]): LaidOutGraph {
  const steps = nodes.filter((n) => n.type !== "note");
  const notes = nodes.filter((n): n is Extract<RoadmapNode, { type: "note" }> => n.type === "note");
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const step of steps) g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    // An edge naming a node that doesn't exist (a typo in authored content)
    // must not crash the whole roadmap — drop it, the graph just has one
    // fewer connector, which is recoverable; a thrown error isn't.
    if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
  }

  dagre.layout(g);

  const flowNodes: FlowNode<RoadmapFlowData>[] = steps.map((step) => {
    const pos = g.node(step.id);
    return {
      id: step.id,
      type: step.type,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: step as RoadmapFlowData,
      draggable: false,
      connectable: false,
    };
  });

  // Each note sits beside the node it comments on: to the right when there is
  // room, stacked if more than one note attaches to the same node.
  const noteCountByTarget = new Map<string, number>();
  for (const note of notes) {
    const target = flowNodes.find((n) => n.id === note.attachTo);
    if (!target) continue; // an attachTo typo loses the note, not the roadmap
    const slot = noteCountByTarget.get(note.attachTo) ?? 0;
    noteCountByTarget.set(note.attachTo, slot + 1);
    flowNodes.push({
      id: note.id,
      type: "note",
      position: {
        x: target.position.x + NODE_WIDTH + 32,
        y: target.position.y + slot * (NODE_HEIGHT * 0.65),
      },
      data: note as RoadmapFlowData,
      draggable: false,
      connectable: false,
      width: NOTE_WIDTH,
    });
  }

  const flowEdges: FlowEdge[] = edges
    .filter((e) => byId.has(e.from) && byId.has(e.to))
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      style: { stroke: "var(--mui-palette-outline)", strokeWidth: 2 },
    }));

  return { flowNodes, flowEdges };
}
