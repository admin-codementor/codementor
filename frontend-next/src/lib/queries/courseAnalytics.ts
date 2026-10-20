"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/api";

export type CourseStatus = "completed" | "in_progress" | "not_started";

export interface CourseStudentRow {
  id: string; name: string; rollNo: string | null; section: string | null; year: number | null; classLabel: string;
  solved: number; total: number; percent: number; status: CourseStatus; unitsDone: number; unitsTotal: number;
  lastActiveMs: number | null; activeInWindow: boolean;
}

/** Class-level figures; the three counts always add up to `students`. */
export interface CourseSummary {
  students: number; totalProblems: number; completed: number; inProgress: number; notStarted: number;
  avgPercent: number; medianPercent: number;
}

export interface CourseAnalytics {
  totalStudents: number;
  course: { id: string; title: string; moduleCount: number; skippedProblems: { deleted: number; draft: number } };
  days: number;
  kpis: {
    activeUsers: { value: number; total: number; series: number[] };
    submissions: { value: number; series: number[] };
    completedUsers: { value: number; total: number };
    inProgressUsers: { value: number; total: number };
    notStartedUsers: { value: number; total: number };
    suspicious: { value: number; total: number };
  };
  summary: CourseSummary;
  students: CourseStudentRow[];
  byClass: ({ label: string } & CourseSummary)[];
  units: { id: string; title: string; problemCount: number; empty: boolean; solved: number; partial: number; notStarted: number; avgPercent: number }[];
  daily: { date: string; subs: number; solved: number; activeUsers: number }[];
  mostActiveUsers: { id: string; name: string; rollNo: string | null; activeDays: number; subs: number }[];
  mostActiveGroups: { id: string; name: string; students: number; activeStudents: number; subs: number }[];
  flagged: { id: string; name: string; rollNo: string | null; reasons: string[] }[];
  completion: { totalProblems: number; completed: number; avgPercent: number; buckets: { bucket: string; from: number; count: number }[] };
  availableGroups: { id: string; name: string; students: number }[];
  selectedGroupIds: string[];
}

export function useCourseAnalyticsQuery(courseId: string, days: number, groupIds: string[]) {
  const ids = [...groupIds].sort();
  return useQuery<CourseAnalytics>({
    queryKey: ["faculty", "course-analytics", courseId, days, ids],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CourseAnalytics }>(
        `/api/faculty/courses/${courseId}/analytics`,
        { params: { days, ...(ids.length ? { classroomIds: ids.join(",") } : {}) } },
      );
      return res.data.data;
    },
    // Keep the old numbers on screen while a filter change loads.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export type CourseCompletion = CourseSummary;

/** One line per course for the course list: how far along the viewer's students are. */
export function useCourseCompletionQuery() {
  return useQuery<Record<string, CourseCompletion>>({
    queryKey: ["faculty", "course-completion"],
    queryFn: async () => (await api.get<{ success: boolean; data: Record<string, CourseCompletion> }>("/api/faculty/courses/completion")).data.data,
    staleTime: 60_000,
  });
}
