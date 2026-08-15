import { allPathways, pathwayBySlug } from "./pathway-catalog";
import { commentGuideArgumentById } from "./comment-guide-argument-library";
import type { SocialAutomation } from "./social-messaging";

export const COMMENT_GUIDE_PROMPT_VERSION = "apostolic-comment-guide-v3";
export const COMMENT_GUIDE_MODEL = "gpt-5.6-sol";

export const COMMENT_GUIDE_INTENTS = [
  "keyword_request",
  "positive",
  "sincere_question",
  "doctrinal_objection",
  "gotcha_contention",
  "hostile_abuse",
  "pastoral_sensitive",
  "spam_off_topic",
  "ambiguous"
] as const;

export const COMMENT_GUIDE_ACTIONS = [
  "acknowledge",
  "answer_once",
  "redirect_once",
  "deliver_keyword",
  "ignore"
] as const;

export const COMMENT_GUIDE_CONTENTION_LEVELS = ["none", "skeptical", "gotcha", "abusive", "repetitive"] as const;

export type CommentGuideIntent = (typeof COMMENT_GUIDE_INTENTS)[number];
export type CommentGuideAction = (typeof COMMENT_GUIDE_ACTIONS)[number];
export type CommentGuideContentionLevel = (typeof COMMENT_GUIDE_CONTENTION_LEVELS)[number];
export type CommentGuideMode = "paused" | "shadow" | "live";

export type CommentGuideDecision = {
  intent: CommentGuideIntent;
  action: CommentGuideAction;
  confidence: number;
  contentionLevel: CommentGuideContentionLevel;
  automationId: string | null;
  matchedKeyword: string | null;
  pathwaySlug: string | null;
  publicReply: string | null;
  scriptureReferences: string[];
  argumentIds: string[];
  internalReason: string;
};

export type CommentGuideDoctrineReview = {
  approved: boolean;
  finalReply: string | null;
  scriptureReferences: string[];
  correctionReason: string | null;
};

export type ExplicitCommentAutomation = {
  automation: SocialAutomation;
  keyword: string;
};

export type PreparedCommentGuideDecision = CommentGuideDecision & {
  publicReply: string | null;
  privateReply: string | null;
  destinationUrl: string | null;
  doctrineReview: CommentGuideDoctrineReview | null;
  delaySeconds: number;
};

export const APOSTOLIC_DOCTRINE_LOCK = [
  "There is one indivisible God, the LORD, with no other God beside, before, after, or with Him.",
  "The Father is the eternal invisible Spirit. Jesus Christ is the full bodily revelation of that one God.",
  "The Son is the genuine human life conceived and born in time. The Father dwells and works in the Son.",
  "God's Word is His own eternal self-expression and action, not a second divine person. The Word became flesh in Jesus Christ.",
  "The Holy Ghost is the one God's own Spirit present and active, not another divine center of consciousness.",
  "Apostolic Guide does not teach three divine persons, a separate eternal Son-person, or God changing masks, roles, or modes.",
  "The gospel response joins grace and obedient faith: repentance, baptism in the name of Jesus Christ, and receiving the Holy Ghost.",
  "The repeated initial sign of receiving the Holy Ghost in Acts is speaking with tongues as the Spirit gives utterance.",
  "Every public answer must remain Scripture-first, humble, cordial, and non-combative. Never attack, mock, shame, or label Trinitarians or any other person."
] as const;

export const COMMENT_GUIDE_DECISION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: COMMENT_GUIDE_INTENTS },
    action: { type: "string", enum: COMMENT_GUIDE_ACTIONS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    contentionLevel: { type: "string", enum: COMMENT_GUIDE_CONTENTION_LEVELS },
    automationId: { anyOf: [{ type: "string" }, { type: "null" }] },
    matchedKeyword: { anyOf: [{ type: "string" }, { type: "null" }] },
    pathwaySlug: { anyOf: [{ type: "string" }, { type: "null" }] },
    publicReply: { anyOf: [{ type: "string" }, { type: "null" }] },
    scriptureReferences: { type: "array", maxItems: 8, items: { type: "string" } },
    argumentIds: { type: "array", maxItems: 6, items: { type: "string" } },
    internalReason: { type: "string", maxLength: 240 }
  },
  required: [
    "intent",
    "action",
    "confidence",
    "contentionLevel",
    "automationId",
    "matchedKeyword",
    "pathwaySlug",
    "publicReply",
    "scriptureReferences",
    "argumentIds",
    "internalReason"
  ]
} as const;

