"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, InboxIcon, MilitaryTechOutlinedIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";

interface Record_ {
  id: string; name: string; roll_no: string | null; section: string | null; year: number | null; mentor_name: string | null;
  certifications: number; projects: number; achievements: number; types: number;
}
interface Gap { key: string; label: string; students: number; nothing: number; nothing_pct: number; all_three: number }
interface Overview {
  totals: { students: number; nothing: number; all_three: number; items: number };
  bands: { key: "none" | "one" | "two" | "all"; label: string; count: number }[];
  gaps: { section: Gap[]; year: Gap[]; mentor: Gap[] };
  records: Record_[];
}

type GapBy = "section" | "year" | "mentor";
type Band = "all-bands" | "none" | "one" | "two" | "all";
const BAND_TYPES: Record<Exclude<Band, "all-bands">, number> = { none: 0, one: 1, two: 2, all: 3 };
const BAND_COLOR: Record<string, { bg: string; fg: string }> = {
  none: { bg: "errorContainer", fg: "onErrorContainer" },
  one: { bg: "warningContainer", fg: "onWarningContainer" },
  two: { bg: "secondaryContainer", fg: "onSecondaryContainer" },
  all: { bg: "successContainer", fg: "onSuccessContainer" },
};
const GAP_BY = [{ value: "section" as const, label: "Sections" }, { value: "year" as const, label: "Years" }, { value: "mentor" as const, label: "Mentors" }];

