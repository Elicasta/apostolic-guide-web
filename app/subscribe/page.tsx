import type { Metadata } from "next";
import { PageHero } from "@/components";
import { SubscribeForm } from "./subscribe-form";
import styles from "./subscribe.module.css";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Receive new Apostolic Guide Scripture studies and invitations to live teachings."
};

export default function SubscribePage() {
  return (
    <>
      <PageHero
        eyebrow="Stay connected"
        title="Keep studying with Apostolic Guide."
        text="Choose the updates that help you continue in Scripture without filling your inbox with noise."
      />
      <section className="section">
        <div className={`shell ${styles.layout}`}>
          <div className={styles.intro}>
            <span className="eyebrow">What you will receive</span>
            <h2>Material worth opening.</h2>
            <p>We use email to announce new long-form studies and invite readers into live Bible teaching. The site remains open and free whether you subscribe or not.</p>
            <ul className={styles.points}>
              <li>New Scripture studies</li>
              <li>Live teaching invitations</li>
              <li>Important Apostolic Guide updates</li>
            </ul>
          </div>
          <SubscribeForm />
        </div>
      </section>
    </>
  );
}
