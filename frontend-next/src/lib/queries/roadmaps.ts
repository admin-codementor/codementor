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

export interface RoadmapSummary {
  id: string;
  role: string;
  tagline: string | null;
  summary: string | null;
  forWho: string | null;
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

export interface RoadmapDetail extends RoadmapSummary {
  milestones: Milestone[];
}

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

/** Where a milestone sends the student: its module, or a filtered practice list. */
export function milestoneHref(m: Milestone): string | null {
  if (!m.tracked) return null;
  if (m.link?.kind === "module") return `/app/courses/${m.link.courseId}?module=${m.link.moduleId}`;
  if (m.link?.kind === "practice") return `/app/problems?tag=${encodeURIComponent(m.link.tag)}`;
  return null;
}

/** Tests hub tab for an MCQ step: technical questions have their own tab. */
export function mcqHref(mcq: string[] | null): string {
  if (mcq?.includes("technical")) return "/app/tests?tab=technical";
  return "/app/tests?tab=aptitude";
}
