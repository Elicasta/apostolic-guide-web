import { redirect } from "next/navigation";

export default function AdminCreativeLibraryPage() {
  redirect("/admin/creative-studio?view=library");
}
