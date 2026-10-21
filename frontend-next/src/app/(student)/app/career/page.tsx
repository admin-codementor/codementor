"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { InterviewTab, ReadinessTab, ResumeTab } from "@/components/career/CareerTabs";
import { useCareerQuery } from "@/lib/queries/career";

type Tab = "readiness" | "resume" | "interview";
const TABS = [
  { value: "readiness" as const, label: "Readiness" },
  { value: "resume" as const, label: "Resume check" },
  { value: "interview" as const, label: "Mock interview" },
];

function CareerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "resume" || raw === "interview" ? raw : "readiness";
  const query = useCareerQuery();

  return (
    <>
      <PageHeader title="Career" subtitle="Check your resume, practise an interview and see how ready you are for placements." />
      <SegmentedButtons<Tab> value={tab} onChange={(t) => router.replace(`/app/career?tab=${t}`)} segments={TABS} ariaLabel="Career section" />
      <DataState loading={query.isLoading} fetching={query.isFetching} error={query.isError ? query.error : undefined} onRetry={query.refetch} skeleton={<CardGridSkeleton />}>
        {query.data && (
          <div style={{ marginTop: 24 }}>
            {tab === "readiness" && <ReadinessTab data={query.data} />}
            {tab === "resume" && <ResumeTab data={query.data} />}
            {tab === "interview" && <InterviewTab data={query.data} />}
          </div>
        )}
      </DataState>
    </>
  );
}

export default function CareerPage() {
  return <Suspense><CareerInner /></Suspense>;
}
