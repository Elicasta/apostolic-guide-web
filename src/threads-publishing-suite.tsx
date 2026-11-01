"use client";
import { MessageCircle } from "lucide-react";
import { ThreadsWeeklyPlanner } from "@/threads-weekly-planner";
import { ThreadsPrayerNews } from "@/threads-prayer-news";

export function ThreadsPublishingSuite(){
  return <section className="threads-publishing-suite admin-card">
    <header className="threads-suite-head"><div><span className="section-kicker">Threads production</span><h2>Weekly theology + prayer response</h2><p>Build batches, review every post, and approve the copy here. Approved Threads move to Master Publishing, where final posting and scheduling happen.</p></div><MessageCircle size={28}/></header>
    <div className="threads-suite-grid"><ThreadsWeeklyPlanner/><ThreadsPrayerNews/></div>
    <footer className="threads-suite-foot"><strong>Future channel mirror</strong><span>X can reuse approved Threads copy later. Threads Studio remains the writing and review layer; distribution stays in Master Publishing.</span></footer>
  </section>
}
