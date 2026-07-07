"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { ShieldOutlinedIcon, GppGoodOutlinedIcon, ContentCopyIcon, CheckIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";

type Msg = { text: string; ok: boolean } | null;

/** A 6-digit, numeric-only code input — dependency-free OTP field. */
function OtpField({
  value,
  onChange,
  disabled,
  label = "Verification code",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      disabled={disabled}
      label={label}
      placeholder="000000"
      size="small"
      slotProps={{
        htmlInput: {
          inputMode: "numeric",
          autoComplete: "one-time-code",
          maxLength: 6,
          "aria-label": label,
          style: {
            letterSpacing: "0.5em",
            fontFamily: "ui-monospace, monospace",
            fontSize: 20,
            textAlign: "center",
          },
        },
      }}
      sx={{ maxWidth: 220 }}
    />
  );
}

export function TwoFactorSetup() {
  const cachedUser = getUser() as (ReturnType<typeof getUser> & { totp_enabled?: boolean }) | null;
  const [enabled, setEnabled] = React.useState<boolean>(!!cachedUser?.totp_enabled);

  const [setupLoading, setSetupLoading] = React.useState(false);
  const [qr, setQr] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const [code, setCode] = React.useState("");
  const [actionLoading, setActionLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);

  const [showDisable, setShowDisable] = React.useState(false);
  const [disableCode, setDisableCode] = React.useState("");

  const syncEnabled = (val: boolean) => {
    setEnabled(val);
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      if (u) {
        u.totp_enabled = val;
        localStorage.setItem("user", JSON.stringify(u));
      }
    } catch {
      /* ignore */
    }
  };

  const startSetup = async () => {
    setSetupLoading(true);
    setMsg(null);
    setQr(null);
    setSecret(null);
    setCode("");
    try {
      const res = await api.post("/api/2fa/setup");
      const data = res.data?.data ?? {};
      setQr(data.qr_data_url ?? null);
      setSecret(data.secret ?? null);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setMsg({ text: err?.response?.data?.error || "Failed to start 2FA setup", ok: false });
    } finally {
      setSetupLoading(false);
    }
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — manual entry still possible */
    }
  };

  const enable = async () => {
    if (code.length !== 6) {
      setMsg({ text: "Enter the 6-digit code from your authenticator app", ok: false });
      return;
    }
    setActionLoading(true);
    setMsg(null);
    try {
      await api.post("/api/2fa/enable", { token: code });
      syncEnabled(true);
      setQr(null);
      setSecret(null);
      setCode("");
      setMsg({ text: "Two-factor authentication is now enabled", ok: true });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setMsg({ text: err?.response?.data?.error || "Invalid verification code", ok: false });
    } finally {
      setActionLoading(false);
    }
  };

  const disable = async () => {
    if (disableCode.length !== 6) {
      setMsg({ text: "Enter the 6-digit code to confirm disabling", ok: false });
      return;
    }
    setActionLoading(true);
    setMsg(null);
    try {
      await api.post("/api/2fa/disable", { token: disableCode });
      syncEnabled(false);
      setShowDisable(false);
      setDisableCode("");
      setMsg({ text: "Two-factor authentication has been disabled", ok: true });
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setMsg({ text: err?.response?.data?.error || "Invalid verification code", ok: false });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Chip
          icon={enabled ? <GppGoodOutlinedIcon /> : <ShieldOutlinedIcon />}
          label={enabled ? "Enabled" : "Disabled"}
          size="small"
          sx={{
            fontWeight: 700,
            bgcolor: enabled ? "successContainer" : "surfaceContainerHigh",
            color: enabled ? "onSuccessContainer" : "onSurfaceVariant",
            "& .MuiChip-icon": { color: "inherit" },
          }}
        />
        <Typography variant="body2" color="text.secondary">
          Protect your account with a time-based one-time code from an authenticator app.
        </Typography>
      </Stack>

      {msg && (
        <Alert severity={msg.ok ? "success" : "error"} sx={{ mb: 2 }}>
          {msg.text}
        </Alert>
      )}

      {/* Not enabled: setup + enable flow */}
      {!enabled &&
        (!qr ? (
          <Button
            variant="contained"
            startIcon={<GppGoodOutlinedIcon />}
            onClick={startSetup}
            disabled={setupLoading}
          >
            {setupLoading ? "Starting…" : "Set Up Two-Factor Authentication"}
          </Button>
        ) : (
          <Stack spacing={3}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="flex-start">
              <Box sx={{ bgcolor: "#fff", p: 1.5, borderRadius: 2, flexShrink: 0 }}>
                {/* qr is a data: URI from the backend */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="2FA QR code" width={176} height={176} style={{ display: "block" }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ mb: 1.5 }}>
                  1. Scan this QR code with Google Authenticator, Authy, or any TOTP app.
                </Typography>
                <Typography variant="overline" color="text.secondary">
                  Or enter this key manually
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  <Box
                    component="code"
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      bgcolor: "surfaceContainerHigh",
                      border: "1px solid",
                      borderColor: "outlineVariant",
                      borderRadius: 1,
                      px: 1.5,
                      py: 1,
                      fontSize: 12,
                      fontFamily: "ui-monospace, monospace",
                    }}
                  >
                    {secret}
                  </Box>
                  <Tooltip title={copied ? "Copied" : "Copy key"}>
                    <IconButton onClick={copySecret} size="small" aria-label="Copy secret key">
                      {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
            </Stack>

            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                2. Enter the 6-digit code to confirm.
              </Typography>
              <OtpField value={code} onChange={setCode} disabled={actionLoading} />
            </Box>

            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" onClick={enable} disabled={actionLoading || code.length !== 6}>
                {actionLoading ? "Enabling…" : "Enable"}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setQr(null);
                  setSecret(null);
                  setCode("");
                  setMsg(null);
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        ))}

      {/* Enabled: disable flow */}
      {enabled &&
        (!showDisable ? (
          <Button
            variant="outlined"
            color="error"
            startIcon={<ShieldOutlinedIcon />}
            onClick={() => {
              setShowDisable(true);
              setMsg(null);
            }}
          >
            Disable Two-Factor Authentication
          </Button>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2">
              Enter a current 6-digit code from your authenticator app to disable 2FA.
            </Typography>
            <OtpField
              value={disableCode}
              onChange={setDisableCode}
              disabled={actionLoading}
              label="Confirmation code"
            />
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="contained"
                color="error"
                onClick={disable}
                disabled={actionLoading || disableCode.length !== 6}
              >
                {actionLoading ? "Disabling…" : "Confirm Disable"}
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setShowDisable(false);
                  setDisableCode("");
                  setMsg(null);
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        ))}
    </Box>
  );
}

export default TwoFactorSetup;
