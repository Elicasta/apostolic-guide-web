"use client";
import { MessageCircle } from "lucide-react";
import { ThreadsWeeklyPlanner } from "@/threads-weekly-planner";
import { ThreadsPrayerNews } from "@/threads-prayer-news";

export function ThreadsPublishingSuite(){
  return <section className="threads-publishing-suite admin-card">
    <header className="threads-suite-head"><div><span className="section-kicker">Threads publishing</span><h2>Weekly theology + prayer response</h2><p>Plan serious-but-witty Oneness posts in batches, run theology review, approve the week, and place it on the shared content calendar. Humanitarian prayer drafts stay source-reviewed and separate from theology automation.</p></div><MessageCircle size={28}/></header>
    <div className="threads-suite-grid"><ThreadsWeeklyPlanner/><ThreadsPrayerNews/></div>
    <footer className="threads-suite-foot"><strong>Future channel mirror</strong><span>X can reuse approved Threads copy later, but no automatic X publishing is enabled in this build.</span></footer>
  </section>
}
