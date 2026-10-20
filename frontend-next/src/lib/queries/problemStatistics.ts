"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/api";

export type ProblemStudentStatus = "completed" | "in_progress" | "not_started";

export interface ProblemStudentRow {
  id: string; name: string; rollNo: string | null; section: string | null; year: number | null;
  status: ProblemStudentStatus;
  submissions: number; attemptsToSolve: number | null;
  compileErrors: number; runtimeErrors: number; timeouts: number; wrongAnswers: number; otherFailures: number;
  timeSeconds: number; solvedAtSeconds: number | null;
  flagEvents: number; suspicious: boolean;
}

export interface ProblemPerformer {
  id: string; name: string; rollNo: string | null; kind: "best" | "weakest"; status: ProblemStudentStatus;
  timeSeconds: number; solvedAtSeconds: number | null; submissions: number;
}

/** GET /api/faculty/problems/:id/statistics: the figures for one question, for the viewer's own students. */
export interface ProblemStatistics {
  problem: { id: string; title: string; difficulty: string };
  totals: { students: number; completed: number; inProgress: number; notStarted: number };
  avgTimeSeconds: number | null;
  avgSolveSeconds: number | null;
  avgAttemptsToSolve: number | null;
  best: ProblemPerformer | null;
  weakest: ProblemPerformer | null;
  failures: { compile: number; runtime: number; timeout: number; wrong: number; other: number };
  timeHistogram: { label: string; count: number }[];
  hasTimeData: boolean;
  flagged: { id: string; name: string; rollNo: string | null; flagEvents: number }[];
  students: ProblemStudentRow[];
  availableGroups: { id: string; name: string; students: number }[];
  selectedGroupIds: string[];
}

export function useProblemStatisticsQuery(problemId: string | null, groupIds: string[]) {
  const ids = [...groupIds].sort();
  return useQuery<ProblemStatistics>({
    queryKey: ["faculty", "problem-statistics", problemId, ids],
    enabled: !!problemId,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProblemStatistics }>(
        `/api/faculty/problems/${problemId}/statistics`,
        { params: ids.length ? { classroomIds: ids.join(",") } : {} },
      );
      return res.data.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
