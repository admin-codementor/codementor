import type { RoadmapGroup, RoadmapNode } from "@/lib/queries/roadmaps";

/**
 * Lays a graph roadmap out as a vertical spine with curved branches — the
 * roadmap.sh look (a straight path down the middle, side notes/detours
 * branching off with bezier connectors) rather than a generic auto-layout
 * box diagram. Hand-rolled instead of dagre: our nodes are already
 * individually meaningful (each one tracks real solved-problem progress), so
 * there is no separate "stage vs descriptive sub-topic" split to compute —
 * just which nodes form the critical path and which hang off it.
 */

export type StepNode = Exclude<RoadmapNode, { type: "note" }>;

export interface PositionedStep {
  node: StepNode;
  x: number;
  y: number;
  w: number;
  h: number;
  branch: boolean;
}

export interface PositionedNote {
  id: string;
  text: string | null;
  attachTo: string;
  x: number;
  y: number;
  w: number;
}

export interface GroupHeader {
  id: string;
  label: string;
  y: number;
}

export interface Connector {
  id: string;
  d: string;
  dashed?: boolean;
}

export interface SpineLayout {
  steps: PositionedStep[];
  notes: PositionedNote[];
  groupHeaders: GroupHeader[];
  connectors: Connector[];
  width: number;
  height: number;
}

export const SPINE_WIDTH = 240;
export const SPINE_HEIGHT = 68;
export const BRANCH_WIDTH = 176;
export const BRANCH_HEIGHT = 44;
const NOTE_WIDTH = 200;
const SIDE_GAP = 48;
const TOP_PAD = 32;
const SIDE_PAD = 40;
const GROUP_HEADER_HEIGHT = 48;

