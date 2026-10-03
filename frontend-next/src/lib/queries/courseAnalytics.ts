"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/api";

export interface CourseAnalytics {
  totalStudents: number;
  course: { id: string; title: string; moduleCount: number };
  days: number;
  kpis: {
    activeUsers: { value: number; total: number; series: number[] };
    submissions: { value: number; series: number[] };
    completedUsers: { value: number; total: number };
    notStartedUsers: { value: number; total: number };
    suspicious: { value: number; total: number };
  };
  units: { id: string; title: string; problemCount: number; solved: number; partial: number; notStarted: number }[];
  daily: { date: string; subs: number; solved: number; activeUsers: number }[];
  mostActiveUsers: { id: string; name: string; rollNo: string | null; activeDays: number; subs: number }[];
  mostActiveGroups: { id: string; name: string; students: number; activeStudents: number; subs: number }[];
  flagged: { id: string; name: string; rollNo: string | null; reasons: string[] }[];
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
