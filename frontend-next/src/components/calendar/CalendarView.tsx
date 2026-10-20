"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState } from "@/components/ui/States";

interface CalEvent { key: string; type: "assignment" | "exam_assignment" | "exam" | "unit_due" | "unit_opens"; title: string; at: string; endAt: string | null; detail: string; href: string }

const TYPE_STYLE: Record<CalEvent["type"], { bg: string; fg: string; label: string }> = {
  assignment: { bg: "primaryContainer", fg: "onPrimaryContainer", label: "Assignment due" },
  exam_assignment: { bg: "tertiaryContainer", fg: "onTertiaryContainer", label: "Proctored work due" },
  exam: { bg: "errorContainer", fg: "onErrorContainer", label: "Exam" },
  unit_due: { bg: "warningContainer", fg: "onWarningContainer", label: "Unit due" },
  unit_opens: { bg: "successContainer", fg: "onSuccessContainer", label: "Unit opens" },
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * A month of everything that has a date: assignment deadlines, exam windows, and course unit due and opening dates.
 * Students see what is set for them; staff see what they run. Click an event to open it.
 */
export function CalendarView() {
  const router = useRouter();
  const [cursor, setCursor] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = React.useState<string | null>(null);

  // The grid shows whole weeks, so ask for a little either side of the month.
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - ((new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 42);

  const q = useQuery<CalEvent[]>({
    queryKey: ["calendar", key(start)],
    queryFn: async () => (await api.get<{ success: boolean; data: { events: CalEvent[] } }>("/api/calendar", { params: { from: start.toISOString(), to: end.toISOString() } })).data.data.events,
    staleTime: 60_000,
  });

  const byDay = React.useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of q.data ?? []) {
      const k = key(new Date(e.at));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [q.data]);

  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const todayKey = key(new Date());
  const month = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shown = selected ? (byDay.get(selected) ?? []) : (q.data ?? []).filter((e) => new Date(e.at).getMonth() === cursor.getMonth());

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <IconButton aria-label="Previous month" onClick={() => { setSelected(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)); }}><ChevronLeftIcon /></IconButton>
        <Typography variant="h6" fontWeight={600} sx={{ minWidth: 180, textAlign: "center" }}>{month}</Typography>
        <IconButton aria-label="Next month" onClick={() => { setSelected(null); setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)); }}><ChevronRightIcon /></IconButton>
        <Button size="small" onClick={() => { const d = new Date(); setSelected(null); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
      </Stack>

      {q.isError ? <ErrorState onRetry={() => q.refetch()} /> : (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 2fr) minmax(0, 1fr)" }, alignItems: "start" }}>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid", borderColor: "outlineVariant" }}>
              {DAYS.map((d) => <Typography key={d} variant="caption" color="text.secondary" sx={{ p: 1, textAlign: "center", fontWeight: 700 }}>{d}</Typography>)}
            </Box>
            {q.isLoading ? <Skeleton variant="rounded" height={360} /> : (
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                {cells.map((d) => {
                  const k = key(d);
                  const list = byDay.get(k) ?? [];
                  const inMonth = d.getMonth() === cursor.getMonth();
                  return (
                    <Box
                      key={k} component="button" type="button" onClick={() => setSelected(selected === k ? null : k)}
                      aria-label={`${d.toDateString()}, ${list.length} event${list.length === 1 ? "" : "s"}`} aria-pressed={selected === k}
                      sx={{
                        all: "unset", boxSizing: "border-box", cursor: "pointer", minHeight: { xs: 56, sm: 92 }, p: 0.75,
                        borderRight: "1px solid", borderBottom: "1px solid", borderColor: "outlineVariant",
                        bgcolor: selected === k ? "surfaceContainerHigh" : "transparent", opacity: inMonth ? 1 : 0.45,
                        "&:hover": { bgcolor: "surfaceContainer" }, "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: -2 },
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ display: "inline-grid", placeItems: "center", width: 22, height: 22, borderRadius: "50%", fontWeight: k === todayKey ? 700 : 500, bgcolor: k === todayKey ? "primary.main" : "transparent", color: k === todayKey ? "primary.contrastText" : "text.primary" }}
                      >
                        {d.getDate()}
                      </Typography>
                      <Box sx={{ display: { xs: "none", sm: "block" }, mt: 0.5 }}>
                        {list.slice(0, 2).map((e) => (
                          <Typography key={e.key} variant="caption" noWrap sx={{ display: "block", px: 0.5, mb: 0.25, borderRadius: 0.75, bgcolor: TYPE_STYLE[e.type].bg, color: TYPE_STYLE[e.type].fg, fontWeight: 600 }}>{e.title}</Typography>
                        ))}
                        {list.length > 2 && <Typography variant="caption" color="text.secondary">+{list.length - 2} more</Typography>}
                      </Box>
                      <Box sx={{ display: { xs: "flex", sm: "none" }, gap: 0.25, mt: 0.5 }}>
                        {list.slice(0, 3).map((e) => <Box key={e.key} sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: TYPE_STYLE[e.type].fg }} />)}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Card>

          <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              {selected ? new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : `Everything in ${month}`}
            </Typography>
            {q.isLoading ? <Skeleton variant="rounded" height={120} /> : shown.length === 0 ? (
              <EmptyState compact title="Nothing dated" description={selected ? "Pick another day, or clear the selection." : "No deadlines, exams or unit dates this month."} />
            ) : (
              <Stack spacing={1}>
                {shown.map((e) => (
                  <Box
                    key={e.key} component="button" type="button" onClick={() => router.push(e.href)}
                    sx={{ all: "unset", cursor: "pointer", boxSizing: "border-box", p: 1.25, borderRadius: 1.5, border: "1px solid", borderColor: "outlineVariant", display: "flex", gap: 1.25, alignItems: "flex-start", "&:hover": { bgcolor: "surfaceContainerHigh" }, "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)" } }}
                  >
                    <Box sx={{ width: 8, alignSelf: "stretch", borderRadius: 1, bgcolor: TYPE_STYLE[e.type].fg, flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{e.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {TYPE_STYLE[e.type].label} · {new Date(e.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })} {time(e.at)}{e.endAt ? ` to ${time(e.endAt)}` : ""}
                      </Typography>
                      {e.detail.includes("·") && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{e.detail.split("·")[1].trim()}</Typography>}
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} sx={{ mt: 2, flexWrap: "wrap", rowGap: 0.75 }}>
              {Object.values(TYPE_STYLE).map((s) => (
                <Stack key={s.label} direction="row" spacing={0.5} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: s.bg, border: "1px solid", borderColor: s.fg }} />
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
        </Box>
      )}
    </Stack>
  );
}
