"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type StaffRole = "faculty" | "hod" | "tnp" | "admin";
export const ROLE_LABEL: Record<string, string> = { student: "Student", faculty: "Faculty", hod: "HOD", tnp: "Training & Placement", admin: "Admin" };
export const STAFF_ROLES: StaffRole[] = ["faculty", "hod", "tnp", "admin"];
export const NEEDS_DEPARTMENT: string[] = ["faculty", "hod"];

export interface Person {
  id: string; name: string; email: string | null; role: string; department: string | null; rollNo: string | null; year: number | null; section: string | null;
  disabled: boolean; twofa: boolean; last_login_ms: number | null; test_account: boolean;
}
export interface PeoplePage { total: number; page: number; pages: number; rows: Person[] }
export interface LoginEvent { at_ms: number; kind: "login" | "twofa_failed" | "blocked_disabled"; ip: string | null; agent: string | null }
export interface PersonDetail extends Person { logins: LoginEvent[] }

export interface Settings { departments: string[]; sections: string[]; ai: { enabled: boolean; dailyLimit: number | null } }

export const useSettings = () => useQuery<Settings>({
  queryKey: ["admin", "settings"],
  queryFn: async () => (await api.get("/api/admin/settings")).data.data,
  staleTime: 60_000,
});

export const fmtWhen = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never");

export const LOGIN_KIND: Record<LoginEvent["kind"], string> = { login: "Signed in", twofa_failed: "Wrong two-factor code", blocked_disabled: "Blocked: account disabled" };
