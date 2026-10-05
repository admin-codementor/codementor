"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

/** A milestone we can measure: it resolves to problems in this college's catalog. */
export interface TrackedMilestone {
  id: string;
  title: string;
  why: string | null;
  reading: { label: string; url: string }[];
  mcq: string[] | null;
  tracked: true;
  status: "done" | "in_progress" | "not_started" | "unavailable";
  solved: number;
  target: number;
  available: number;
  percent: number;
  nextProblems: { id: string; title: string; difficulty: string | null }[];
  link:
    | { kind: "module"; courseId: string; courseTitle: string; moduleId: string; moduleTitle: string }
    | { kind: "practice"; tag: string }
    | null;
}

/** A reading or test step. Deliberately carries no percentage — see the API. */
export interface UntrackedMilestone {
  id: string;
  title: string;
  why: string | null;
  reading: { label: string; url: string }[];
  mcq: string[] | null;
  tracked: false;
  status: "reading" | "test";
}

export type Milestone = TrackedMilestone | UntrackedMilestone;

// ── Graph-shaped roadmaps (S13) ──────────────────────────────────────────────
// A roadmap authored as nodes/edges/groups rather than a flat list. The node
// shapes mirror Tracked/UntrackedMilestone above (same resolver, same rules —
// a node you cannot verify says so instead of reporting 0%) plus what a graph
// specifically needs: which group it sits in, and for a note, what it is
// commenting on rather than a step of its own.

export interface TrackedNode {
  id: string;
  type: "topic" | "checkpoint";
  group: string | null;
  title: string;
  why: string | null;
  reading: { label: string; url: string }[];
  mcq: string[] | null;
  tracked: true;
  status: "done" | "in_progress" | "not_started" | "unavailable";
  solved: number;
  target: number;
  available: number;
  percent: number;
  nextProblems: { id: string; title: string; difficulty: string | null }[];
  link: TrackedMilestone["link"];
}

export interface UntrackedNode {
  id: string;
  type: "topic" | "checkpoint";
  group: string | null;
  title: string;
  why: string | null;
  reading: { label: string; url: string }[];
  mcq: string[] | null;
  tracked: false;
  // "checkpoint" joins reading/test here: a project/mock-test marker we
  // cannot verify by running code, same "untracked, not 0%" rule, its own
  // shape so the graph draws it as a milestone marker rather than a lesson.
  status: "reading" | "test" | "checkpoint";
}

/** A side annotation, never a step: excluded from progress and from ever
 * being "you are here", however many a roadmap has. Points at the node it
 * comments on via `attachTo` rather than sitting in the main flow. */
export interface NoteNode {
  id: string;
  type: "note";
  group: null;
  attachTo: string;
  text: string | null;
  tracked: false;
  status: "note";
}

export type RoadmapNode = TrackedNode | UntrackedNode | NoteNode;

export interface RoadmapGroup {
  id: string;
  label: string;
}

export interface RoadmapEdge {
  from: string;
  to: string;
}

export interface RoadmapSummary {
  id: string;
  role: string;
  tagline: string | null;
  summary: string | null;
  forWho: string | null;
  /** Which shape the detail response carries — a flat list (today's 3 roles)
   * or a graph (S13's node/edge/group roles). Decides which renderer to use;
   * never guess this from milestoneCount or anything else. */
  format: "list" | "graph";
  milestoneCount: number;
  trackedCount: number;
  doneCount: number;
  solved: number;
  target: number;
  percent: number;
  currentMilestone: { id: string; title: string } | null;
  /** 1-based position of the current step among the tracked ones. */
  currentStep: number | null;
}

export interface RoadmapListDetail extends RoadmapSummary {
  format: "list";
  milestones: Milestone[];
}

export interface RoadmapGraphDetail extends RoadmapSummary {
  format: "graph";
  groups: RoadmapGroup[];
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
}

export type RoadmapDetail = RoadmapListDetail | RoadmapGraphDetail;

export const roadmapKeys = {
  all: ["roadmaps"] as const,
  one: (id: string) => ["roadmaps", id] as const,
};

export function useRoadmapsQuery() {
  return useQuery<{ roadmaps: RoadmapSummary[]; activeRoadmapId: string | null }>({
    queryKey: roadmapKeys.all,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RoadmapSummary[]; activeRoadmapId: string | null }>(
        "/api/roadmaps",
      );
      if (!res.data?.success) throw new Error("Failed to load roadmaps");
      return { roadmaps: res.data.data ?? [], activeRoadmapId: res.data.activeRoadmapId ?? null };
    },
  });
}

export function useRoadmapQuery(id: string) {
  return useQuery<{ roadmap: RoadmapDetail; isActive: boolean }>({
    queryKey: roadmapKeys.one(id),
    enabled: !!id,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RoadmapDetail; isActive: boolean }>(`/api/roadmaps/${id}`);
      if (!res.data?.success) throw new Error("Failed to load roadmap");
      return { roadmap: res.data.data, isActive: !!res.data.isActive };
    },
  });
}

/** Sets (or, with null, clears) the roadmap the dashboard follows. */
export function useSetActiveRoadmap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roadmapId: string | null) => {
      const res = await api.put("/api/student/active-roadmap", { roadmapId });
      if (!res.data?.success) throw new Error(res.data?.error || "Could not save that choice");
      return roadmapId;
    },
    onSuccess: (roadmapId) => {
      qc.invalidateQueries({ queryKey: roadmapKeys.all });
      if (roadmapId) qc.invalidateQueries({ queryKey: roadmapKeys.one(roadmapId) });
      // The dashboard tile reads the active roadmap too.
      qc.invalidateQueries({ queryKey: ["student", "dashboard"] });
    },
  });
}

/**
 * Where a milestone sends the student: its module, or a filtered practice
 * list. `roadmapRole` and `milestoneTitle`, when given, ride along as query
 * params so Practice can show why the student landed there (S12) — dropped
 * silently by the receiving page when absent, so this is safe to call without
 * them too.
 */
export function milestoneHref(m: Milestone, roadmapRole?: string, roadmapId?: string): string | null {
  if (!m.tracked) return null;
  if (m.link?.kind === "module") return `/app/courses/${m.link.courseId}?module=${m.link.moduleId}`;
  if (m.link?.kind === "practice") {
    const params = new URLSearchParams({ tag: m.link.tag });
    if (roadmapRole) {
      params.set("source", "roadmap");
      params.set("from", roadmapRole);
      if (roadmapId) params.set("rid", roadmapId);
    }
    return `/app/problems?${params.toString()}`;
  }
  return null;
}

/** Same as `milestoneHref`, for a graph node. A note never has somewhere to
 * go — it is commentary, not a step. */
export function nodeHref(n: RoadmapNode, roadmapRole?: string, roadmapId?: string): string | null {
  if (n.type === "note" || !n.tracked) return null;
  if (n.link?.kind === "module") return `/app/courses/${n.link.courseId}?module=${n.link.moduleId}`;
  if (n.link?.kind === "practice") {
    const params = new URLSearchParams({ tag: n.link.tag });
    if (roadmapRole) {
      params.set("source", "roadmap");
      params.set("from", roadmapRole);
      if (roadmapId) params.set("rid", roadmapId);
    }
    return `/app/problems?${params.toString()}`;
  }
  return null;
}

/** Tests hub tab for an MCQ step: technical questions have their own tab. */
export function mcqHref(mcq: string[] | null): string {
  if (mcq?.includes("technical")) return "/app/tests?tab=technical";
  return "/app/tests?tab=aptitude";
}
