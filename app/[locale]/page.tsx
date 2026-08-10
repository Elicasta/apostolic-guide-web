import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, localeMeta } from "@/i18n/config";

export default async function LocaleHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) notFound();

  // Preserve the current English production experience exactly as-is.
  if (locale === "en") redirect("/");

  const dictionary = getDictionary(locale);
  const meta = localeMeta[locale];

  return (
    <main style={{ minHeight: "100vh", padding: "clamp(2rem, 6vw, 5rem)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <p style={{ letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.65 }}>
          Apostolic Guide
        </p>
        <h1 style={{ fontSize: "clamp(2.5rem, 8vw, 5rem)", margin: "0.5rem 0 1rem" }}>
          {meta.brandName}
        </h1>
        <p style={{ fontSize: "1.15rem", lineHeight: 1.7, maxWidth: 620 }}>
          La base en español ya está preparada. Las Rutas Bíblicas y el contenido editorial
          se publicarán aquí únicamente después de su revisión y aprobación.
        </p>
        <p style={{ marginTop: "2rem" }}>
          <Link href="/">{dictionary.errors.returnHome}</Link>
        </p>
      </div>
    </main>
  );
}
