import { ekegusiiSeedDrafts } from "./ekegusii-seed-drafts";
import { displayEkegusiiBibleReference, ekegusiiBibleReference } from "./ekegusii-bible-references";
import type { EkegusiiDraft, EkegusiiDrafts } from "./ekegusii-edition";

/**
 * Bible-grounded editorial terminology, compiled from Ebibilia Enchenu
 * (Bible Society of Kenya, 2021). These are short terminology examples
 * and do not reproduce Bible passages or authorize bulk redistribution.
 * The reference column supports a native translator's verification.
 */
export const ekegusiiBibleGlossary = [
  { english: "God", ekegusii: "Nyasae", reference: "Deuteronomy 6:4" },
  { english: "LORD", ekegusii: "Omonene", reference: "Deuteronomy 6:4" },
  { english: "Jesus", ekegusii: "Yeso", reference: "John 1:17" },
  { english: "Word", ekegusii: "Ring’ana", reference: "John 1:1" },
  { english: "Holy Spirit", ekegusii: "Omoika Omochenu", reference: "John 1:33" },
  { english: "Father", ekegusii: "Tata", reference: "John 1:18" },
  { english: "Son", ekegusii: "Omwana", reference: "John 1:14" },
  { english: "baptism", ekegusii: "okobatiswa", reference: "Luke 3:21" },
  { english: "born again", ekegusii: "koiborwa eria kabere", reference: "John 3:3" },
  { english: "water", ekegusii: "amaache", reference: "John 3:5" },
  { english: "kingdom of God", ekegusii: "oborwoti bwa Nyasae", reference: "John 3:5" },
  { english: "faith / believe", ekegusii: "okwegena", reference: "John 1:12" },
  { english: "grace", ekegusii: "obuya", reference: "John 1:17" },
  { english: "sin / sins", ekegusii: "ebibe", reference: "John 1:29" },
  { english: "resurrection", ekegusii: "okobokigwa", reference: "John 20:9" },
] as const;

type Excerpt = { text: string; source: string; context: string };
/**
 * Two short, clearly attributed passages are available for initial review.
 * Deuteronomy 6:4 was supplied directly by the reviewer, and Mark 12:29
 * was compared with the Bible Society of Kenya's hosted Ekegusii edition.
 * DO NOT expand these into a full copied Bible without a reuse license.
 */
const verifiedExcerpts: Readonly<Record<string, Excerpt>> = {
  "Deuteronomy 6:4": {
    text: "Inwe Abaisraeli, tegerera moigwe! Omonene Nyasae oito, nere bweka Omonene.",
    source: "Ekegusii Revised Bible (Ebibilia Enchenu), © 2021 Bible Society of Kenya",
    context: "Exact wording supplied by a reader from the Ekegusii Bible. Check punctuation and typography against the linked edition.",
  },
  "Mark 12:29": {
    text: "Igwa, Abaisraeli, Omonene oito, Nyasae, Nere Omonene oyomo",
    source: "Ekegusii Revised Bible (Ebibilia Enchenu), © 2021 Bible Society of Kenya",
    context: "Jesus' quotation of the Shema; this text is distinct from the wording in Deuteronomy 6:4.",
  },
  "Acts 4:12": {
    text: "Ogotoreka nigo gokonyorekana ase are ere bweka",
    source: "Ekegusii Revised Bible (Ebibilia Enchenu), © 2021 Bible Society of Kenya",
    context: "Short excerpt from the Bible Society of Kenya 2021 EKGE edition, as displayed by YouVersion. The reader must consult the complete verse for its full meaning.",
  },
};
export function verifiedEkegusiiExcerpt(reference: string): Excerpt | null {
  return verifiedExcerpts[reference] ?? null;
}

/**
 * A limited edit set based on a textual check of the cited Bible,
 * not a claim that the rest of the AI translation is native-approved.
 */
