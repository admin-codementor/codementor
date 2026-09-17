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