const SORT = {
  name: (r: Record_) => r.name,
  types: (r: Record_) => r.types,
  certs: (r: Record_) => r.certifications,
  projects: (r: Record_) => r.projects,
  achievements: (r: Record_) => r.achievements,
};
type SortKey = keyof typeof SORT;
const searchText = (r: Record_) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""} ${r.mentor_name ?? ""}`;

/** How complete students' portfolios are, counted by the types covered (never a score) and where the gaps are. */
export function PortfolioTab({ section, year, mentor }: { section: string; year: string; mentor: string }) {
  const router = useRouter();
  const [gapBy, setGapBy] = React.useState<GapBy>("section");
  const [band, setBand] = React.useState<Band>("all-bands");

  const query = useQuery<Overview>({
    queryKey: ["faculty", "portfolio", section, year, mentor],
    queryFn: async () => (await api.get("/api/faculty/portfolio", {
      params: { ...(section ? { section } : {}), ...(year ? { year } : {}), ...(mentor ? { mentor } : {}) },
    })).data.data,
    staleTime: 30_000,
  });
  const d = query.data;

  const rows = React.useMemo(
    () => (d?.records ?? []).filter((r) => band === "all-bands" || r.types === BAND_TYPES[band]),
    [d, band],
  );
  const t = useTable<Record_, SortKey>(rows, searchText, SORT, { by: "types", dir: "asc" });

  if (query.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
        {apiErrorMessage(query.error, "Could not load portfolio completeness.")}
      </Alert>
    );
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={320} />;

  const total = d.totals.students;
  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.roll_no ?? "", section: r.section ?? "", year: r.year ?? "", mentor: r.mentor_name ?? "",
    certifications: r.certifications, projects: r.projects, achievements: r.achievements, types_covered: r.types,
  })));
  const gaps = d.gaps[gapBy];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Counted by how many of the three types (certifications, projects, achievements) a student has recorded —
        never by a score. Ten certificates and no project is one type.
      </Typography>

      <KpiRow min={170}>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={total} />
        <KpiTile icon={<InboxIcon />} accent="error" label="Nothing on record" value={d.totals.nothing} total={total} />
        <KpiTile icon={<CheckCircleOutlineIcon />} accent="success" label="All three types" value={d.totals.all_three} total={total} />
        <KpiTile icon={<MilitaryTechOutlinedIcon />} accent="tertiary" label="Entries" value={d.totals.items} />
      </KpiRow>

      {total === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students in this view" description="Try clearing the section, year or mentor filter." />
        </Card>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>How complete portfolios are</Typography>
          <Box sx={{ display: "flex", height: 44, borderRadius: radius.md, overflow: "hidden", mb: 1 }} role="group" aria-label="Portfolio completeness bands">
            {d.bands.map((b) => {
              const c = BAND_COLOR[b.key];
              return (
                <Box
                  key={b.key} component="button" type="button"
                  onClick={() => setBand((cur) => (cur === b.key ? "all-bands" : b.key))}
                  aria-label={`${b.label}: ${b.count} students. Click to list them.`}
                  aria-pressed={band === b.key}
                  sx={{
                    all: "unset", boxSizing: "border-box", cursor: b.count ? "pointer" : "default", flex: b.count ? b.count : 0,
                    minWidth: b.count ? 36 : 0, display: "grid", placeItems: "center", bgcolor: c.bg, color: c.fg, fontWeight: 700,
                    outline: band === b.key ? "2px solid var(--mui-palette-primary-main)" : "none", outlineOffset: -2,
                    "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: -2 },
                  }}
                >
                  {b.count || ""}
                </Box>
              );
            })}
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
            {d.bands.map((b) => (
              <Stack key={b.key} direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 10, height: 10, borderRadius: radius.xs, bgcolor: BAND_COLOR[b.key].bg, border: "1px solid", borderColor: "outlineVariant" }} />
                <Typography variant="caption" color="text.secondary">{b.label} · {b.count}</Typography>
              </Stack>
            ))}
          </Stack>

          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>Where the gap is</Typography>
            <SegmentedButtons<GapBy> value={gapBy} onChange={setGapBy} segments={GAP_BY} ariaLabel="Group gaps by" />
          </Stack>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden", mb: 3 }}>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Portfolio gaps, worst first" sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <TableCell>{GAP_BY.find((g) => g.value === gapBy)?.label.slice(0, -1)}</TableCell>
                    <TableCell align="right">Students</TableCell>
                    <TableCell align="right">Nothing on record</TableCell>
                    <TableCell align="right">All three</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gaps.map((g) => (
                    <TableRow key={g.key} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell>{g.label}</TableCell>
                      <TableCell align="right">{g.students}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color={g.nothing_pct >= 50 ? "error.main" : undefined} fontWeight={g.nothing_pct >= 50 ? 600 : 400}>
                          {g.nothing} · {g.nothing_pct}%
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{g.all_three}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Student records</Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
            <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no, section or mentor" label="Search students" sx={{ maxWidth: 340 }} />
            {band !== "all-bands" && (
              <Chip label={`Showing: ${d.bands.find((b) => b.key === band)?.label}`} onDelete={() => setBand("all-bands")} size="small" />
            )}
            <Box sx={{ flex: 1 }} />
            <ExportButton filename="portfolio-completeness.csv" csv={csv} disabled={t.all.length === 0} />
          </Stack>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            {t.all.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try clearing the search or the band filter." />
            ) : (
              <>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" aria-label="Student portfolio records" sx={{ minWidth: 720 }}>
                    <TableHead>
                      <TableRow sx={headRow}>
                        <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                        <TableCell>Mentor</TableCell>
                        <Head<SortKey> id="certs" label="Certifications" sort={t.sort} toggle={t.toggle} align="right" />
                        <Head<SortKey> id="projects" label="Projects" sort={t.sort} toggle={t.toggle} align="right" />
                        <Head<SortKey> id="achievements" label="Achievements" sort={t.sort} toggle={t.toggle} align="right" />
                        <Head<SortKey> id="types" label="Types covered" sort={t.sort} toggle={t.toggle} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {t.visible.map((r) => {
                        const key = (["none", "one", "two", "all"] as const)[r.types];
                        return (
                          <TableRow key={r.id} hover onClick={() => router.push(`/faculty/students/${r.id}`)} sx={bodyRow}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {[r.roll_no, r.section && `Sec ${r.section}`, r.year && `Year ${r.year}`].filter(Boolean).join(" · ")}
                              </Typography>
                            </TableCell>
                            <TableCell>{r.mentor_name ?? <Typography variant="caption" color="text.disabled">—</Typography>}</TableCell>
                            <TableCell align="right">{r.certifications}</TableCell>
                            <TableCell align="right">{r.projects}</TableCell>
                            <TableCell align="right">{r.achievements}</TableCell>
                            <TableCell>
                              <Chip
                                size="small" label={r.types === 0 ? "Nothing" : `${r.types} of 3`}
                                sx={{ height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600, bgcolor: BAND_COLOR[key].bg, color: BAND_COLOR[key].fg }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
              </>
            )}
          </Card>
        </>
      )}
    </Box>
  );
}
