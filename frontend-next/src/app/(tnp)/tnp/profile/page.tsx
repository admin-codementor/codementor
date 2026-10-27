"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/ui/PageHeader";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { ROLE_LABEL, getUser } from "@/lib/auth";

export default function TnpProfilePage() {
  const [user, setUser] = React.useState<ReturnType<typeof getUser>>(null);
  React.useEffect(() => { setUser(getUser()); }, []);
  return (
    <>
      <PageHeader title="Your account" />
      <Stack spacing={3} sx={{ maxWidth: 640 }}>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle1" fontWeight={600}>{user?.name ?? ""}</Typography>
            <Typography variant="body2" color="text.secondary">{user?.email ?? ""}</Typography>
            <Typography variant="body2" color="text.secondary">{user ? ROLE_LABEL[user.role] : ""}</Typography>
          </Stack>
        </Card>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Two-factor sign-in</Typography>
          <TwoFactorSetup />
        </Card>
      </Stack>
    </>
  );
}
