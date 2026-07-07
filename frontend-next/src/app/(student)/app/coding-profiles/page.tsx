import { redirect } from "next/navigation";

// Coding profiles now live under the Profile page as a tab.
export default function CodingProfilesRedirect() {
  redirect("/app/profile?tab=coding-profiles");
}
