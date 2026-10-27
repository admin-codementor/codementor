"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type ReadinessBand = "ready" | "almost" | "building" | "not_started";

export interface ReadinessCheck { ok: boolean; value: number | null; need: number }
export interface Readiness {
  band: ReadinessBand; passed: number; missing: ("resume" | "interview" | "practice")[];
  checks: { resume: ReadinessCheck; interview: ReadinessCheck; practice: ReadinessCheck };
}

export interface ResumePart { key: string; got: number; max: number }
export interface ResumeResult {
  score: number; band: "strong" | "good" | "needs_work" | "weak"; role: string; roleLabel?: string;
  breakdown: ResumePart[]; suggestions: string[]; facts: { words: number; bullets: number; keywordsFound: number };
  note?: string;
}

export interface Scorecard {
  track: string; trackLabel: string; level: string; overall: number;
  answers: { question: string; answer: string; score: number; feedback: string }[];
  strengths: string[]; improve: string[];
}

export interface CareerMine {
  prep: { resume: ResumeResult | null; interviews: Scorecard[] };
  readiness: Readiness;
  rule: { resume: number; interview: number; practice: number };
  labels: Record<ReadinessBand, string>;
  aiConfigured: boolean;
  roles: { key: string; label: string }[];
  tracks: { key: string; label: string }[];
  levels: string[];
  interview: { questions: number; maxAnswer: number };
}

export const careerKey = ["career", "me"] as const;

/** GET /api/career/me: the student's resume check, interviews and readiness. */
export function useCareerQuery() {
  return useQuery<CareerMine>({
    queryKey: careerKey,
    queryFn: async () => (await api.get<{ success: boolean; data: CareerMine }>("/api/career/me")).data.data,
    staleTime: 30_000,
  });
}

export interface ReadinessRow {
  id: string; name: string; rollNo: string | null; year: number | null; section: string | null; classLabel: string;
  band: ReadinessBand; passed: number; checks: Readiness["checks"]; missing: Readiness["missing"]; interviews: number;
}
export interface StaffReadiness {
  rows: ReadinessRow[]; counts: Record<ReadinessBand, number>; total: number;
  bands: { key: ReadinessBand; label: string }[]; rule: { resume: number; interview: number; practice: number };
}

/** GET /api/placement/readiness: every student in the viewer's scope, banded. */
export function useStaffReadinessQuery(year: string, section: string) {
  return useQuery<StaffReadiness>({
    queryKey: ["placement", "readiness", year, section],
    queryFn: async () => (await api.get<{ success: boolean; data: StaffReadiness }>("/api/placement/readiness", { params: { ...(year ? { year } : {}), ...(section ? { section } : {}) } })).data.data,
    staleTime: 60_000,
  });
}