export const COMMENT_GUIDE_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    approved: { type: "boolean" },
    finalReply: { anyOf: [{ type: "string" }, { type: "null" }] },
    scriptureReferences: { type: "array", maxItems: 8, items: { type: "string" } },
    correctionReason: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] }
  },
  required: ["approved", "finalReply", "scriptureReferences", "correctionReason"]
} as const;

const REQUEST_FILLER_WORDS = new Set([
  "a", "an", "can", "could", "drop", "get", "give", "guide", "i", "id", "ill", "link", "may", "me",
  "my", "need", "please", "send", "show", "study", "the", "this", "to", "want", "would"
]);

const KEYWORD_BLOCKERS = new Set([
  "aint", "debate", "explain", "false", "heresy", "heretic", "how", "isnt", "modalism", "no", "not",
  "prove", "refute", "wrong", "what", "why"
]);

function words(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizedPhrase(value: string) {
  return words(value).join(" ");
}

export function findExplicitCommentAutomation(message: string, automations: SocialAutomation[]): ExplicitCommentAutomation | null {
  const messageWords = words(message);
  if (!messageWords.length || messageWords.length > 12 || messageWords.some((word) => KEYWORD_BLOCKERS.has(word))) return null;
  const withoutRequestWords = messageWords.filter((word) => !REQUEST_FILLER_WORDS.has(word)).join(" ");
  const wholeMessage = messageWords.join(" ");
  const candidates = automations
    .filter((automation) => automation.enabled && automation.trigger_type === "comment_keyword")
    .flatMap((automation) => automation.keywords.map((keyword) => ({ automation, keyword, normalized: normalizedPhrase(keyword) })))
    .filter((candidate) => candidate.normalized && (wholeMessage === candidate.normalized || withoutRequestWords === candidate.normalized))
    .sort((left, right) => right.normalized.length - left.normalized.length);
  return candidates[0] ? { automation: candidates[0].automation, keyword: candidates[0].keyword } : null;
}

export function pathwaySlugFromDestination(destinationUrl: string | null | undefined) {
  if (!destinationUrl?.trim()) return null;
  try {
    const slug = new URL(destinationUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
    return pathwayBySlug(slug)?.slug ?? null;
  } catch {
    return null;
  }
}

export function commentGuidePathwayDirectory() {
  return allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    scriptureReferences: pathway.steps.map((step) => step.reference)
  }));
}

export function commentGuidePathwayContext(slug: string) {
  const pathway = pathwayBySlug(slug);
  if (!pathway) return null;
  return {
    slug: pathway.slug,
    title: pathway.title,
    summary: pathway.summary,
    steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference, explanation: step.explanation }))
  };
}

export function pathwayDestination(slug: string) {
  return `https://apostolicguide.com/pathways/${slug}`;
}

export function buildPublicGuideAcknowledgement(title: string) {
  const cleanTitle = title.trim().replace(/\s+(?:guide|study)$/i, "").trim() || "study";
  return cleanTitle.toLocaleLowerCase() === "study"
    ? "Your guide is on the way. Check your DMs."
    : `Your ${cleanTitle} guide is on the way. Check your DMs.`;
}

function stableUnitInterval(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function commentGuideDelaySeconds(intent: CommentGuideIntent, seed: string) {
  const ranges: Record<CommentGuideIntent, readonly [number, number]> = {
    keyword_request: [20, 75],
    positive: [55, 300],
    sincere_question: [90, 240],
    doctrinal_objection: [120, 300],
    gotcha_contention: [180, 420],
    hostile_abuse: [0, 0],
    pastoral_sensitive: [0, 0],
    spam_off_topic: [0, 0],
    ambiguous: [0, 0]
  };
  const [minimum, maximum] = ranges[intent];
  return Math.round(minimum + stableUnitInterval(`${seed}:${intent}`) * (maximum - minimum));
}

function normalizeReference(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/-/g, "–").toLocaleLowerCase();
}