const revisedTitles: Readonly<Record<string, string>> = {
  "god-is-one": "Nyasae Noyomo",
  "word-became-flesh": "Ring’ana Rigakoreka Koba Omobere",
  "name-of-jesus": "Erieta ria Yeso",
  "matthew-28-and-acts-2": "Matayo 28:19 na Ogokora Kw’abatomwa 2:38",
  "baptism-in-jesus-name": "Okobatiswa ase Erieta ria Yeso Kristo",
  "new-birth": "Koiborwa Eria Kabere",
  "receiving-the-holy-ghost": "Okonyora Omoika Omochenu",
};

/** Replace only an unmistakably canonical English book+chapter citation, not prose. */
export function localizeReferenceMentions(text: string): string {
  return text.replace(/\b(?:[12]\s+)?[A-Za-z]+\s+\d{1,3}:\d{1,3}(?:[–—-]\d{1,3})?/g, (match) =>
    displayEkegusiiBibleReference(match)
  );
}

export function revisedEkegusiiSeed(slug: string): EkegusiiDraft {
  const base = ekegusiiSeedDrafts[slug];
  if (!base) return {};
  const result: EkegusiiDraft = {
    title: revisedTitles[slug] ?? localizeReferenceMentions(base.title),
    summary: localizeReferenceMentions(base.summary),
    steps: {},
  };
  for (const [index, step] of Object.entries(base.steps)) {
    let explanation = localizeReferenceMentions(step.explanation);
    if (slug === "god-is-one" && index === "0") {
      // The original draft invented a supposed verbatim Scripture quotation.
      // Display the Bible's actual text in a separate, attributed quotation panel.
      explanation = explanation.replace(
        "TENDEKENI, ABAISRAELI: NYASAE WABO AGA NYASAEE OMOKA.",
        "Okoiranerera 6:4 nigo egotworekereria buna Nyasae oito nere bweka Omonene."
      );
    }
    if (slug === "god-is-one" && index === "3") {
      explanation = explanation.replace(
        '"Tendekeni, Abaisraeli; Nyasae wabo noga Nyasae omoka."',
        "buna eriigete ase Mariko 12:29."
      );
    }
    // Terminology changes backed by the published Ekegusii Bible.
    explanation = explanation.replace(/\bHoly Ghost\b/g, "Omoika Omochenu")
      .replace(/\bHoly Spirit\b/g, "Omoika Omochenu")
      .replace(/\bOmoyagoro\b/g, "Omoika Omochenu");
    result.steps![index] = {
      title: localizeReferenceMentions(step.title)
        .replace(/\bHoly Ghost\b/g, "Omoika Omochenu")
        .replace(/\bOmoyagoro\b/g, "Omoika Omochenu"),
      explanation,
      hook: localizeReferenceMentions(step.hook)
        .replace(/\bHoly Ghost\b/g, "Omoika Omochenu")
        .replace(/\bHoly Spirit\b/g, "Omoika Omochenu")
        .replace(/\bOmoyagoro\b/g, "Omoika Omochenu"),
    };
  }
  return result;
}

export function reviewWarnings(slug: string, index: number): string[] {
  // Human review queue, not automatic theological certification.
  const step = ekegusiiSeedDrafts[slug]?.steps?.[String(index)];
  if (!step) return [];
  const flags: string[] = [];
  const explanation = step.explanation;
  if (/\b(?:Holy Ghost|Holy Spirit|New Testament|English|badge|Monotheism|spirit|forgiveness)\b/i.test(explanation)) {
    flags.push("Possible untranslated English or inconsistent theological term");
  }
  if (/\bOmoyagoro\b/i.test(explanation)) flags.push("Check Holy Spirit terminology against 'Omoika Omochenu'");
  if (/[“”"]/.test(explanation) && !verifiedExcerpts[
    // For the first Pathway, two quotations were checked against their own Bible sources.
    slug === "god-is-one" && index === 3 ? "Mark 12:29" : ""
  ]) flags.push("Quoted words in the original AI draft have not been checked against the Ekegusii Bible");
  if (slug === "god-is-one" && index === 0) flags.push("The prior AI wording of Deuteronomy 6:4 was incorrect and has been replaced");
  return flags;
}