/** Cubic bezier that arcs outward like roadmap.sh's balsamiq connectors. */
function curvePath(x1: number, y1: number, x2: number, y2: number, side: "left" | "right" | "down") {
  if (side === "down") {
    const bulge = Math.min(40, Math.abs(y2 - y1) * 0.4);
    return `M ${x1} ${y1} C ${x1} ${y1 + bulge}, ${x2} ${y2 - bulge}, ${x2} ${y2}`;
  }
  const outward = side === "left" ? -72 : 72;
  const cx1 = x1 + outward * 0.55;
  const cx2 = x2 + outward * 0.2;
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

/**
 * Picks the critical path through the graph (longest-remaining-chain at each
 * fork) and flattens every other node onto the nearest spine ancestor as a
 * branch. A roadmap authored as one straight chain (every role shipped so
 * far) never hits the fork logic at all — this only matters once a future
 * roadmap actually branches.
 */
function buildSpine(steps: StepNode[], edges: { from: string; to: string }[]) {
  const byId = new Map(steps.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  const hasIncoming = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    childrenOf.set(e.from, [...(childrenOf.get(e.from) ?? []), e.to]);
    hasIncoming.add(e.to);
  }

  const visited = new Set<string>();
  const spineOrder: string[] = [];
  const branchParent = new Map<string, string>();

  function descendantCount(id: string, seen: Set<string>): number {
    if (seen.has(id)) return 0;
    seen.add(id);
    const kids = childrenOf.get(id) ?? [];
    return kids.reduce((sum, k) => sum + 1 + descendantCount(k, seen), 0);
  }

  function markBranchSubtree(id: string, parent: string) {
    if (visited.has(id)) return;
    visited.add(id);
    branchParent.set(id, parent);
    for (const k of childrenOf.get(id) ?? []) markBranchSubtree(k, parent);
  }

  function walkSpineFrom(startId: string) {
    let cur: string | undefined = startId;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      spineOrder.push(cur);
      const kids: string[] = (childrenOf.get(cur) ?? []).filter((k) => !visited.has(k));
      if (kids.length === 0) break;
      let best: string = kids[0]!;
      let bestScore = -1;
      for (const k of kids) {
        const score = descendantCount(k, new Set());
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
      for (const k of kids) {
        if (k !== best) markBranchSubtree(k, cur);
      }
      cur = best;
    }
  }

  const roots = steps.filter((n) => !hasIncoming.has(n.id));
  for (const r of roots) walkSpineFrom(r.id);
  // Defensive: a disconnected node (authoring slip, no edge in or out) still
  // gets a spot rather than silently vanishing from the roadmap.
  for (const n of steps) if (!visited.has(n.id)) walkSpineFrom(n.id);

  return { spineOrder, branchParent };
}

export function layoutRoadmapSpine(
  nodes: RoadmapNode[],
  edges: { from: string; to: string }[],
  groups: RoadmapGroup[],
): SpineLayout {
  const steps = nodes.filter((n): n is StepNode => n.type !== "note");
  const noteNodes = nodes.filter((n): n is Extract<RoadmapNode, { type: "note" }> => n.type === "note");
  const byId = new Map(steps.map((n) => [n.id, n]));
  const groupLabel = new Map(groups.map((g) => [g.id, g.label]));

  const { spineOrder, branchParent } = buildSpine(steps, edges);

  const rawPositions = new Map<string, { x: number; y: number; w: number; h: number; branch: boolean }>();
  const groupHeaders: GroupHeader[] = [];
  const connectors: Connector[] = [];

  let yCursor = TOP_PAD;
  let lastGroup: string | null | undefined = undefined;
  let prevSpineId: string | null = null;
  const centerX = 0; // shifted into frame once the final bounds are known

  for (const id of spineOrder) {
    const node = byId.get(id)!;
    if (node.group !== lastGroup) {
      groupHeaders.push({ id: `gh-${node.group ?? "none"}-${id}`, label: node.group ? (groupLabel.get(node.group) ?? node.group) : "", y: yCursor });
      if (node.group) yCursor += GROUP_HEADER_HEIGHT;
      lastGroup = node.group;
    }

    const branches = steps.filter((s) => branchParent.get(s.id) === id);
    const rows = Math.max(Math.ceil(branches.length / 2), 1);
    const blockHeight = Math.max(SPINE_HEIGHT + 72, rows * (BRANCH_HEIGHT + 12) + 56);

    const x = centerX - SPINE_WIDTH / 2;
    const y = yCursor;
    rawPositions.set(id, { x, y, w: SPINE_WIDTH, h: SPINE_HEIGHT, branch: false });

    if (prevSpineId) {
      const prev = rawPositions.get(prevSpineId)!;
      connectors.push({
        id: `spine-${prevSpineId}-${id}`,
        d: curvePath(centerX, prev.y + prev.h, centerX, y, "down"),
      });
    }

    branches.forEach((b, i) => {
      const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
      const row = Math.floor(i / 2);
      const rowOffset = (row - (rows - 1) / 2) * (BRANCH_HEIGHT + 12);
      const bx = side === "left" ? x - SIDE_GAP - BRANCH_WIDTH : x + SPINE_WIDTH + SIDE_GAP;
      const by = y + (SPINE_HEIGHT - BRANCH_HEIGHT) / 2 + rowOffset;
      rawPositions.set(b.id, { x: bx, y: by, w: BRANCH_WIDTH, h: BRANCH_HEIGHT, branch: true });

      const fromX = side === "left" ? x : x + SPINE_WIDTH;
      const fromY = y + SPINE_HEIGHT / 2;
      const toX = side === "left" ? bx + BRANCH_WIDTH : bx;
      const toY = by + BRANCH_HEIGHT / 2;
      connectors.push({ id: `branch-${b.id}`, d: curvePath(fromX, fromY, toX, toY, side), dashed: true });
    });

    yCursor += blockHeight;
    prevSpineId = id;
  }

  const rawNotes: { id: string; text: string | null; attachTo: string; x: number; y: number; w: number }[] = [];
  const noteSlot = new Map<string, number>();
  for (const note of noteNodes) {
    const target = rawPositions.get(note.attachTo);
    if (!target) continue;
    const slot = noteSlot.get(note.attachTo) ?? 0;
    noteSlot.set(note.attachTo, slot + 1);
    rawNotes.push({
      id: note.id,
      text: note.text,
      attachTo: note.attachTo,
      x: target.x + target.w + SIDE_GAP,
      y: target.y + slot * (BRANCH_HEIGHT * 1.6),
      w: NOTE_WIDTH,
    });
  }

  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of rawPositions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + p.w);
  }
  for (const n of rawNotes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.w);
  }
  if (!Number.isFinite(minX)) {
    minX = -SPINE_WIDTH / 2;
    maxX = SPINE_WIDTH / 2;
  }
  const shiftX = SIDE_PAD - minX;

  const positions = new Map(
    Array.from(rawPositions.entries()).map(([id, p]) => [id, { ...p, x: p.x + shiftX }]),
  );
  const notes: PositionedNote[] = rawNotes.map((n) => ({ ...n, x: n.x + shiftX }));
  const shiftedConnectors = connectors.map((c) => ({ ...c, d: shiftPathX(c.d, shiftX) }));

  const steps_: PositionedStep[] = spineOrder
    .map((id) => byId.get(id)!)
    .concat(steps.filter((s) => branchParent.has(s.id)))
    .map((node) => {
      const pos = positions.get(node.id)!;
      return { node, ...pos };
    });

  return {
    steps: steps_,
    notes,
    groupHeaders,
    connectors: shiftedConnectors,
    width: maxX - minX + SIDE_PAD * 2,
    height: yCursor + TOP_PAD,
  };
}

/** Shifts every x-coordinate embedded in an `M .. C ..` path string by `dx`. */
function shiftPathX(d: string, dx: number): string {
  const nums = d.match(/-?\d+(\.\d+)?/g);
  if (!nums) return d;
  let i = 0;
  // Path is `M x y C x y, x y, x y` — every even token (0-indexed) is an x.
  return d.replace(/-?\d+(\.\d+)?/g, (match) => {
    const isX = i % 2 === 0;
    i += 1;
    return isX ? String(Number(match) + dx) : match;
  });
}
