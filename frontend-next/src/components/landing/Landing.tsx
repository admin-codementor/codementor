"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Reveal } from "@/components/ui/motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { shape } from "@/theme/tokens";
import {
  AdminPanelSettingsOutlinedIcon, ArrowForwardIcon, AssignmentOutlinedIcon, CheckCircleOutlineIcon, CodeIcon,
  EmojiEventsOutlinedIcon, FingerprintOutlinedIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, MenuBookOutlinedIcon,
  SchoolOutlinedIcon, SmartToyOutlinedIcon, WorkOutlineOutlinedIcon,
} from "@/components/ui/icons";
import { AnalyticsMock, EditorMock, ExamMock, TestCasesMock } from "./Mockups";

type IconC = React.ComponentType<{ fontSize?: "small" | "medium" | "large" | "inherit" }>;

const FEATURES: { icon: IconC; title: string; desc: string }[] = [
  { icon: CodeIcon, title: "Code in the browser", desc: "A full editor with instant run, visible and hidden test cases, and clear verdicts on every submission." },
  { icon: SmartToyOutlinedIcon, title: "Socratic AI tutor", desc: "Asks guiding questions when you are stuck instead of handing over the answer." },
  { icon: MenuBookOutlinedIcon, title: "Courses and practice", desc: "Structured courses with modules, plus a problem bank, aptitude practice and assignments." },
  { icon: AssignmentOutlinedIcon, title: "Proctored exams", desc: "Multi-section exams mixing coding and MCQ, with tab-switch and fullscreen monitoring." },
  { icon: FingerprintOutlinedIcon, title: "Plagiarism checks", desc: "Code-similarity reports so faculty can review suspicious submissions with evidence." },
  { icon: InsightsOutlinedIcon, title: "Analytics for faculty", desc: "Class and student dashboards that show who is on track and who needs attention." },
];

const ROLES: { icon: IconC; title: string; points: string[] }[] = [
  { icon: SchoolOutlinedIcon, title: "Students", points: ["Practice, courses and contests", "Exams with a clear timer", "Progress, streaks and leaderboard"] },
  { icon: GroupsOutlinedIcon, title: "Faculty", points: ["Author problems, MCQs and exams", "Class and student analytics", "Plagiarism and exam reports"] },
  { icon: WorkOutlineOutlinedIcon, title: "HOD", points: ["Department-scoped view of staff and students", "Spot at-risk students early", "Review department results"] },
  { icon: AdminPanelSettingsOutlinedIcon, title: "Admins", points: ["Manage faculty permissions", "Audit log of staff actions", "Monitor code-judge health"] },
];

const STEPS = [
  { n: "1", title: "Sign in with your college account", desc: "Students, faculty, HODs and admins each land on a workspace built for their role." },
  { n: "2", title: "Learn, practise and take exams", desc: "Solve problems, learn from the AI tutor, and sit proctored assessments." },
  { n: "3", title: "Track progress and improve", desc: "Dashboards turn submissions into clear next steps for students and staff." },
];

const NAV = [
  { label: "Features", href: "#features" },
  { label: "Roles", href: "#roles" },
  { label: "How it works", href: "#how" },
];

