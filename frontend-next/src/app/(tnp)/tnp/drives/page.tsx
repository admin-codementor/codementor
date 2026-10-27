"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DrivesList } from "@/components/tnp/DrivesList";
import { DriveFormDialog } from "@/components/tnp/DriveFormDialog";
import type { Drive } from "@/components/tnp/types";

export default function TnpDrivesPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<{ drive: Drive | null } | null>(null);
  return (
    <>
      <PageHeader title="Placement drives" subtitle="Company visits for every department. Students see a drive only once you publish it." />
      <DrivesList canManage onOpen={(id) => router.push(`/tnp/drives/${id}`)} onNew={() => setForm({ drive: null })} onEdit={(d) => setForm({ drive: d })} />
      <DriveFormDialog open={!!form} onClose={() => setForm(null)} drive={form?.drive ?? null} />
    </>
  );
}
