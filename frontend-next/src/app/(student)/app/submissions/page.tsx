import { redirect } from "next/navigation";

// Submissions now live under the Profile page as a tab.
export default function SubmissionsRedirect() {
  redirect("/app/profile?tab=submissions");
}
