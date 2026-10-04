import { redirect } from "next/navigation";

// Exams are a tab of the Tests hub now. Old links and bookmarks still work.
export default function ExamsRedirect() {
  redirect("/app/tests");
}
