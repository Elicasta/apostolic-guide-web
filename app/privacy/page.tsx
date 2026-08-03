import type { Metadata } from "next";
import { PageHero } from "@/components";

export const metadata: Metadata = { title: "Privacy", description: "How Apostolic Guide handles website and application data." };

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Policy" title="Privacy" text="Apostolic Guide tracks product use to improve the library without collecting private study content." />
      <section className="section">
        <div className="shell prose-content legal-copy">
          <section><h2>What we measure</h2><p>We may measure page views, submitted searches, selected results, content completion, shares, and transitions into the Apostolic Guide app.</p></section>
          <section><h2>What we do not collect in analytics</h2><p>We do not collect private note bodies, custom pathway text, presentation speaker notes, authentication tokens, or text typed into a search field before submission.</p></section>
          <section><h2>Accounts</h2><p>Authentication is handled through Supabase. Account data is used only to provide access to private study features and authorized editorial tools.</p></section>
          <section><h2>Contact</h2><p>Questions about this policy can be sent through the official Apostolic Guide contact channel once published.</p></section>
        </div>
      </section>
    </>
  );
}
