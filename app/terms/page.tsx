import type { Metadata } from "next";
import { PageHero } from "@/components";

export const metadata: Metadata = { title: "Terms", description: "Terms of use for Apostolic Guide." };

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Policy" title="Terms of use" text="Apostolic Guide is provided for biblical study, teaching, and personal research." />
      <section className="section">
        <div className="shell prose-content legal-copy">
          <section><h2>Educational use</h2><p>The website and app provide theological study material. They do not replace pastoral care, professional counseling, legal guidance, or medical advice.</p></section>
          <section><h2>Scripture and media rights</h2><p>Bible translations, embedded media, images, and third-party resources remain subject to their respective licenses and terms. Apostolic Guide commentary and original editorial material may not be republished commercially without permission.</p></section>
          <section><h2>Accuracy and corrections</h2><p>Content is reviewed carefully, but errors can occur. Documented corrections are welcomed and may result in updated pages or revision notes.</p></section>
          <section><h2>Service availability</h2><p>Features may change, move, or become temporarily unavailable. Private user data is handled according to the privacy policy.</p></section>
        </div>
      </section>
    </>
  );
}
