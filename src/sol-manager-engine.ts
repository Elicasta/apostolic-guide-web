export type SolManagerContentKind = "all" | "audio" | "video" | "youtube" | "carousel" | "automation";
export type SolAudioState = "ready" | "missing" | "stale" | "blocked";
export type SolVideoState = "published" | "staged" | "missing";
export type SolCarouselState = "published" | "staged" | "missing";
export type SolAutomationState = "linked" | "missing";

export type SolManagerCanonicalPathway = {
  slug: string;
  title: string;
  sourceHash: string;
};

export type SolManagerPathwayEvidence = {
  audioUrl: string | null;
  audioContentHash: string | null;
  scriptSourceHash: string | null;
  scriptHash: string | null;
  scriptStatus: string | null;
  checkerStatus: string | null;
  checkedScriptHash: string | null;
  videoProjectReady: boolean;
  youtubePublished: boolean;
  carouselAssets: number;
  carouselPublished: number;
  automationLinked: boolean;
};

export type SolManagerPathwayInventory = {
  slug: string;
  title: string;
  audio: {
    state: SolAudioState;
    hasAsset: boolean;
    scriptCurrent: boolean;
    scriptApproved: boolean;
    theologyPassed: boolean;
    audioMatchesScript: boolean;
  };
  video: { state: SolVideoState };
  youtube: { state: SolVideoState };
  carousel: { state: SolCarouselState; total: number; published: number };
  automation: { state: SolAutomationState };
};

export type SolManagerInventory = {
  pathways: SolManagerPathwayInventory[];
  totals: {
    pathways: number;
    audio: { desired: number; ready: number; missing: number; stale: number; blocked: number };
    video: { desired: number; published: number; staged: number; missing: number };
    youtube: { desired: number; published: number; staged: number; missing: number };
    carousel: { desired: number; published: number; staged: number; missing: number };
    automation: { desired: number; linked: number; missing: number };
  };
};

export function classifySolManagerPathway(
  pathway: SolManagerCanonicalPathway,
  evidence: SolManagerPathwayEvidence
): SolManagerPathwayInventory {
  const scriptCurrent = Boolean(evidence.scriptHash && evidence.scriptSourceHash === pathway.sourceHash);
  const scriptApproved = evidence.scriptStatus === "approved";
  const theologyPassed = Boolean(
    evidence.scriptHash
      && evidence.checkerStatus === "passed"
      && evidence.checkedScriptHash === evidence.scriptHash
  );
  const hasAsset = Boolean(evidence.audioUrl);
  const audioMatchesScript = Boolean(
    hasAsset
      && evidence.scriptHash
      && evidence.audioContentHash === evidence.scriptHash
  );

  let audioState: SolAudioState;
  if (hasAsset && scriptCurrent && scriptApproved && theologyPassed && audioMatchesScript) audioState = "ready";
  else if (hasAsset) audioState = "stale";
  else if (!scriptCurrent || !scriptApproved || !theologyPassed) audioState = "blocked";
  else audioState = "missing";

  const videoState: SolVideoState = evidence.youtubePublished
    ? "published"
    : evidence.videoProjectReady ? "staged" : "missing";
  const carouselState: SolCarouselState = evidence.carouselPublished > 0
    ? "published"
    : evidence.carouselAssets > 0 ? "staged" : "missing";

  return {
    slug: pathway.slug,
    title: pathway.title,
    audio: { state: audioState, hasAsset, scriptCurrent, scriptApproved, theologyPassed, audioMatchesScript },
    video: { state: videoState },
    youtube: { state: videoState },
    carousel: { state: carouselState, total: evidence.carouselAssets, published: evidence.carouselPublished },
    automation: { state: evidence.automationLinked ? "linked" : "missing" }
  };
}

function countState<T extends string>(items: Array<{ state: T }>, state: T) {
  return items.filter((item) => item.state === state).length;
}

export function buildSolManagerInventory(input: {
  pathways: SolManagerCanonicalPathway[];
  evidenceBySlug: Map<string, SolManagerPathwayEvidence>;
}): SolManagerInventory {
  const emptyEvidence: SolManagerPathwayEvidence = {
    audioUrl: null,
    audioContentHash: null,
    scriptSourceHash: null,
    scriptHash: null,
    scriptStatus: null,
    checkerStatus: null,
    checkedScriptHash: null,
    videoProjectReady: false,
    youtubePublished: false,
    carouselAssets: 0,
    carouselPublished: 0,
    automationLinked: false
  };
  const pathways = input.pathways.map((pathway) => classifySolManagerPathway(
    pathway,
    input.evidenceBySlug.get(pathway.slug) ?? emptyEvidence
  ));
  const audio = pathways.map((item) => item.audio);
  const video = pathways.map((item) => item.video);
  const youtube = pathways.map((item) => item.youtube);
  const carousel = pathways.map((item) => item.carousel);
  const automation = pathways.map((item) => item.automation);

  return {
    pathways,
    totals: {
      pathways: pathways.length,
      audio: {
        desired: pathways.length,
        ready: countState(audio, "ready"),
        missing: countState(audio, "missing"),
        stale: countState(audio, "stale"),
        blocked: countState(audio, "blocked")
      },
      video: {
        desired: pathways.length,
        published: countState(video, "published"),
        staged: countState(video, "staged"),
        missing: countState(video, "missing")
      },
      youtube: {
        desired: pathways.length,
        published: countState(youtube, "published"),
        staged: countState(youtube, "staged"),
        missing: countState(youtube, "missing")
      },
      carousel: {
        desired: pathways.length,
        published: countState(carousel, "published"),
        staged: countState(carousel, "staged"),
        missing: countState(carousel, "missing")
      },
      automation: {
        desired: pathways.length,
        linked: countState(automation, "linked"),
        missing: countState(automation, "missing")
      }
    }
  };
}

export function filterSolManagerInventory(
  inventory: SolManagerInventory,
  kind: SolManagerContentKind,
  pathwaySlug = ""
) {
  const rows = pathwaySlug
    ? inventory.pathways.filter((item) => item.slug === pathwaySlug)
    : inventory.pathways;
  if (kind === "all") return rows;
  return rows.map((item) => ({ slug: item.slug, title: item.title, [kind]: item[kind] }));
}
