"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getRole, getUser } from "@/lib/auth";

/** One thing the class switcher can select: a class of the current term, or a join-code classroom. */
export interface ClassOption { id: string; label: string; kind: "academic" | "classroom"; detail?: string }

interface MyClasses { term: { id: string; label: string } | null; classes: { id: string; label: string; students: number; mentees: boolean; via: string[] }[] }
interface Term { id: string; status: string }
interface ClassRow { id: string; label: string; students: number }
interface Classroom { id: string; name: string; department: string | null; member_count: number }

/**
 * The classes this person can switch between. Faculty: the classes they teach or look after this term, plus their own classrooms.
 * HOD: every class of their department plus their department's classrooms. Admin: every class this term plus every classroom.
 * Only choices the server will accept are listed (it refuses any other, see middleware/classFilter.js).
 */
export function useClassOptions() {
  const role = getRole();
  const dept = getUser()?.department ?? null;
  return useQuery<ClassOption[]>({
    queryKey: ["dashboard", "class-options", role],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: ClassOption[] = [];
      if (role === "faculty") {
        const my = (await api.get<{ data: MyClasses }>("/api/academic/my-classes")).data.data;
        for (const c of my.classes) out.push({ id: c.id, label: c.label, kind: "academic", detail: c.mentees ? "your mentees" : `${c.students} students` });
      } else {
        const terms = (await api.get<{ data: Term[] }>("/api/academic/terms")).data.data;
        const active = terms.find((t) => t.status === "active");
        if (active) {
          const rows = (await api.get<{ data: ClassRow[] }>(`/api/academic/terms/${active.id}/classes`)).data.data;
          for (const c of rows) out.push({ id: c.id, label: c.label, kind: "academic", detail: `${c.students} students` });
        }
      }
      const rooms = (await api.get<{ data: Classroom[] }>("/api/classrooms")).data.data;
      for (const r of rooms) {
        if (role === "hod" && (r.department ?? null) !== dept) continue;
        out.push({ id: r.id, label: r.name, kind: "classroom", detail: `${r.member_count} students` });
      }
      return out;
    },
  });
}

const storageKey = () => `faculty-dashboard-class:${getUser()?.id ?? "anon"}`;

/** The chosen class ("all" = no narrowing), remembered on this device. A remembered class that is no longer on offer is forgotten. */
export function useDashboardClass(options: ClassOption[] | undefined) {
  const [classId, setClassIdState] = React.useState<string>("all");
  React.useEffect(() => {
    try { const v = window.localStorage.getItem(storageKey()); if (v) setClassIdState(v); } catch { /* storage blocked: start on "all" */ }
  }, []);
  React.useEffect(() => {
    if (options && classId !== "all" && !options.some((o) => o.id === classId)) setClassIdState("all");
  }, [options, classId]);
  const setClassId = React.useCallback((v: string) => {
    setClassIdState(v);
    try { window.localStorage.setItem(storageKey(), v); } catch { /* the choice just is not remembered */ }
  }, []);
  return { classId, setClassId };
}
