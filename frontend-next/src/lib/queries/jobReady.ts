"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export interface ScoreComponent {
  key: string;
  label: string;
  detail: string;
  /** Share of the 100 this component is worth for this target. */
  weight: number;
  /** This component on its own, 0–100. */
  score: number;
  /** Points it contributes to the target's score. */
  contributes: number;
  data: Record<string, unknown>;
}

export interface NextAction {
  label: string;
  why: string;
  href: string;
}

export interface ScoreTarget {
  key: string;
  label: string;
  blurb: string;
  score: number;
  weekChange: number;
  components: ScoreComponent[];
  nextActions: NextAction[];
}

export interface JobReadyData {
  targets: ScoreTarget[];
  roleTargetAvailable: boolean;
  roadmap: { id: string; role: string; percent: number } | null;
  glossary: Record<string, { label: string; detail: string }>;
}

export function useJobReadyQuery() {
  return useQuery<JobReadyData>({
    queryKey: ["student", "job-ready"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: JobReadyData }>("/api/student/job-ready");
      if (!res.data?.success) throw new Error("Failed to load your readiness score");
      return res.data.data;
    },
  });
}

// ── The public profile a student can publish ────────────────────────────────

export interface PublicProfileSettings {
  handle: string | null;
  published: boolean;
  showScore: boolean;
  url: string | null;
}

export function usePublicProfileSettings() {
  return useQuery<PublicProfileSettings>({
    queryKey: ["student", "public-profile"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PublicProfileSettings }>("/api/student/public-profile");
      if (!res.data?.success) throw new Error("Failed to load your profile settings");
      return res.data.data;
    },
  });
}

const SETTINGS_KEY = ["student", "public-profile"] as const;

/**
 * Errors carry the server's own wording — "that handle is taken" is the useful
 * message.
 *
 * The switches update straight away rather than waiting for the round trip.
 * Without that, flipping "published" left the toggle sitting in its old
 * position for a second or so and then jumping, which reads as the click not
 * having registered. A failure puts the old value back.
 */
export function useSavePublicProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { handle?: string; published?: boolean; showScore?: boolean }) => {
      try {
        const res = await api.put<{ success: boolean; data: PublicProfileSettings }>(
          "/api/student/public-profile",
          patch,
        );
        return res.data.data;
      } catch (err) {
        const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        throw new Error(message || "Could not save that");
      }
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const previous = qc.getQueryData<PublicProfileSettings>(SETTINGS_KEY);
      if (previous) {
        qc.setQueryData<PublicProfileSettings>(SETTINGS_KEY, {
          ...previous,
          ...(patch.published !== undefined ? { published: patch.published } : {}),
          ...(patch.showScore !== undefined ? { showScore: patch.showScore } : {}),
        });
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) qc.setQueryData(SETTINGS_KEY, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

// ── Proving an external coding account is yours ─────────────────────────────

export interface VerificationChallenge {
  platform: string;
  handle: string;
  code: string;
  where: string;
  expiresInMinutes: number;
}

export function useStartVerification() {
  return useMutation({
    mutationFn: async (platform: string) => {
      const res = await api.post<{ success: boolean; data: VerificationChallenge }>(
        `/api/profiles/me/${platform}/verify-code`,
        {},
      );
      return res.data.data;
    },
  });
}

export function useConfirmVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (platform: string) => {
      try {
        const res = await api.post(`/api/profiles/me/${platform}/verify`, {});
        return res.data.data;
      } catch (err) {
        const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        throw new Error(message || "Could not verify that account");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coding-profiles"] });
      qc.invalidateQueries({ queryKey: ["student", "job-ready"] });
    },
  });
}

// ── The public page itself ──────────────────────────────────────────────────

export interface PublicProfile {
  handle: string;
  name: string | null;
  college: string | null;
  department: string | null;
  year: number | null;
  verified: {
    solved: number;
    byDifficulty: { easy: number; medium: number; hard: number };
    topTopics: { topic: string; count: number }[];
    activity: { date: string; count: number }[];
  };
  completedCourses: { title: string; problems: number }[];
  roadmap: { role: string; percent: number; step: number | null; steps: number } | null;
  jobReady: { key: string; label: string; score: number }[] | null;
  externals: { platform: string; handle: string; solved: number; rating: number | null; verifiedAt: number | null }[];
}

/** Read without a token — this is the one endpoint that answers to anyone. */
export function usePublicProfileQuery(handle: string) {
  return useQuery<PublicProfile>({
    queryKey: ["public-profile", handle],
    enabled: !!handle,
    retry: false,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: PublicProfile }>(`/api/public/profile/${handle}`);
      if (!res.data?.success) throw new Error("No public profile at that address");
      return res.data.data;
    },
  });
}
