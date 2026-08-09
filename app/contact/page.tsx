import type { Metadata } from "next";
import { BookOpen, Mail, MessageSquareText } from "lucide-react";
import { PageHero } from "@/components";
import { ContactForm } from "@/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send Apostolic Guide a biblical question, correction, media inquiry, or project message."
};

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@apostolicguide.com";

  return (
    <>
      <PageHero
        eyebrow="Contact the project"
        title="Questions, corrections, and project inquiries."
        text="Apostolic Guide welcomes clear questions and documented corrections. Tell us what you are asking, where you are writing from, and include the page or Scripture reference when it helps."
      />

      <section className="section contact-intake-section">
        <div className="shell contact-intake-layout">
          <div className="contact-intake-main">
            <header className="contact-intake-heading">
              <span className="eyebrow">Send a question</span>
              <h2>Contact the project.</h2>
              <p>Use this form for theological questions, Scripture questions, doctrine objections, source corrections, media requests, or technical issues. Clear questions help us respond clearly.</p>
            </header>
            <ContactForm />
          </div>

          <aside className="contact-intake-aside" aria-label="Contact guidance">
            <div className="contact-guidance-card contact-guidance-card-dark">
              <MessageSquareText size={22} />
              <h3>Questions may become studies.</h3>
              <p>Good questions help us see what needs a clearer biblical answer. Your submission may inform a future article, answer, or Scripture pathway.</p>
            </div>

            <div className="contact-guidance-card">
              <BookOpen size={22} />
              <h3>Give us the text.</h3>
              <p>For theological questions or corrections, include the Scripture reference, article, or page whenever possible so we can examine the same material.</p>
            </div>

            <div className="contact-guidance-card">
              <Mail size={22} />
              <h3>Prefer regular email?</h3>
              <p>The structured form is best for questions, but the project inbox remains available for direct correspondence.</p>
              <a href={`mailto:${email}`}><Mail size={14} /> {email}</a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
