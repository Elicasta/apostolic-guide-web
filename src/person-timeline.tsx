"use client";

import { AppWindow, BookOpen, ChevronDown, Eye, Instagram, Mail, MessageCircle, Route, Search, Sparkles, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

export type PersonTimelineEvent = {
  id: string;
  type: string;
  label: string;
  channel: string;
  at: string;
  detail?: string | null;
};

type Filter = "highlights" | "all" | "social" | "study" | "journeys" | "email" | "app";
type Category = Exclude<Filter, "highlights" | "all"> | "activity";

type TimelineGroup = {
  id: string;
  at: string;
  category: Category;
  events: PersonTimelineEvent[];
};

const SESSION_GAP_MS = 45 * 60 * 1000;
const INITIAL_GROUPS = 25;

function categoryFor(event: PersonTimelineEvent): Category {
  const type = event.type.toLowerCase();
  const channel = event.channel.toLowerCase();
  if (channel === "instagram" || type === "comment" || type === "message" || type.includes("automation_reply")) return "social";
  if (channel === "email" || type.includes("email") || type.includes("subscriber")) return "email";
  if (channel === "journey" || type.includes("journey")) return "journeys";
  if (type.includes("app") || type.includes("install")) return "app";
  if (["article_opened","article_completed","pathway_started","pathway_step_completed","scripture_opened","topic_opened","answer_opened","search_submitted","search_result_opened","search_no_results","content_shared"].includes(type)) return "study";
  return "activity";
}

function isNoise(event: PersonTimelineEvent) {
  return ["page_viewed", "search_result_opened"].includes(event.type);
}

function groupEvents(events: PersonTimelineEvent[]) {
  const sorted = [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const groups: TimelineGroup[] = [];

  for (const event of sorted) {
    const eventTime = new Date(event.at).getTime();
    const previous = groups.at(-1);
    if (previous) {
      const previousTime = new Date(previous.events.at(-1)?.at ?? previous.at).getTime();
      const sameDay = new Date(event.at).toDateString() === new Date(previous.at).toDateString();
      if (sameDay && Math.abs(previousTime - eventTime) <= SESSION_GAP_MS) {
        previous.events.push(event);
        const counts = previous.events.reduce<Record<string, number>>((acc, item) => {
          const category = categoryFor(item);
          acc[category] = (acc[category] ?? 0) + 1;
          return acc;
        }, {});
        previous.category = Object.entries(counts).sort((a,b) => b[1] - a[1])[0]?.[0] as Category ?? previous.category;
        continue;
      }
    }
    groups.push({ id: event.id, at: event.at, category: categoryFor(event), events: [event] });
  }

  return groups;
}

function iconFor(type: string) {
  const value = type.toLowerCase();
  if (value === "comment") return <MessageCircle size={16}/>;
  if (value === "message" || value.includes("automation_reply")) return <Instagram size={16}/>;
  if (value.includes("email") || value.includes("subscriber")) return <Mail size={16}/>;
  if (value.includes("journey")) return <Route size={16}/>;
  if (value.includes("search")) return <Search size={16}/>;
  if (value.includes("article") || value.includes("pathway") || value.includes("scripture") || value.includes("topic") || value.includes("answer")) return <BookOpen size={16}/>;
  if (value.includes("app") || value.includes("install")) return <AppWindow size={16}/>;
  if (value.includes("page")) return <Eye size={16}/>;
  return <UserRound size={16}/>;
}

function groupIcon(category: Category) {
  if (category === "social") return <Instagram size={17}/>;
  if (category === "study") return <BookOpen size={17}/>;
  if (category === "journeys") return <Route size={17}/>;
  if (category === "email") return <Mail size={17}/>;
  if (category === "app") return <AppWindow size={17}/>;
  return <Sparkles size={17}/>;
}

function groupTitle(group: TimelineGroup) {
  const significant = group.events.filter((event) => !isNoise(event));
  if (significant.length === 1 && group.events.length === 1) return significant[0].label;
  if (group.category === "social") return "Instagram interaction";
  if (group.category === "study") {
    const completed = group.events.find((event) => event.type === "article_completed" || event.type === "pathway_step_completed");
    return completed ? "Study session" : "Website study activity";
  }
  if (group.category === "journeys") return "Journey activity";
  if (group.category === "email") return "Email activity";
  if (group.category === "app") return "App activity";
  return "Website activity";
}

function groupSummary(group: TimelineGroup) {
  const labels = group.events.filter((event) => !isNoise(event)).map((event) => event.label);
  const unique = [...new Set(labels)];
  if (unique.length === 0) return `${group.events.length} page ${group.events.length === 1 ? "view" : "views"}`;
  if (unique.length <= 2) return unique.join(" · ");
  return `${unique.slice(0, 2).join(" · ")} · +${unique.length - 2} more`;
}

function dateHeading(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function PersonTimeline({ events }: { events: PersonTimelineEvent[] }) {
  const [filter, setFilter] = useState<Filter>("highlights");
  const [visible, setVisible] = useState(INITIAL_GROUPS);
  const groups = useMemo(() => groupEvents(events), [events]);
  const filtered = useMemo(() => groups.filter((group) => {
    if (filter === "all") return true;
    if (filter === "highlights") return group.events.some((event) => !isNoise(event));
    return group.events.some((event) => categoryFor(event) === filter);
  }), [filter, groups]);
  const shown = filtered.slice(0, visible);

  if (!events.length) return <div className="empty-state"><UserRound size={24}/><strong>No timeline events yet.</strong><p>New interactions will append to this person automatically.</p></div>;

  let lastDate = "";
  return <div className="timeline-shell">
    <div className="timeline-toolbar" role="group" aria-label="Timeline filters">
      {([
        ["highlights", "Highlights"], ["all", "All activity"], ["social", "Social"], ["study", "Study"], ["journeys", "Journeys"], ["email", "Email"], ["app", "App"]
      ] as Array<[Filter,string]>).map(([value,label]) => <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => { setFilter(value); setVisible(INITIAL_GROUPS); }}>{label}</button>)}
    </div>

    <div className="timeline-group-list">
      {shown.map((group) => {
        const heading = dateHeading(group.at);
        const renderHeading = heading !== lastDate;
        lastDate = heading;
        const expandable = group.events.length > 1;
        return <div key={group.id}>
          {renderHeading ? <div className="timeline-date-heading">{heading}</div> : null}
          <details className="timeline-group" open={false}>
            <summary>
              <div className="timeline-group-icon">{groupIcon(group.category)}</div>
              <div className="timeline-group-copy">
                <strong>{groupTitle(group)}</strong>
                <span>{new Date(group.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {group.events.length} {group.events.length === 1 ? "activity" : "activities"}</span>
                <small>{groupSummary(group)}</small>
              </div>
              {expandable ? <ChevronDown className="timeline-group-chevron" size={18}/> : null}
            </summary>
            {expandable ? <div className="timeline-group-events">{group.events.map((event) => <div className="timeline-event-row" key={event.id}>
              <div className="timeline-event-icon">{iconFor(event.type)}</div>
              <div><strong>{event.label}</strong><span>{event.channel} · {new Date(event.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>{event.detail ? <small>{event.detail}</small> : null}</div>
            </div>)}</div> : null}
          </details>
        </div>;
      })}
    </div>

    {filtered.length > visible ? <button className="timeline-load-more" type="button" onClick={() => setVisible((count) => count + INITIAL_GROUPS)}>Load earlier activity <span>{filtered.length - visible} remaining</span></button> : null}
  </div>;
}
