export type SolAdminSurface = {
  key: string;
  label: string;
  section: string;
  pathname: string;
  entityId: string | null;
  capabilities: string[];
  quickPrompts: string[];
};

type SurfaceDefinition = Omit<SolAdminSurface, "pathname" | "entityId"> & {
  match: (pathname: string) => boolean;
};

const SURFACES: SurfaceDefinition[] = [
  {
    key: "sol",
    label: "Sol Operator",
    section: "Workspace",
    match: (pathname) => pathname === "/admin/sol" || pathname.startsWith("/admin/sol/"),
    capabilities: ["Review proposed work", "Inspect runs and blockers", "Tune operating mode and KPI targets"],
    quickPrompts: ["What needs my attention?", "What is blocked right now?", "Explain the three Sol modes"]
  },
  {
    key: "pathway-asset",
    label: "Pathway Asset Editor",
    section: "Publishing",
    match: (pathname) => pathname.startsWith("/admin/pathway-assets/"),
    capabilities: ["Understand this asset in the Pathway production flow", "Find related production gaps", "Route work through registered Sol recipes"],
    quickPrompts: ["Explain this screen", "What should happen next for this asset?", "Scan for related Pathway work"]
  },
  {
    key: "pathways",
    label: "Pathway Publishing",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/pathways" || pathname.startsWith("/admin/pathways/"),
    capabilities: ["Scan Pathway production coverage", "Find missing media and distribution work", "Prepare allowlisted production runs"],
    quickPrompts: ["What Pathway work is missing?", "What can Sol finish for me?", "Scan Pathway coverage"]
  },
  {
    key: "audio",
    label: "Pathway Audio",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/audio" || pathname.startsWith("/admin/audio/"),
    capabilities: ["Track approved audio readiness", "Check script and theology gates", "Hand ready audio into video production"],
    quickPrompts: ["Which audios are ready for video?", "What is blocked by theology checks?", "Scan the audio pipeline"]
  },
  {
    key: "video-studio",
    label: "Video Studio",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/video-studio" || pathname.startsWith("/admin/video-studio/"),
    capabilities: ["Track timed Pathway video production", "Surface render blockers", "Run approved audio-to-YouTube recipes"],
    quickPrompts: ["Which videos can be finished?", "What is blocking video production?", "Scan video work"]
  },
  {
    key: "video-producer",
    label: "Video Producer",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/video-producer" || pathname.startsWith("/admin/video-producer/"),
    capabilities: ["Reason about the current production stage", "Surface stalled production work", "Keep publishing behind review gates"],
    quickPrompts: ["What should I do next here?", "What is stalled?", "Find related production work"]
  },
  {
    key: "carousel-studio",
    label: "Carousel Studio",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/carousel-studio" || pathname.startsWith("/admin/carousel-studio/"),
    capabilities: ["Find Pathways missing carousel assets", "Generate canonical topic packs", "Keep doctrine checking in the production gate"],
    quickPrompts: ["Which Pathway needs carousels?", "Create a safe carousel plan", "Scan carousel coverage"]
  },
  {
    key: "assets",
    label: "Pathway Assets",
    section: "Publishing",
    match: (pathname) => pathname === "/admin/assets" || pathname.startsWith("/admin/assets/"),
    capabilities: ["Review media coverage", "Find missing Pathway assets", "Connect assets to registered production work"],
    quickPrompts: ["What assets are missing?", "What should be produced next?", "Scan Pathway assets"]
  },
  {
    key: "content-calendar",
    label: "Content Calendar",
    section: "Distribution",
    match: (pathname) => pathname === "/admin/content-calendar" || pathname.startsWith("/admin/content-calendar/"),
    capabilities: ["Compare output against weekly KPI targets", "Surface content gaps", "Connect production proposals to distribution needs"],
    quickPrompts: ["Are we on pace this week?", "What content gap matters most?", "Scan our content pace"]
  },
  {
    key: "social",
    label: "Social Automations",
    section: "Distribution",
    match: (pathname) => pathname === "/admin/social" || pathname.startsWith("/admin/social/"),
    capabilities: ["Find Pathways with missing keyword automation", "Create disabled automation drafts", "Keep activation and enrollment manual"],
    quickPrompts: ["Which automations are missing?", "What can Trusted mode draft safely?", "Scan automation coverage"]
  },
  {
    key: "comment-guide",
    label: "Comment Guide",
    section: "Distribution",
    match: (pathname) => pathname === "/admin/comment-guide" || pathname.startsWith("/admin/comment-guide/"),
    capabilities: ["Explain the current admin area", "Surface nearby operational work", "Keep comment actions outside Sol unless registered as a recipe"],
    quickPrompts: ["Explain this screen", "What needs attention in Studio?", "What can Sol actually do from here?"]
  },
  {
    key: "publish",
    label: "Channel Publishing",
    section: "Distribution",
    match: (pathname) => pathname === "/admin/publish" || pathname.startsWith("/admin/publish/"),
    capabilities: ["Inspect production readiness", "Surface work waiting for review", "Keep live publishing locked behind explicit controls"],
    quickPrompts: ["What is ready for review?", "What is still blocked?", "Scan publishing readiness"]
  },
  {
    key: "analytics",
    label: "Analytics",
    section: "Distribution",
    match: (pathname) => pathname === "/admin/analytics" || pathname.startsWith("/admin/analytics/"),
    capabilities: ["Compare Studio output against KPI targets", "Explain Sol's current production coverage", "Turn gaps into production proposals"],
    quickPrompts: ["Are we on pace?", "Where is the biggest production gap?", "What should we make next?"]
  },
  {
    key: "growth",
    label: "Growth Hub",
    section: "Workspace",
    match: (pathname) => pathname === "/admin/growth" || pathname.startsWith("/admin/growth/"),
    capabilities: ["Connect Pathway production to growth work", "Surface missing journeys and automations", "Keep external effects behind their own gates"],
    quickPrompts: ["What growth work is missing?", "Which Pathways need follow-up?", "Scan the workspace"]
  },
  {
    key: "people",
    label: "People",
    section: "Relationships",
    match: (pathname) => pathname === "/admin/people" || pathname.startsWith("/admin/people/"),
    capabilities: ["Explain where this area fits in Studio", "Surface operational work without exposing private data to the model", "Keep messaging and enrollment locked"],
    quickPrompts: ["Explain this screen", "What can Sol safely do here?", "What needs attention elsewhere?"]
  },
  {
    key: "inbox",
    label: "Inbox",
    section: "Relationships",
    match: (pathname) => pathname === "/admin/inbox" || pathname.startsWith("/admin/inbox/"),
    capabilities: ["Explain the inbox area", "Surface Studio work without sending messages", "Keep outbound communication outside Sol's current recipes"],
    quickPrompts: ["Explain this screen", "What can Sol safely do here?", "Scan the workspace"]
  },
  {
    key: "journeys",
    label: "Journeys",
    section: "Relationships",
    match: (pathname) => pathname === "/admin/journeys" || pathname.startsWith("/admin/journeys/"),
    capabilities: ["Find missing Pathway follow-up drafts", "Create draft journeys through an allowlisted recipe", "Keep enrollments locked"],
    quickPrompts: ["Which journeys are missing?", "What can Trusted mode draft?", "Scan journey coverage"]
  },
  {
    key: "health",
    label: "System Health",
    section: "System",
    match: (pathname) => pathname === "/admin/health" || pathname.startsWith("/admin/health/"),
    capabilities: ["Explain Sol's own readiness indicators", "Surface current run failures", "Avoid pretending to repair systems without an allowlisted tool"],
    quickPrompts: ["Is Sol healthy?", "What is failing right now?", "What can I fix from Studio?"]
  },
  {
    key: "overview",
    label: "Studio Overview",
    section: "Workspace",
    match: (pathname) => pathname === "/admin",
    capabilities: ["Scan the whole content workspace", "Prioritize the next useful work", "Track KPI pace and active runs"],
    quickPrompts: ["What needs my attention?", "What can you finish for me?", "Scan the workspace"]
  }
];

function normalizePathname(pathname: string) {
  const clean = pathname.trim().split("?")[0]?.split("#")[0] || "/admin";
  if (!clean.startsWith("/admin")) return "/admin";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
}

function entityFromPath(pathname: string, key: string) {
  if (key === "pathway-asset") return pathname.split("/")[3] || null;
  if (key === "pathways" && pathname.startsWith("/admin/pathways/")) return pathname.split("/")[3] || null;
  return null;
}

export function getSolAdminSurface(rawPathname: string): SolAdminSurface {
  const pathname = normalizePathname(rawPathname);
  const definition = SURFACES.find((surface) => surface.match(pathname));
  if (definition) {
    return {
      key: definition.key,
      label: definition.label,
      section: definition.section,
      pathname,
      entityId: entityFromPath(pathname, definition.key),
      capabilities: [...definition.capabilities],
      quickPrompts: [...definition.quickPrompts]
    };
  }
  return {
    key: "admin",
    label: "Studio Admin",
    section: "Workspace",
    pathname,
    entityId: null,
    capabilities: ["Understand your current Studio location", "Scan registered production state", "Operate only through allowlisted recipes and gates"],
    quickPrompts: ["Explain this screen", "What needs attention?", "Scan the workspace"]
  };
}
