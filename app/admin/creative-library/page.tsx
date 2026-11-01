import { redirect } from "next/navigation";

export default function AdminCreativeLibraryPage() {
  redirect("/admin/carousel-studio?view=library");
}
