"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { radius } from "@/theme/tokens";

export interface Person { id: string; name: string; rollNo: string | null; section: string | null }
export interface Insights {
  students: number;
  notStarted: { total: number; items: Person[] };
  quiet: { total: number; items: (Person & { daysQuiet: number | null })[] };
  stuck: { total: number; items: (Person & { problems: { problemId: string; title: string; attempts: number }[] })[] };
  hardest: { total: number; items: { id: string; title: string; difficulty: string; attempters: number; solvers: number; solveRate: number }[] };
  class: { id: string; label: string } | null;
}

export function useInsights(classId: string) {
  return useQuery<Insights>({
    queryKey: ["faculty", "class-insights", classId],
    queryFn: async () => (await api.get("/api/faculty/class-insights", { params: classId === "all" ? {} : { classId } })).data.data,
    staleTime: 60_000,
  });
}

const who = (p: Person) => `${p.name}${p.rollNo ? ` (${p.rollNo})` : ""}`;

function Group({ title, total, hint, children }: { title: string; total: number; hint: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" fontWeight={600}>{title}</Typography>
        <Chip size="small" label={total} color={total > 0 ? "warning" : "default"} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{hint}</Typography>
      {total === 0 ? <Typography variant="body2" color="text.secondary">Nobody.</Typography> : <Stack spacing={0.5}>{children}</Stack>}
    </Box>
  );
}

/** Who to look at today: students who never started, went quiet, or are stuck, and on what. */
export function AttentionWidget({ query }: { query: ReturnType<typeof useInsights> }) {
  const d = query.data;
  return (
    <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<ListSkeleton rows={4} />} compact
      empty={!!d && d.students === 0} emptyVariant="unassigned" emptyTitle="No students here" emptyDescription="Pick a class that has students, or ask your HOD to give you one.">
      {d && (
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
          <Group title="Not started" total={d.notStarted.total} hint="No submission at all yet.">
            {d.notStarted.items.slice(0, 8).map((p) => <Typography key={p.id} variant="body2" noWrap>{who(p)}</Typography>)}
            {d.notStarted.total > 8 && <Typography variant="caption" color="text.secondary">and {d.notStarted.total - 8} more</Typography>}
          </Group>
          <Group title="Gone quiet" total={d.quiet.total} hint="Submitted before, nothing for a week or more.">
            {d.quiet.items.slice(0, 8).map((p) => <Typography key={p.id} variant="body2" noWrap>{who(p)}{p.daysQuiet != null ? <Typography component="span" variant="caption" color="text.secondary"> · {p.daysQuiet} days</Typography> : null}</Typography>)}
            {d.quiet.total > 8 && <Typography variant="caption" color="text.secondary">and {d.quiet.total - 8} more</Typography>}
          </Group>
          <Group title="Stuck" total={d.stuck.total} hint="Four or more tries on a problem, not solved.">
            {d.stuck.items.slice(0, 8).map((p) => (
              <Box key={p.id}>
                <Typography variant="body2" noWrap>{who(p)}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{p.problems.map((x) => `${x.title} (${x.attempts} tries)`).join(", ")}</Typography>
              </Box>
            ))}
            {d.stuck.total > 8 && <Typography variant="caption" color="text.secondary">and {d.stuck.total - 8} more</Typography>}
          </Group>
        </Box>
      )}
    </DataState>
  );
}

/** Problems that most of the students who tried did not solve: what to teach again. */
export function HardestWidget({ query }: { query: ReturnType<typeof useInsights> }) {
  const d = query.data;
  return (
    <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<ListSkeleton rows={3} />} compact
      empty={!!d && d.hardest.items.length === 0} emptyVariant="unassigned" emptyTitle="No hard problems yet" emptyDescription="A problem shows here when at least three students tried it and fewer than 40% solved it.">
      <Stack spacing={1}>
        {(d?.hardest.items ?? []).map((p) => (
          <Stack key={p.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1, borderRadius: radius.md, border: "1px solid", borderColor: "outlineVariant" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={500} noWrap>{p.title}</Typography>
              <Typography variant="caption" color="text.secondary">{p.solvers} of {p.attempters} who tried it solved it</Typography>
            </Box>
            <Chip size="small" label={`${p.solveRate}%`} color={p.solveRate < 20 ? "error" : "warning"} />
          </Stack>
        ))}
      </Stack>
    </DataState>
  );
}
