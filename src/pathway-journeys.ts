/** Privacy-safe aggregates for the new card-reader experience.
 * No raw session identifiers or search queries leave this module.
 */
export type JourneyEvent = {
  event_name: string;
  session_id: string | null;
  occurred_at: string;
  page_path: string;
  referrer_host?: string | null;
  utm_source?: string | null;
  properties?: Record<string, unknown> | null;
};
export type JourneyRow = {
  slug: string;
  landings: number;
  opens: number;
  readers: number;
  completed: number;
  arrows: number;
  swipes: number;
  lastObserved: Array<{ step: number; sessions: number }>;
};
export type JourneySnapshot = {
  landingPages: Array<{ path: string; sessions: number; google: number }>;
  pathwayRows: JourneyRow[];
  navigation: Array<{ method: string; actions: number; sessions: number }>;
  entryClicks: Array<{ placement: string; actions: number }>;
  totals: { landingSessions: number; pathwayLandings: number; pathwayReaders: number; navigationActions: number };
  periodDays: number;
  navigationTrackingSince: string;
};
const methods = new Set(["arrow", "keyboard", "swipe", "step_list"]);
function pathway(path: string) {
  const m = path.split(/[?#]/)[0]?.match(/^\/pathways\/([a-z0-9-]+)\/?$/i);
  return m?.[1] ?? null;
}
function cleanPath(path: string) {
  const clean = path.split(/[?#]/)[0] || "/";
  return clean.startsWith("/") ? clean : "/";
}
function internal(host: string | null | undefined) {
  const h = (host || "").toLowerCase();
  return ["studio.apostolicguide.com", "admin.apostolicguide.com", "github.com", "vercel.com"].includes(h)
    || h.endsWith(".elicastas-projects.vercel.app")
    || /^apostolic-guide.*\.vercel\.app$/.test(h);
}
function slugFor(event: JourneyEvent) {
  const p = event.properties ?? {};
  return typeof p.pathwaySlug === "string" && /^[a-z0-9-]+$/.test(p.pathwaySlug)
    ? p.pathwaySlug : pathway(event.page_path);
}
function stepNumber(event: JourneyEvent) {
  const p = event.properties ?? {};
  const v = Number(p.stepNumber ?? (Number.isFinite(Number(p.stepIndex)) ? Number(p.stepIndex) + 1 : 0));
  return Number.isInteger(v) && v > 0 && v <= 100 ? v : 0;
}
export function buildPathwayJourneys(events: JourneyEvent[], periodDays = 30): JourneySnapshot {
  const sorted = [...events].filter(e => e.session_id).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at));
  const sessions = new Map<string, JourneyEvent[]>();
  for (const event of sorted) {
    const id = event.session_id!;
    const list = sessions.get(id) ?? [];
    list.push(event);
    sessions.set(id, list);
  }
  const pages = new Map<string,{sessions:number;google:number}>();
  const journeys = new Map<string,{landings:Set<string>;opens:Set<string>;readers:Set<string>;completed:Set<string>;arrows:number;swipes:number;last:Map<string,number>}>();
  const navigation = new Map<string,{actions:number;sessions:Set<string>}>();
  const entries = new Map<string,number>();
  let landingSessions = 0;
  let pathwayLandings = 0;
  const readerSessionIds = new Set<string>();
  let actions = 0;
  for (const [sessionId,list] of sessions) {
    const first = list[0];
    if (!first.utm_source && internal(first.referrer_host)) continue;
    const landing = list.find(e=>e.event_name === "page_viewed");
    if (landing) {
      const path = cleanPath(landing.page_path);
      const row = pages.get(path) ?? {sessions:0,google:0};
      row.sessions += 1;
      if (/^(www\.)?google\./i.test(landing.referrer_host || "")) row.google += 1;
      pages.set(path,row);
      landingSessions += 1;
      if(pathway(path)) pathwayLandings += 1;
    }
    for (const e of list) {
      const p = e.properties ?? {};
      if (e.event_name === "pathway_entry_clicked") {
        const placement = typeof p.placement === "string" && /^[a-z0-9-]{1,60}$/.test(p.placement) ? p.placement : "other";
        entries.set(placement,(entries.get(placement) ?? 0)+1);
      }
      const slug = slugFor(e);
      if (!slug) continue;
      const row = journeys.get(slug) ?? {landings:new Set<string>(),opens:new Set<string>(),readers:new Set<string>(),completed:new Set<string>(),arrows:0,swipes:0,last:new Map<string,number>()};
      if (landing && pathway(landing.page_path) === slug) row.landings.add(sessionId);
      if (e.event_name === "pathway_started") row.opens.add(sessionId);
      if (e.event_name === "pathway_step_viewed" || e.event_name === "pathway_step_completed") {
        const step = stepNumber(e);
        if (step) {
          row.readers.add(sessionId);
          readerSessionIds.add(sessionId);
          row.last.set(sessionId,Math.max(row.last.get(sessionId) ?? 0,step));
        }
      }
      if (e.event_name === "pathway_completed" && p.completionMethod !== "audio") row.completed.add(sessionId);
      if (e.event_name === "pathway_step_navigated" && typeof p.method === "string" && methods.has(p.method)) {
        const entry = navigation.get(p.method) ?? { actions: 0, sessions: new Set<string>() };
        entry.actions += 1;
        entry.sessions.add(sessionId);
        navigation.set(p.method,entry);
        actions += 1;
        if (p.method === "arrow") row.arrows += 1;
        if (p.method === "swipe") row.swipes += 1;
      }
      journeys.set(slug,row);
    }
  }
  return {
    landingPages:[...pages.entries()].map(([path,r])=>({path,...r})).sort((a,b)=>b.sessions-a.sessions||a.path.localeCompare(b.path)).slice(0,12),
    pathwayRows:[...journeys.entries()].map(([slug,r])=>{
      const last = new Map<number,number>();
      for(const [id,step] of r.last) if (!r.completed.has(id)) last.set(step,(last.get(step) ?? 0)+1);
      return {slug,landings:r.landings.size,opens:r.opens.size,readers:r.readers.size,completed:r.completed.size,arrows:r.arrows,swipes:r.swipes,lastObserved:[...last.entries()].map(([step,sessions])=>({step,sessions})).sort((a,b)=>b.sessions-a.sessions||a.step-b.step).slice(0,3)};
    }).filter(r=>r.opens||r.readers||r.landings).sort((a,b)=>b.opens-a.opens||b.landings-a.landings).slice(0,15),
    navigation:[...navigation.entries()].map(([method,v])=>({method,actions:v.actions,sessions:v.sessions.size})).sort((a,b)=>b.actions-a.actions),
    entryClicks:[...entries.entries()].map(([placement,actions])=>({placement,actions})).sort((a,b)=>b.actions-a.actions),
    totals:{landingSessions,pathwayLandings,pathwayReaders:readerSessionIds.size,navigationActions:actions},
    periodDays,
    navigationTrackingSince:"2026-10-21"
  };
}
