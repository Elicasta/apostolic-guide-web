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
