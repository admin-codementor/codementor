import { redirect } from "next/navigation";

// There is no submission log any more: solved problems live on the Profile page,
// and unsolved attempts live in the Mistakes notebook. Old links land on the
// solved list.
export default function SubmissionsRedirect() {
  redirect("/app/profile?tab=submissions");
}
