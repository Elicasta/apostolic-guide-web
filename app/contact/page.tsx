import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PageHero } from "@/components";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Apostolic Guide about teaching, content corrections, media, or the project."
};

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <>
      <PageHero eyebrow="Contact" title="Questions, corrections, and project inquiries." text="Apostolic Guide welcomes clear questions and documented corrections. Include the page or Scripture reference when writing about content." />
      <section className="section">
        <div className="shell two-column-callout">
          <div><span className="eyebrow">Best channel</span><h2>Email the project.</h2></div>
          <div>
            <p>Use email for theological questions, source corrections, media requests, and technical issues. Private pastoral matters should be directed to your local pastor or church leadership.</p>
            {email
              ? <a className="button button-crimson" href={`mailto:${email}`}><Mail size={17} /> {email}</a>
              : <div className="admin-notice">Add <code>NEXT_PUBLIC_CONTACT_EMAIL</code> in Vercel to publish the contact address.</div>}
          </div>
        </div>
      </section>
    </>
  );
}
