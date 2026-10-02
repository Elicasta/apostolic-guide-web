export type PathwayReaderEvent = {
  event_name: string;
  session_id: string | null;
  occurred_at: string;
  page_path: string;
  referrer_host?: string | null;
  utm_source?: string | null;
  properties?: Record<string, unknown> | null;
};

export type PathwayReaderCatalogItem = {
  slug: string;
  title: string;
  steps: Array<{ title: string; reference: string }>;
};

export type PathwayReaderStep = {
  stepNumber: number;
  title: string;
  reference: string;
  reached: number;
  retentionFromPrevious: number;
  retentionFromOpen: number;
};

export type PathwayReaderFunnel = {
  slug: string;
  title: string;
  opens: number;
  began: number;
  completions: number;
  appTransitions: number;
  openToBeginRate: number;
  beginToCompleteRate: number;
  openToCompleteRate: number;
  largestDrop: {
    from: string;
    to: string;
    lost: number;
    retentionRate: number;
  };
  steps: PathwayReaderStep[];
};

function rate(part: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((part / total) * 100)));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function slugFromPath(path: string) {
  const clean = path.split("?")[0] ?? "";
  const match = clean.match(/^\/pathways\/([^/]+)/);
  return match?.[1] ?? null;
}

export function pathwaySlugFromEvent(event: PathwayReaderEvent) {
  const properties = event.properties ?? {};
  if (event.event_name === "app_link_clicked") {
    const origin = stringValue(properties.origin);
    if (origin?.startsWith("website-pathway-")) return origin.slice("website-pathway-".length);
  }

  return stringValue(properties.pathwaySlug)
    ?? stringValue(properties.contentKey)
    ?? slugFromPath(event.page_path);
}

function stepNumberFromEvent(event: PathwayReaderEvent) {
  const properties = event.properties ?? {};
  const direct = numericValue(properties.stepNumber);
  if (direct && direct > 0) return Math.floor(direct);
  const index = numericValue(properties.stepIndex);
  if (index !== null && index >= 0) return Math.floor(index) + 1;
  return 0;
}

function internalReferrer(host: string) {
  const value = host.toLowerCase();
  return value === "studio.apostolicguide.com"
    || value === "admin.apostolicguide.com"
    || value === "vercel.com"
    || value === "github.com"
    || value.endsWith(".elicastas-projects.vercel.app")
    || /^apostolic-guide.*\.vercel\.app$/.test(value);
}

export function publicReaderEvents(events: PathwayReaderEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const firstTouch = new Map<string, PathwayReaderEvent>();
  for (const event of sorted) {
    if (!event.session_id || firstTouch.has(event.session_id)) continue;
    firstTouch.set(event.session_id, event);
  }

  const internalSessions = new Set<string>();
  for (const [sessionId, event] of firstTouch) {
    const utmSource = stringValue(event.utm_source)?.toLowerCase() ?? null;
    const referrer = stringValue(event.referrer_host);
    if (!utmSource && referrer && internalReferrer(referrer)) internalSessions.add(sessionId);
  }

  return sorted.filter((event) => event.session_id && !internalSessions.has(event.session_id));
}

export function buildPathwayReaderFunnels(
  events: PathwayReaderEvent[],
  catalog: PathwayReaderCatalogItem[]
): PathwayReaderFunnel[] {
  const catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));
  const sessions = new Map<string, {
    slug: string;
    sessionId: string;
    opened: boolean;
    maxStep: number;
    completedReading: boolean;
    appTransition: boolean;
  }>();

  for (const event of publicReaderEvents(events)) {
    const slug = pathwaySlugFromEvent(event);
    if (!slug || !catalogBySlug.has(slug) || !event.session_id) continue;
    const key = `${slug}:${event.session_id}`;
    const current = sessions.get(key) ?? {
      slug,
      sessionId: event.session_id,
      opened: false,
      maxStep: 0,
      completedReading: false,
      appTransition: false
    };

    if (event.event_name === "pathway_started") current.opened = true;
    if (event.event_name === "pathway_step_completed") {
      current.maxStep = Math.max(current.maxStep, stepNumberFromEvent(event));
    }
    if (event.event_name === "pathway_completed") {
      const method = stringValue(event.properties?.completionMethod);
      if (method !== "audio") current.completedReading = true;
    }
    if (event.event_name === "app_link_clicked") current.appTransition = true;

    sessions.set(key, current);
  }

  const rows: PathwayReaderFunnel[] = [];
  for (const item of catalog) {
    const itemSessions = [...sessions.values()].filter((session) => session.slug === item.slug);
    if (!itemSessions.length) continue;

    for (const session of itemSessions) {
      if (session.maxStep > 0 || session.completedReading) session.opened = true;
      if (session.maxStep >= item.steps.length) session.completedReading = true;
    }

    const opens = itemSessions.filter((session) => session.opened).length;
    if (!opens) continue;
    const began = itemSessions.filter((session) => session.maxStep >= 1).length;
    const completions = itemSessions.filter((session) => session.completedReading).length;
    const appTransitions = itemSessions.filter((session) => session.appTransition).length;

    const steps: PathwayReaderStep[] = item.steps.map((step, index) => {
      const stepNumber = index + 1;
      const reached = itemSessions.filter((session) => session.maxStep >= stepNumber).length;
      const previousReached = stepNumber === 1
        ? opens
        : itemSessions.filter((session) => session.maxStep >= stepNumber - 1).length;
      return {
        stepNumber,
        title: step.title,
        reference: step.reference,
        reached,
        retentionFromPrevious: rate(reached, previousReached),
        retentionFromOpen: rate(reached, opens)
      };
    });

    const stages = [
      { label: "Opened", value: opens },
      ...steps.map((step) => ({ label: `Step ${step.stepNumber}`, value: step.reached }))
    ];
    let largestDrop = { from: "Opened", to: "Step 1", lost: 0, retentionRate: 100 };
    for (let index = 0; index < stages.length - 1; index += 1) {
      const from = stages[index];
      const to = stages[index + 1];
      const lost = Math.max(0, from.value - to.value);
      if (lost > largestDrop.lost) {
        largestDrop = {
          from: from.label,
          to: to.label,
          lost,
          retentionRate: rate(to.value, from.value)
        };
      }
    }

    rows.push({
      slug: item.slug,
      title: item.title,
      opens,
      began,
      completions,
      appTransitions,
      openToBeginRate: rate(began, opens),
      beginToCompleteRate: rate(completions, began),
      openToCompleteRate: rate(completions, opens),
      largestDrop,
      steps
    });
  }

  return rows.sort((a, b) =>
    b.began - a.began
    || b.opens - a.opens
    || b.largestDrop.lost - a.largestDrop.lost
    || a.title.localeCompare(b.title)
  );
}
