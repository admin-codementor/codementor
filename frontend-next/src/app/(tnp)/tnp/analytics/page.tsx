"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { AnalyticsView } from "@/components/faculty/PlacementTab";
import { PlacementReadiness } from "@/components/faculty/PlacementReadiness";
import { usePlacementMeta } from "@/components/tnp/types";

type View = "placement" | "readiness";
const VIEWS = [{ value: "placement" as const, label: "Placement" }, { value: "readiness" as const, label: "Job readiness" }];

export default function TnpAnalyticsPage() {
  const router = useRouter();
  const meta = usePlacementMeta();
  const [view, setView] = React.useState<View>("placement");
  const [department, setDepartment] = React.useState("");
  const [year, setYear] = React.useState("");

  return (
    <>
      <PageHeader title="Placement analytics" subtitle="The whole college, or one department. Offers made outside the portal count as placed." />
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 3 }}>
        <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Analytics view" />
        <TextField select size="small" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">Whole college</MenuItem>
          {(meta.data?.departments ?? []).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">All years</MenuItem>
          {(meta.data?.years ?? []).map((y) => <MenuItem key={y} value={String(y)}>Year {y}</MenuItem>)}
        </TextField>
      </Stack>
      {view === "placement"
        ? <AnalyticsView section="" year={year} department={department} openDrive={(id) => router.push(`/tnp/drives/${id}`)} />
        : <PlacementReadiness section="" year={year} />}
    </>
  );
}
