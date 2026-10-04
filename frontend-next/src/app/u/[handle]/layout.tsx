import type { Metadata } from "next";

/**
 * Public profiles are shareable, not searchable.
 *
 * A student publishes this link to send to a recruiter, not to appear in search
 * results for their own name — so the page asks crawlers to stay away. The API
 * sends `X-Robots-Tag: noindex, nofollow` as well: a crawler that reads the
 * data endpoint directly never sees this meta tag.
 */
export const metadata: Metadata = {
  title: "Profile · CodeMentor",
  robots: { index: false, follow: false },
};

export default function PublicProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
