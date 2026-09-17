"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Problem } from "@/lib/types";

export interface ProblemsQueryParams {
  page: number;
  difficulty?: string;
  search?: string;
}

export interface ProblemsQueryResult {
  problems: Problem[];
  total: number;
}

export function useProblemsQuery(params: ProblemsQueryParams) {
  return useQuery<ProblemsQueryResult>({
    queryKey: ["problems", params],
    queryFn: async () => {
      const query: Record<string, string | number> = { page: params.page, limit: 50 };
      if (params.search) query.search = params.search;
      if (params.difficulty && params.difficulty !== "All") query.difficulty = params.difficulty;

      const res = await api.get("/api/problems", { params: query });
      const resData = res.data.data || res.data;
      if (Array.isArray(resData)) return { problems: resData, total: resData.length };
      return { problems: resData.problems ?? [], total: resData.total ?? resData.problems?.length ?? 0 };
    },
    // Keep showing the previous page/filter's rows while the new ones load,
    // instead of snapping to a skeleton on every filter click.
    placeholderData: keepPreviousData,
  });
}

export function useSolvedProblemsQuery() {
  return useQuery<string[]>({
    queryKey: ["student", "solved-problems"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: string[] }>("/api/student/solved-problems");
      return res.data?.success ? res.data.data ?? [] : [];
    },
  });
}
