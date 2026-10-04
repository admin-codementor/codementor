"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExamsPanel } from "@/components/student/tests/ExamsPanel";
import { McqPanel } from "@/components/student/tests/McqPanel";

/**
 * One place for every timed assessment.
 *
 * Exams, aptitude tests and technical MCQs were three separate menu entries that
 * all mean "a test with a clock". They are still three different things
 * underneath — multi-section exams live in their own collection, the other two
 * are the same MCQ collection split by category — but a student shouldn't have
 * to know that to find what they have to sit.
 *
 * Assignments stay separate on purpose: they are coursework with a deadline,
 * not a sitting.
 */

const TABS = ["exams", "aptitude", "technical"] as const;
type TabKey = (typeof TABS)[number];

const isTab = (v: string | null): v is TabKey => !!v && (TABS as readonly string[]).includes(v);

export default function TestsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: TabKey = isTab(requested) ? requested : "exams";

  // Kept in the URL so a tab can be linked to and survives a refresh.
  const select = (next: TabKey) => {
    router.replace(next === "exams" ? "/app/tests" : `/app/tests?tab=${next}`, { scroll: false });
  };

  return (
    <Box>
      <PageHeader
        title="Tests"
        subtitle="Everything with a clock on it — exams, aptitude and technical rounds."
      />

      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => select(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: "outlineVariant" }}
        aria-label="Test type"
      >
        <Tab value="exams" label="Exams" />
        <Tab value="aptitude" label="Aptitude" />
        <Tab value="technical" label="Technical MCQ" />
      </Tabs>

      {tab === "exams" && <ExamsPanel />}
      {tab === "aptitude" && <McqPanel categories={["aptitude", "verbal", "logical"]} />}
      {tab === "technical" && <McqPanel categories={["technical"]} />}
    </Box>
  );
}
