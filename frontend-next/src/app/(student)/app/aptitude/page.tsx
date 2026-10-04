import { redirect } from "next/navigation";

// Aptitude is a tab of the Tests hub now. Old links and bookmarks still work.
export default function AptitudeRedirect() {
  redirect("/app/tests?tab=aptitude");
}