/**
 * Rebase locally saved v1 material onto the new revised shared seed.
 * When the value is unchanged from the old AI output, use the correction.
 * If a human actually changed it, keep the human correction.
 */
export function rebaseReviewerDrafts(input: EkegusiiDrafts): EkegusiiDrafts {
  const output: EkegusiiDrafts = {};
  for (const [slug, saved] of Object.entries(input)) {
    const original = ekegusiiSeedDrafts[slug];
    if (!original) continue;
    const revised = revisedEkegusiiSeed(slug);
    const rebase = (current: string | undefined, old: string | undefined, next: string | undefined) =>
      !current?.trim() || current === old ? next : current;
    const steps: NonNullable<EkegusiiDraft["steps"]> = {};
    for (const index of Object.keys(original.steps)) {
      const draftStep = saved.steps?.[index];
      const source = original.steps[index];
      const fixed = revised.steps?.[index];
      steps[index] = {
        title: rebase(draftStep?.title, source.title, fixed?.title),
        explanation: rebase(draftStep?.explanation, source.explanation, fixed?.explanation),
        hook: rebase(draftStep?.hook, source.hook, fixed?.hook),
      };
    }
    output[slug] = {
      title: rebase(saved.title, original.title, revised.title),
      summary: rebase(saved.summary, original.summary, revised.summary),
      steps,
    };
  }
  return output;
}
export function getEkegusiiAuditSource(reference: string) {
  const referenceLink = ekegusiiBibleReference(reference);
  return referenceLink ? { ...referenceLink, publisher: "Bible Society of Kenya", edition: "Ebibilia Enchenu (2021)" } : null;
}

const CANONICAL_REFERENCE_INDEX: Readonly<Record<string, readonly string[]>> = {
  "god-is-one": [
    "Deuteronomy 6:4",
    "Isaiah 43:10",
    "Isaiah 44:8",
    "Mark 12:29",
    "1 Corinthians 8:4"
  ],
  "no-god-beside-him": [
    "Deuteronomy 4:35",
    "Deuteronomy 32:39",
    "Isaiah 43:10",
    "Isaiah 44:6",
    "1 Corinthians 8:4"
  ],
  "god-alone-creator": [
    "Genesis 1:1",
    "Isaiah 44:24",
    "Psalm 33:6",
    "John 1:3",
    "Colossians 1:16"
  ],
  "jesus-is-god": [
    "Isaiah 9:6",
    "Matthew 1:23",
    "John 1:1",
    "2 Corinthians 5:19",
    "Colossians 2:9",
    "John 20:28"
  ],
  "word-became-flesh": [
    "John 1:1",
    "John 1:3",
    "Psalm 33:6",
    "John 1:14",
    "Luke 1:35"
  ],
  "son-was-born": [
    "Isaiah 9:6",
    "Luke 1:35",
    "Galatians 4:4",
    "Luke 2:52",
    "1 Timothy 2:5"
  ],
  "father-dwells-in-son": [
    "John 14:7",
    "John 14:9",
    "John 14:10",
    "2 Corinthians 5:19",
    "Colossians 2:9"
  ],
  "jesus-image-of-god": [
    "John 1:18",
    "John 14:9",
    "Colossians 1:15",
    "Colossians 1:19",
    "Hebrews 1:3"
  ],
  "fullness-of-godhead": [
    "2 Corinthians 5:19",
    "John 14:10",
    "Colossians 1:15",
    "Colossians 1:19",
    "Colossians 2:9"
  ],
  "name-of-jesus": [
    "Matthew 1:21",
    "John 17:6",
    "Acts 4:12",
    "Philippians 2:9–11",
    "Colossians 3:17"
  ],
  "matthew-28-and-acts-2": [
    "Matthew 28:19",
    "Luke 24:46–47",
    "Acts 2:38",
    "Acts 8:16",
    "Acts 19:5"
  ],
  "baptism-in-jesus-name": [
    "Luke 24:46–47",
    "Acts 2:38",
    "Acts 8:16",
    "Acts 10:47–48",
    "Romans 6:3–4",
    "Colossians 2:12"
  ],
  "new-birth": [
    "John 3:3",
    "John 3:5",
    "Acts 2:37–38",
    "Acts 2:39",
    "Acts 8:14–17",
    "Titus 3:5–6"
  ],
  "repentance": [
    "Mark 1:15",
    "Luke 13:3",
    "Luke 24:46–47",
    "Acts 2:37–38",
    "2 Corinthians 7:10"
  ],
  "receiving-the-holy-ghost": [
    "Joel 2:28–29",
    "John 14:16–18",
    "Acts 2:1–4",
    "Acts 2:38–39",
    "Acts 10:44–46",
    "Acts 19:1–6"
  ],
  "tongues-as-initial-sign": [
    "Acts 2:1–4",
    "Acts 2:33",
    "Acts 10:44–46",
    "Acts 11:15–17",
    "Acts 19:6",
    "1 Corinthians 12:30"
  ],
  "gospel-pattern": [
    "1 Corinthians 15:1–4",
    "Luke 24:46–47",
    "Acts 2:38",
    "Romans 6:3–4",
    "Romans 8:11"
  ],
  "faith-grace-and-obedience": [
    "Ephesians 2:8–10",
    "Romans 1:5",
    "Galatians 5:6",
    "James 2:17",
    "Colossians 2:12"
  ],
  "right-hand-of-god": [
    "Exodus 15:6",
    "Psalm 118:16",
    "Psalm 110:1",
    "Acts 2:32–36",
    "1 Corinthians 15:24–28"
  ],
  "jesus-prayers-and-humanity": [
    "Luke 1:35",
    "Luke 2:52",
    "John 14:10",
    "Matthew 26:39",
    "Hebrews 5:7–8",
    "Colossians 2:9"
  ]
};

