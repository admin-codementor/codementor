"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { DashboardData, Assignment, RecommendedProblem, CourseSummary } from "@/lib/types";

export const queryKeys = {
  dashboard: ["student", "dashboard"] as const,
  courses: ["courses"] as const,
};

export interface DashboardPageData {
  dashboard: DashboardData;
  assignments: Assignment[];
  recommendations: RecommendedProblem[];
  courses: CourseSummary[];
}

/** Mirrors the previous hand-rolled fetch exactly: the dashboard call is
 * load-bearing (its rejection is a real error), the other three degrade to
 * an empty array on failure rather than blocking the page. */
export function useDashboardQuery() {
  return useQuery<DashboardPageData>({
    queryKey: queryKeys.dashboard,
    queryFn: async () => {
      const [dashRes, assignRes, recRes, coursesRes] = await Promise.allSettled([
        api.get<{ success: boolean; data: DashboardData }>("/api/student/dashboard"),
        api.get<{ success: boolean; data: Assignment[] }>("/api/student/assignments"),
        api.get<{ success: boolean; data: RecommendedProblem[] }>("/api/student/recommendations"),
        api.get<{ success: boolean; data: CourseSummary[] }>("/api/courses"),
      ]);
      if (dashRes.status === "rejected") throw dashRes.reason;
      return {
        dashboard: dashRes.value.data.data,
        assignments: assignRes.status === "fulfilled" ? assignRes.value.data.data ?? [] : [],
        recommendations: recRes.status === "fulfilled" ? recRes.value.data.data ?? [] : [],
        courses: coursesRes.status === "fulfilled" ? coursesRes.value.data.data ?? [] : [],
      };
    },
  });
}

export function useCoursesQuery() {
  return useQuery<CourseSummary[]>({
    queryKey: queryKeys.courses,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CourseSummary[] }>("/api/courses");
      if (!res.data?.success) throw new Error("Failed to load courses");
      return res.data.data ?? [];
    },
  });
}

export interface DailyChallenge {
  id: string | number;
  title: string;
  difficulty: string;
  tags: string[];
  solved: boolean;
}

/**
 * Today's problem, chosen by the backend.
 *
 * The page used to fetch the first 50 problems plus the solved list and pick in
 * the browser, which meant the "daily" problem could only ever come from that
 * first page. The server picks deterministically across the whole catalogue in
 * one request.
 */
export function useDailyChallengeQuery() {
  return useQuery<DailyChallenge | null>({
    queryKey: ["student", "daily-challenge"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DailyChallenge | null }>("/api/student/daily-challenge");
      return res.data?.data ?? null;
    },
  });
}

export interface SkillTopic {
  topic: string;
  solvedCount: number;
  failedCount: number;
  attempts: number;
  acRate: number;
  reason: string;
}

export interface SkillsData {
  strengths: SkillTopic[];
  weaknesses: SkillTopic[];
}

/** Strongest / focus-on topics — same scoring faculty see (needs 3+ attempts per topic). */
export function useSkillsQuery() {
  return useQuery<SkillsData>({
    queryKey: ["student", "skills"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: SkillsData }>("/api/student/skills");
      return res.data?.data ?? { strengths: [], weaknesses: [] };
    },
  });
}

export interface ExamCardData {
  id: string;
  title: string;
  description: string | null;
  window_start: string;
  window_end: string;
  duration_minutes: number;
  section_count: number;
  started: boolean;
  attempted: boolean;
  score: number | null;
  total: number | null;
}

export type ExamStatus = "upcoming" | "live" | "completed" | "missed";

/** Where an exam sits for this student right now. */
export function examStatus(e: ExamCardData, now = Date.now()): ExamStatus {
  if (e.attempted) return "completed";
  const start = new Date(e.window_start).getTime();
  const end = new Date(e.window_end).getTime();
  if (now < start) return "upcoming";
  if (now > end) return "missed";
  return "live";
}

/** Average % across completed exams (score/total), or null when none are scored. */
export function averageExamPct(exams: ExamCardData[]): number | null {
  const scored = exams.filter((e) => e.attempted && e.total);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, e) => sum + ((e.score ?? 0) / (e.total as number)) * 100, 0) / scored.length);
}

export function useAvailableExamsQuery() {
  return useQuery<ExamCardData[]>({
    queryKey: ["student", "exams", "available"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ExamCardData[] }>("/api/exams/available");
      return res.data?.success ? res.data.data ?? [] : [];
    },
  });
}
