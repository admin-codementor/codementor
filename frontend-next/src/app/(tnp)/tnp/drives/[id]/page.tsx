"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChevronRightIcon } from "@/components/ui/icons";
import { DriveDetail, useDrive } from "@/components/tnp/DriveDetail";
import { DriveFormDialog } from "@/components/tnp/DriveFormDialog";
import type { Drive } from "@/components/tnp/types";

export default function TnpDrivePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const drive = useDrive(id);
  const [edit, setEdit] = React.useState<Drive | null>(null);
  return (
    <Stack>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/tnp/drives" underline="hover" color="text.secondary">Drives</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>{drive.data?.drive.company ?? "Drive"}</Typography>
      </Breadcrumbs>
      <PageHeader title={drive.data?.drive.company ?? "Drive"} subtitle="Who applied, who could, and how each student did." />
      <DriveDetail driveId={id} canManage onEdit={setEdit} />
      <DriveFormDialog open={!!edit} onClose={() => setEdit(null)} drive={edit} onDeleted={() => router.replace("/tnp/drives")} />
    </Stack>
  );
}