/**
 * Source-limited translation repair pass.
 *
 * These are explicit names/words attested in the 2021 Bible translation.
 * They are NOT a broad automatic translation dictionary and do not
 * certify natural grammar, tense, theology, or idiomatic accuracy.
 */
const SOURCE_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bHoly Ghost\b/gi, "Omoika Omochenu"],
  [/\bHoly Spirit\b/gi, "Omoika Omochenu"],
  [/\bOmoyagoro\b/gi, "Omoika Omochenu"],
  [/\bNgai\b/g, "Nyasae"],
  [/\bIsaiah\b/g, "Isaya"],
  [/\bMatthew\b/g, "Matayo"],
  [/\bJohn\b/g, "Yohana"],
  [/\bLuke\b/g, "Luka"],
  [/\bPeter\b/g, "Petero"],
  [/\bPaul\b/g, "Paulo"],
  [/\bJesus\b/g, "Yeso"],
  [/\bChrist\b/g, "Kristo"],
  [/\bFather\b/g, "Tata"],
  [/\bSon\b/g, "Omwana"],
  [/\bGod\b/g, "Nyasae"],
  [/\bPentecost\b/gi, "Pentekosti"],
  [/\bbaptism\b/gi, "okobatiswa"],
  [/\bSpirit\b/g, "Omoika"],
];

/** Strings indicative of an incomplete machine draft, not proof of errors. */
const MODEL_DRIFT = /\b(?:Godhead|monotheism|New Testament|Old Testament|Apostolic|teaching|badge|forgiveness|languages|Gentiles|First|Last|Emposito|Ekarai|Ekereri|nyamarera|mwsani)\b/i;

export function standardizeBibleVocabulary(value: string): string {
  let out = localizeReferenceMentions(value);
  for (const [pattern, replacement] of SOURCE_TERMS) out = out.replace(pattern, replacement);
  return out;
}

