"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type Tier = "normal" | "dream";
export type AppStatus = "applied" | "shortlisted" | "selected" | "rejected";

export interface Drive {
  id: string; company: string; role: string; ctc: string; description: string; date: string | null;
  departments: string[]; eligible_years: number[]; min_cgpa: number | null; max_backlogs: number | null;
  apply_by: string | null; link: string | null; rounds: string[];
  tier: Tier; status: "open" | "closed"; publish_state: "draft" | "published";
}
export interface DriveRow extends Drive { eligible: number; applied: number; shortlisted: number; selected: number; rejected: number }

export interface DriveStudent {
  id: string; name: string; roll_no: string | null; department: string | null; section: string | null; year: number | null;
  cgpa: number | null; backlogs: number | null; has_offer: boolean;
  status: AppStatus | null; round_results: Record<string, "passed" | "failed">; applied_by: "student" | "staff" | null; override_reason: string | null;
  eligible: boolean; reasons: string[];
}

export const STATUS_LABEL: Record<AppStatus, string> = { applied: "Applied", shortlisted: "Shortlisted", selected: "Selected", rejected: "Rejected" };

export const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** An ISO moment as the value of a datetime-local field (in the browser's own time zone), and back. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

/** Department and year names that exist, for the pickers. */
export function usePlacementMeta() {
  return useQuery<{ departments: string[]; years: number[] }>({
    queryKey: ["placement", "meta"],
    queryFn: async () => (await api.get("/api/placement/meta")).data.data,
    staleTime: 5 * 60_000,
  });
}