function Logo() {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center">
      <Box aria-hidden sx={{ width: 34, height: 34, borderRadius: `${shape.medium}px`, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
        <CodeIcon fontSize="small" />
      </Box>
      <Typography variant="h6" fontWeight={700} letterSpacing="-0.01em">CodeMentor</Typography>
    </Stack>
  );
}

function SectionHead({ id, eyebrow, title, desc }: { id?: string; eyebrow: string; title: string; desc?: string }) {
  return (
    <Box id={id} sx={{ textAlign: "center", maxWidth: 680, mx: "auto", mb: 6, scrollMarginTop: 88 }}>
      <Typography variant="overline" color="primary" fontWeight={700}>{eyebrow}</Typography>
      <Typography variant="h3" component="h2" fontWeight={700} letterSpacing="-0.02em" sx={{ mt: 0.5 }}>{title}</Typography>
      {desc && <Typography color="text.secondary" sx={{ mt: 1.5 }}>{desc}</Typography>}
    </Box>
  );
}

function Showcase({ eyebrow, title, desc, bullets, visual, flip }: { eyebrow: string; title: string; desc: string; bullets: string[]; visual: React.ReactNode; flip?: boolean }) {
  return (
    <Box sx={{ display: "grid", gap: { xs: 4, md: 8 }, alignItems: "center", gridTemplateColumns: { xs: "1fr", md: "1fr 1.1fr" }, mb: { xs: 8, md: 12 } }}>
      <Box sx={{ order: { md: flip ? 2 : 1 } }}>
        <Typography variant="overline" color="primary" fontWeight={700}>{eyebrow}</Typography>
        <Typography variant="h4" component="h3" fontWeight={700} letterSpacing="-0.01em" sx={{ mt: 0.5 }}>{title}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1.5 }}>{desc}</Typography>
        <Stack spacing={1} sx={{ mt: 2.5 }} component="ul" style={{ listStyle: "none", padding: 0, margin: 0, marginTop: 20 }}>
          {bullets.map((b) => (
            <Stack key={b} component="li" direction="row" spacing={1.25} alignItems="center">
              <CheckCircleOutlineIcon sx={{ color: "success.main", fontSize: 20 }} />
              <Typography variant="body2">{b}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Box sx={{ order: { md: flip ? 1 : 2 } }}>{visual}</Box>
    </Box>
  );
}

export function Landing() {
  return (
    <Box sx={{ bgcolor: "background.default", color: "text.primary", minHeight: "100dvh" }}>
      {/* Top nav */}
      <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)", bgcolor: "color-mix(in srgb, var(--mui-palette-background-default) 82%, transparent)", borderBottom: "1px solid var(--mui-palette-outlineVariant)" }}>
        <Container maxWidth="lg">
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 64 }}>
            <Logo />
            <Stack direction="row" spacing={3} sx={{ display: { xs: "none", md: "flex" } }} component="nav" aria-label="Sections">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} underline="none" color="text.secondary" variant="body2" sx={{ "&:hover": { color: "text.primary" } }}>{n.label}</Link>
              ))}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <ThemeToggle />
              <Button component={NextLink} href="/login" color="inherit" sx={{ display: { xs: "none", sm: "inline-flex" } }}>Sign in</Button>
              <Button component={NextLink} href="/register" variant="contained">Get started</Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Hero */}
      <Box sx={{ position: "relative", overflow: "hidden", background: "radial-gradient(60% 50% at 80% 0%, color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent), transparent), radial-gradient(40% 40% at 0% 30%, color-mix(in srgb, var(--mui-palette-tertiary-main) 12%, transparent), transparent)" }}>
        <Container maxWidth="lg" sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 8, md: 12 } }}>
          <Box sx={{ display: "grid", gap: { xs: 6, md: 8 }, alignItems: "center", gridTemplateColumns: { xs: "1fr", md: "1fr 1.15fr" } }}>
            <Reveal>
              <Typography variant="overline" color="primary" fontWeight={700}>For engineering colleges</Typography>
              <Typography variant="h1" component="h1" fontWeight={800} letterSpacing="-0.03em" sx={{ mt: 1, fontSize: { xs: "2.5rem", md: "3.5rem" }, lineHeight: 1.08 }}>
                Code. Learn. <Box component="span" sx={{ color: "primary.main" }}>Grow.</Box>
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ mt: 2.5, fontWeight: 400, maxWidth: 520 }}>
                An AI-assisted coding platform that teaches, assesses and tracks progress, with workspaces for students, faculty, HODs and admins.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 4 }}>
                <Button component={NextLink} href="/register" variant="contained" size="large" endIcon={<ArrowForwardIcon />}>Create your account</Button>
                <Button component={NextLink} href="/login" variant="outlined" size="large">Sign in</Button>
              </Stack>
            </Reveal>
            <Reveal delay={0.1}><EditorMock /></Reveal>
          </Box>
        </Container>
      </Box>

      {/* Features */}
      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <SectionHead id="features" eyebrow="Features" title="Everything a coding classroom needs" desc="From first practice problem to proctored exam, in one place." />
        <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" } }}>
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Box key={f.title} sx={{ p: 3, borderRadius: `${shape.large}px`, border: "1px solid var(--mui-palette-outlineVariant)", bgcolor: "surfaceContainerLow" }}>
                <Box aria-hidden sx={{ width: 44, height: 44, borderRadius: `${shape.medium}px`, display: "grid", placeItems: "center", bgcolor: "primaryContainer", color: "onPrimaryContainer", mb: 2 }}>
                  <Icon />
                </Box>
                <Typography variant="subtitle1" component="h3" fontWeight={600}>{f.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{f.desc}</Typography>
              </Box>
            );
          })}
        </Box>
      </Container>

      {/* Showcases */}
      <Box sx={{ bgcolor: "surfaceContainerLowest", py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <Showcase
            eyebrow="Learn" title="Practice with a tutor that asks, not tells"
            desc="Run code against test cases, read exactly what failed, and get nudged toward the idea instead of the solution."
            bullets={["Visible and hidden test cases", "Verdict and test-case feedback on every run", "AI tutor available beside the editor"]}
            visual={<TestCasesMock />}
          />
          <Showcase flip
            eyebrow="Assess" title="Exams you can trust"
            desc="Build multi-section exams mixing coding and MCQ questions, and see integrity signals alongside the scores."
            bullets={["Coding and MCQ in one exam", "Tab-switch and fullscreen monitoring", "Plagiarism similarity reports"]}
            visual={<ExamMock />}
          />
          <Box sx={{ mb: 0 }}>
            <Showcase
              eyebrow="Improve" title="See where your class is stuck"
              desc="Headline numbers first, then the topic that is dragging results down, then the students who need attention."
              bullets={["Class and student dashboards", "At-risk student flags with reasons", "Department-scoped views for HODs"]}
              visual={<AnalyticsMock />}
            />
          </Box>
        </Container>
      </Box>

      {/* Roles */}
      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <SectionHead id="roles" eyebrow="Built for every role" title="One platform, the right workspace for each person" />
        <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <Box key={r.title} sx={{ p: 3, borderRadius: `${shape.large}px`, border: "1px solid var(--mui-palette-outlineVariant)" }}>
                <Box aria-hidden sx={{ color: "primary.main", mb: 1.5 }}><Icon /></Box>
                <Typography variant="h6" component="h3" fontWeight={600}>{r.title}</Typography>
                <Stack component="ul" spacing={0.75} sx={{ pl: 2.25, m: 0, mt: 1.5 }}>
                  {r.points.map((p) => (
                    <Typography key={p} component="li" variant="body2" color="text.secondary">{p}</Typography>
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Container>

      {/* How it works */}
      <Box sx={{ bgcolor: "surfaceContainerLow", py: { xs: 8, md: 12 } }}>
        <Container maxWidth="lg">
          <SectionHead id="how" eyebrow="How it works" title="From sign-in to insight in three steps" />
          <Box sx={{ display: "grid", gap: 4, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
            {STEPS.map((s) => (
              <Stack key={s.n} spacing={1.5}>
                <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }}>{s.n}</Box>
                <Typography variant="subtitle1" component="h3" fontWeight={600}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary">{s.desc}</Typography>
              </Stack>
            ))}
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Container maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <Box sx={{ p: { xs: 4, md: 8 }, borderRadius: `${shape.extraLarge}px`, textAlign: "center", color: "primary.contrastText", background: "linear-gradient(135deg, var(--mui-palette-primary-main), var(--mui-palette-tertiary-main))" }}>
          <EmojiEventsOutlinedIcon fontSize="large" />
          <Typography variant="h3" component="h2" fontWeight={700} letterSpacing="-0.02em" sx={{ mt: 1 }}>Ready to start?</Typography>
          <Typography sx={{ mt: 1.5, opacity: 0.9 }}>Sign in with your college account and pick up where you left off.</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="center" sx={{ mt: 4 }}>
            <Button component={NextLink} href="/register" variant="contained" size="large" sx={{ bgcolor: "background.paper", color: "primary.main", "&:hover": { bgcolor: "background.paper", opacity: 0.92 } }}>Create your account</Button>
            <Button component={NextLink} href="/login" size="large" sx={{ color: "inherit", border: "1px solid rgba(255,255,255,0.5)" }}>Sign in</Button>
          </Stack>
        </Box>
      </Container>

      {/* Footer */}
      <Box component="footer" sx={{ borderTop: "1px solid var(--mui-palette-outlineVariant)", py: 4 }}>
        <Container maxWidth="lg">
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "center" }} spacing={2}>
            <Logo />
            <Stack direction="row" spacing={3}>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} underline="hover" color="text.secondary" variant="body2">{n.label}</Link>
              ))}
              <Link component={NextLink} href="/login" underline="hover" color="text.secondary" variant="body2">Sign in</Link>
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 3 }}>
            © {new Date().getFullYear()} CodeMentor. Built for engineering colleges.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