function extractScriptureReferences(text: string) {
  return text.match(/\b(?:[1-3]\s+)?[A-Za-z]+(?:\s+[A-Za-z]+)?\s+\d+:\d+(?:[–-]\d+)?\b/g) ?? [];
}

const COMBATIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:idiot|stupid|moron|demonic|heretic|liar)\b/i, "uses a hostile label"],
  [/\b(?:you people|educate yourself|read your bible|nice try|checkmate|cope)\b/i, "uses combative language"],
  [/\btrinitarians?\s+(?:are|believe because they)/i, "generalizes about Trinitarians"],
  [/(?:😂|🤣|\blol\b)/i, "risks sounding mocking"]
];

const OUT_OF_DOCTRINE_PATTERNS: Array<[RegExp, string]> = [
  [/\bgod\s+(?:is|exists as)\s+(?:one god in\s+)?three\s+(?:distinct\s+)?persons\b/i, "asserts three divine persons"],
  [/\bthree\s+(?:distinct\s+)?divine\s+(?:persons|centers)\b/i, "asserts three divine centers"],
  [/\beternal\s+son\s+(?:is|was|as)\s+(?:a\s+)?separate\b/i, "asserts a separate eternal Son-person"],
  [/\bgod\s+(?:changes|switches|wears)\s+(?:between\s+)?(?:masks|modes|roles)\b/i, "describes God as changing masks or modes"],
  [/\bjesus\s+(?:is|was)\s+(?:merely|only|just)\s+(?:a\s+)?man\b/i, "denies Christ's full deity"],
  [/\bjesus\s+(?:is|was)\s+(?:a\s+)?created\s+(?:being|person|god)?\b/i, "calls Jesus created"],
  [/\b(?:earn|merit|deserve)\s+(?:our\s+)?salvation\b/i, "treats salvation as human merit"]
];

