"use client";

import { CalendarRange, MessageCircle, Newspaper } from "lucide-react";
import { useState } from "react";
import { ThreadsPrayerNews } from "@/threads-prayer-news";
import { ThreadsSingleComposer } from "@/threads-single-composer";
import { ThreadsWeeklyPlanner } from "@/threads-weekly-planner";

type Mode = "single" | "weekly" | "prayer";

const modes: Array<{ id: Mode; label: string; detail: string; icon: typeof MessageCircle }> = [
  { id: "single", label: "Single", detail: "Write one Thread", icon: MessageCircle },
  { id: "weekly", label: "Weekly", detail: "Build a reviewed batch", icon: CalendarRange },
  { id: "prayer", label: "Prayer + News", detail: "Source-reviewed response", icon: Newspaper }
];

export function ThreadsStudioWorkspace() {
  const [mode, setMode] = useState<Mode>("single");

  return <section className="threads-workspace">
    <div className="threads-workspace-tabs" role="tablist" aria-label="Threads Studio mode">
      {modes.map((item) => {
        const Icon = item.icon;
        const active = mode === item.id;
        return <button key={item.id} type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={() => setMode(item.id)}>
          <Icon size={16}/>
          <span><strong>{item.label}</strong><small>{item.detail}</small></span>
        </button>;
      })}
    </div>

    <div className="threads-workspace-stage">
      {mode === "single" ? <ThreadsSingleComposer/> : null}
      {mode === "weekly" ? <ThreadsWeeklyPlanner/> : null}
      {mode === "prayer" ? <ThreadsPrayerNews/> : null}
    </div>
  </section>;
}