export function sourceAlignmentRisks(slug: string, index: number): string[] {
  const draft = ekegusiiSeedDrafts[slug]?.steps[String(index)];
  if (!draft) return [];
  const risks: string[] = [];
  const combined = [draft.title, draft.explanation, draft.hook].join(" ");
  if (MODEL_DRIFT.test(combined)) {
    risks.push("Machine draft contains English/ambiguous theological words; native translation required.");
  }
  if (/\b(?:Ngai|Holy Ghost|Holy Spirit|Omoyagoro|Jesus|God|Father|Son|Paul|Peter|John|Matthew|Luke|Isaiah)\b/.test(combined)) {
    risks.push("Nonstandard spelling or untranslated biblical name; corrected against the Bible glossary.");
  }
  if (/[“”"]/.test(draft.explanation) && !verifiedEkegusiiExcerpt(
    // Only references verified from the actual published 2021 edition count as checked.
    referenceOfStep(slug, index)
  )) {
    risks.push("Original draft quoted words that were not checked against the published Ekegusii Bible.");
  }
  // An unflagged passage is still unapproved; lack of markers is not evidence of accuracy.
  return risks;
}

/** Canonical references keyed to the same 106 immutable teaching steps. */
export function referenceOfStep(slug: string, index: number): string {
  // Avoid changing or duplicating the English teaching catalog's actual content.
  return CANONICAL_REFERENCE_INDEX[slug]?.[index] ?? "";
}

/**
 * Baseline v3: remove quotation marks around *unverified* model-generated
 * purported Bible speech and refer to the actual chapter instead.
 * Do not convert the unverified quoted words into an attributed Scripture.
 * The English original remains accessible for all 106 explanations.
 */
export function bibleSourcedEkegusiiSeed(slug: string): EkegusiiDraft {
  const previous = revisedEkegusiiSeed(slug);
  if (!previous.steps) return previous;
  const steps: NonNullable<EkegusiiDraft["steps"]> = {};
  for (const [index, source] of Object.entries(previous.steps)) {
    const ref = referenceOfStep(slug, Number(index));
    const normalized = standardizeBibleVocabulary(source.explanation ?? "");
    const safeExplanation = verifiedEkegusiiExcerpt(ref) ? normalized :
      normalized.replace(/"[^"\n]{6,220}"|“[^”\n]{6,220}”|‘[^’\n]{6,220}’/g,
        " (rora " + displayEkegusiiBibleReference(ref) + ") ");
    steps[index] = {
      title: standardizeBibleVocabulary(source.title ?? ""),
      explanation: safeExplanation.replace(/\s{2,}/g," ").trim(),
      hook: standardizeBibleVocabulary(source.hook ?? ""),
    };
  }
  return {
    title: standardizeBibleVocabulary(previous.title ?? ""),
    summary: standardizeBibleVocabulary(previous.summary ?? ""),
    steps,
  };
}

/**
 * Migration v2 -> v3 preserves a pastor's changes field by field.
 * Matches against v2 are refreshed; nonmatching reviewer text stays intact.
 */
export function rebaseV2ReviewerDrafts(input: EkegusiiDrafts): EkegusiiDrafts {
  const result: EkegusiiDrafts = {};
  for(const [slug,saved] of Object.entries(input)) {
    const old = revisedEkegusiiSeed(slug);
    const current = bibleSourcedEkegusiiSeed(slug);
    if(!old.steps || !current.steps) continue;
    const rebase=(value:string|undefined, before:string|undefined, after:string|undefined) =>
      !value?.trim() || value === before ? after : value;
    const steps: NonNullable<EkegusiiDraft["steps"]> = {};
    for(const index of Object.keys(current.steps)) {
      const prev=saved.steps?.[index];
      const from=old.steps[index],to=current.steps[index];
      steps[index]={
        title:rebase(prev?.title,from.title,to.title),
        explanation:rebase(prev?.explanation,from.explanation,to.explanation),
        hook:rebase(prev?.hook,from.hook,to.hook),
      };
    }
    result[slug]={
      title:rebase(saved.title,old.title,current.title),
      summary:rebase(saved.summary,old.summary,current.summary),
      steps,
    };
  }
  return result;
}