export function validatePublicCommentReply(input: {
  reply: string;
  intent: CommentGuideIntent;
  pathwaySlug?: string | null;
  scriptureReferences?: string[];
  recentReplies?: string[];
}) {
  const reply = input.reply.trim();
  if (!reply) return "reply is empty";
  if (reply.length > 500) return "reply exceeds 500 characters";
  if (/https?:\/\/|www\./i.test(reply)) return "public replies may not contain model-created links";
  if (/#\w+/.test(reply)) return "public replies may not contain hashtags";
  for (const [pattern, reason] of COMBATIVE_PATTERNS) if (pattern.test(reply)) return reason;
  for (const [pattern, reason] of OUT_OF_DOCTRINE_PATTERNS) if (pattern.test(reply)) return reason;
  if (input.recentReplies?.some((recent) => normalizedPhrase(recent) === normalizedPhrase(reply))) return "duplicates a recent bot reply";

  if (input.pathwaySlug) {
    const pathway = pathwayBySlug(input.pathwaySlug);
    if (!pathway) return "selected pathway does not exist";
    const allowed = new Set(pathway.steps.map((step) => normalizeReference(step.reference)));
    for (const reference of input.scriptureReferences ?? []) {
      if (!allowed.has(normalizeReference(reference))) return `Scripture reference is outside the selected pathway: ${reference}`;
    }
    for (const reference of extractScriptureReferences(reply)) {
      if (!allowed.has(normalizeReference(reference))) return `reply cites Scripture outside the selected pathway: ${reference}`;
    }
  } else if ((input.scriptureReferences?.length ?? 0) > 0) {
    return "Scripture references require a selected pathway";
  }

  if (input.intent === "positive" && reply.length > 120) return "positive reply is too long";
  return null;
}

export function validateCommentGuideDecisionStructure(decision: CommentGuideDecision) {
  if (!decision || typeof decision !== "object") return "decision is not an object";
  if (!COMMENT_GUIDE_INTENTS.includes(decision.intent)) return "unknown intent";
  if (!COMMENT_GUIDE_ACTIONS.includes(decision.action)) return "unknown action";
  if (!COMMENT_GUIDE_CONTENTION_LEVELS.includes(decision.contentionLevel)) return "unknown contention level";
  if (!Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1) return "confidence must be between zero and one";
  if (decision.automationId !== null && typeof decision.automationId !== "string") return "automation ID must be a string or null";
  if (decision.matchedKeyword !== null && typeof decision.matchedKeyword !== "string") return "matched keyword must be a string or null";
  if (decision.pathwaySlug !== null && typeof decision.pathwaySlug !== "string") return "pathway slug must be a string or null";
  if (decision.publicReply !== null && typeof decision.publicReply !== "string") return "public reply must be a string or null";
  if (!Array.isArray(decision.scriptureReferences) || decision.scriptureReferences.some((reference) => typeof reference !== "string")) return "Scripture references must be strings";
  if (!Array.isArray(decision.argumentIds) || decision.argumentIds.length > 6 || decision.argumentIds.some((id) => typeof id !== "string" || !commentGuideArgumentById(id))) return "argument IDs must name up to six approved library entries";
  if (typeof decision.internalReason !== "string" || !decision.internalReason.trim()) return "internal reason is required";
  if (decision.pathwaySlug && !pathwayBySlug(decision.pathwaySlug)) return "selected pathway does not exist";
  if (["hostile_abuse", "pastoral_sensitive", "spam_off_topic", "ambiguous"].includes(decision.intent) && decision.action !== "ignore") return "unsafe or ambiguous comments must be ignored";
  if (decision.action === "ignore" && decision.publicReply) return "ignored comments cannot have a public reply";
  if (decision.action === "acknowledge" && decision.intent !== "positive") return "acknowledgements are reserved for positive comments";
  if (["answer_once", "redirect_once"].includes(decision.action) && !decision.pathwaySlug) return "doctrinal replies require a pathway";
  return null;
}

export function validateCommentGuideDecision(decision: CommentGuideDecision) {
  const structureError = validateCommentGuideDecisionStructure(decision);
  if (structureError) return structureError;
  if (decision.publicReply) {
    const replyError = validatePublicCommentReply({
      reply: decision.publicReply,
      intent: decision.intent,
      pathwaySlug: decision.pathwaySlug,
      scriptureReferences: decision.scriptureReferences
    });
    if (replyError) return replyError;
  }
  return null;
}

export function buildDoctrinalFallbackReply(intent: CommentGuideIntent, pathwayTitle: string) {
  const title = pathwayTitle.trim() || "Apostolic Guide";
  if (intent === "gotcha_contention") {
    return `We understand the concern. Apostolic teaching confesses the one indivisible God fully revealed in Jesus Christ. The ${title} guide lays out the Scriptures behind that belief.`;
  }
  if (intent === "doctrinal_objection") {
    return `Thank you for raising the concern. Our reading is that the one God has fully revealed Himself in Jesus Christ. The ${title} guide walks through the passages behind that conclusion.`;
  }
  return `That is a fair question. The ${title} guide walks through the passages that shape our Apostolic reading and gives the clearest next step.`;
}

export function validateCommentGuideDoctrineReview(review: CommentGuideDoctrineReview) {
  if (!review || typeof review !== "object") return "doctrine review is not an object";
  if (typeof review.approved !== "boolean") return "approved must be a boolean";
  if (review.finalReply !== null && typeof review.finalReply !== "string") return "final reply must be a string or null";
  if (!Array.isArray(review.scriptureReferences) || review.scriptureReferences.some((reference) => typeof reference !== "string")) return "review Scripture references must be strings";
  if (review.correctionReason !== null && typeof review.correctionReason !== "string") return "correction reason must be a string or null";
  if (review.approved && !review.finalReply?.trim()) return "approved review requires a final reply";
  if (!review.approved && review.finalReply !== null) return "rejected review cannot include a final reply";
  return null;
}
