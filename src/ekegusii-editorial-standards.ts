import { allPathways } from "./pathway-catalog";
import { ekegusiiBibleReference } from "./ekegusii-bible-references";

/**
 * Editor's guide to the full 106-step draft corpus.
 *
 * Scripture wording inspected in the exact 2021 Ebibilia Enchenu edition is
 * tracked separately from reviewed or approved *teaching translations*.
 *
 * This register must NOT mark a passage as linguistically or doctrinally
 * approved merely because a reader opened or inspected the source chapter.
 */
const INSPECTED_SCRIPTURE: Readonly<Record<string, {
  source: "reader" | "ebible-2021" | "youversion-2021";
  keywordCue: string;
}>> = {
  "Deuteronomy 6:4": { source: "reader", keywordCue: "Omonene / Nyasae / bweka" },
  "Mark 12:29": { source: "ebible-2021", keywordCue: "Jesus' Shema formulation; distinguish from Deuteronomy 6:4" },
  "Acts 4:12": { source: "youversion-2021", keywordCue: "Ogotoreka / name / salvation" },
  "Genesis 1:1": { source: "ebible-2021", keywordCue: "Nyasae agatonga / igoro / ense" },
  "Matthew 1:21": { source: "ebible-2021", keywordCue: "Yeso / ebibe / saving His people" },
  "Matthew 1:23": { source: "ebible-2021", keywordCue: "Imanueli / Nyasae nare naintwe" },
  "John 1:1": { source: "ebible-2021", keywordCue: "Ring’ana / Nyasae; do not change the two assertions" },
  "John 1:3": { source: "ebible-2021", keywordCue: "Goetera ase are / ebinto bionsi" },
  "John 1:14": { source: "ebible-2021", keywordCue: "Ring’ana rigakoreka koba omobere; true humanity" },
  "John 1:18": { source: "ebible-2021", keywordCue: "Omwana omomoima / Tata / declared the invisible God" },
  "John 3:3": { source: "ebible-2021", keywordCue: "Omonto ataiboiri eria kabere / oborwoti bwa Nyasae" },
  "John 3:5": { source: "ebible-2021", keywordCue: "amaache na Omoika; keep water and Spirit distinct" },
  "Luke 1:35": { source: "ebible-2021", keywordCue: "Omoika Omochenu / Omwana o Nyasae; preserve conception, divine power and Sonship" },
  "Hebrews 1:3": { source: "ebible-2021", keywordCue: "obonene bwa Nyasae / obokobo bw'okorio; revelation and exaltation" },
  "Psalm 118:16": { source: "ebible-2021", keywordCue: "Okoboko gw’okorio kw’Omonene; poetic image of divine action" },
  "Romans 1:5": { source: "ebible-2021", keywordCue: "okwegena / okoigwera; obedience of faith in the gospel" },
  "2 Corinthians 7:10": { source: "ebible-2021", keywordCue: "ogoichanigwa / okoonchoka; godly sorrow producing repentance" },
};

/**
 * Specific Oneness doctrinal/linguistic reviewer constraints by pathway.
 * Interpretations are attributed to the teaching, not represented as
 * verbatim Scripture quotation or as the only Christian reading.
 */
export const EKEGUSII_PATHWAY_REVIEW: Readonly<Record<string, {
  theme: string;
  preserve: string;
  avoid: string;
}>> = {
  "god-is-one": {
    theme: "The Shema and the uniqueness of the LORD",
    preserve: "One LORD alone; do not alter the distinction between Deuteronomy 6:4 and Mark 12:29.",
    avoid: "Do not turn the confession into an invented quote or imply the verse itself is a later creedal formula.",
  },
  "no-god-beside-him": {
    theme: "God's exclusive identity as LORD, Savior, First and Last",
    preserve: "God says no other God exists; track negation in every sentence and translate source book names correctly.",
    avoid: "Do not turn figurative titles into literal multiple gods or erase the Isaiah speaker and audience.",
  },
  "god-alone-creator": {
    theme: "One Creator acting by His Word and through Christ",
    preserve: "Distinguish God's own creative action from New Testament statements about the Word and Christ.",
    avoid: "Do not insert a separate creator deity, or rewrite Word as only a created angel or person.",
  },
  "jesus-is-god": {
    theme: "The deity of Christ and God's presence in Him",
    preserve: "Preserve both His genuine humanity and the theological reasoning connecting these passages.",
    avoid: "Do not imply the human child is identical to the pre-existent humanity of Jesus, or erase the incarnation.",
  },
  "word-became-flesh": {
    theme: "The Word was God; the Word became flesh",
    preserve: "John 1:1 distinguishes being with God and being God; John 1:14 affirms actual incarnation.",
    avoid: "Do not treat 'Word' as a generic book or substitute an invented Ekegusii Bible quotation.",
  },
  "son-was-born": {
    theme: "The birth and authentic human growth of the Son",
    preserve: "Distinguish eternal deity from the real historical birth and life of Jesus as the Son.",
    avoid: "Do not deny that Jesus grew, learned or lived a truly human life.",
  },
  "father-dwells-in-son": {
    theme: "Jesus reveals the Father; God in Christ",
    preserve: "Preserve what John 14 says and identify Apostolic Oneness conclusions as interpretations.",
    avoid: "Do not replace Jesus' words with a claim that the Father and Son are interchangeable in every respect.",
  },
  "jesus-image-of-god": {
    theme: "Image of the invisible God and the fullness in Christ",
    preserve: "Distinguish image/revelation from the assertion of full deity.",
    avoid: "Do not turn 'image' into mere physical likeness or deny divine fullness.",
  },
  "fullness-of-godhead": {
    theme: "Fullness of deity dwelling bodily",
    preserve: "Colossians 2:9's bodily language and its connection to 1:19 are central.",
    avoid: "Do not translate 'fullness' as merely part of divinity; do not erase Jesus' body.",
  },
  "name-of-jesus": {
    theme: "Jesus' name, salvation and honoring the Father",
    preserve: "Keep the source's actual speaker and distinction between the name, the bearer and saving work.",
    avoid: "Do not conflate Jesus' given name with an explicit translation of every divine title in every verse.",
  },
  "matthew-28-and-acts-2": {
    theme: "The commission and apostolic response",
    preserve: "Matthew 28:19's singular 'name' and Acts 2:38's named-baptism wording, as separate quotations.",
    avoid: "Do not modify Matthew's triadic wording, or claim that Acts' wording is a literal quote of Matthew.",
  },
  "baptism-in-jesus-name": {
    theme: "The apostolic baptism practice",
    preserve: "Distinguish narrative examples, direct commands, faith and union with Christ.",
    avoid: "Do not add invented words to the baptism formula or suggest the water itself saves independently of God.",
  },
  "new-birth": {
    theme: "Born of water and of the Spirit",
    preserve: "John 3:3 and 3:5 are distinct; water and Spirit cannot disappear in translation.",
    avoid: "Do not imply that Acts narrates an identical order of events in every case.",
  },
  "repentance": {
    theme: "Repentance and change of heart",
    preserve: "Repentance includes a real turning toward God, not simply remorse.",
    avoid: "Do not reduce repentance to emotional pain or add a requirement unrelated to the cited text.",
  },
  "receiving-the-holy-ghost": {
    theme: "The promised Holy Spirit received by believers",
    preserve: "Use Bible-attested Spirit terminology and preserve the promise's different settings.",
    avoid: "Do not assume every passage gives the same description of observable evidence.",
  },
  "tongues-as-initial-sign": {
    theme: "The Acts narratives and public gift distinction",
    preserve: "Distinguish Acts 2, 10, 19 narrative evidence from Paul's rhetorical questions about distributed gifts.",
    avoid: "Do not claim 1 Corinthians 12:30 is a direct blanket negation of Pentecost or a proof that everyone has a public gift.",
  },
  "gospel-pattern": {
    theme: "Death, burial, resurrection and the response of faith",
    preserve: "Keep 1 Corinthians 15's historical gospel events and Acts' response distinct.",
    avoid: "Do not invent a verse declaring that ritual works purchase salvation.",
  },
  "faith-grace-and-obedience": {
    theme: "Salvation by grace through faith and obedient response",
    preserve: "Ephesians 2:8–10: grace is the source, works are the resulting walk.",
    avoid: "Do not turn baptism into the price of salvation or teach that obedience is unnecessary.",
  },
  "right-hand-of-god": {
    theme: "Right-hand imagery, Messiah's exaltation and kingdom",
    preserve: "Honor figurative power/exaltation language and 1 Corinthians 15:24–28's ordered roles.",
    avoid: "Do not falsely quote a source as denying all distinction between Son and Father.",
  },
  "jesus-prayers-and-humanity": {
    theme: "Jesus' genuine humanity, prayer and divine fullness",
    preserve: "Jesus' real human will/prayers and dependence within his human life, alongside full deity.",
    avoid: "Do not make Gethsemane a staged prayer or erase the difference between Jesus and the One addressed.",
  },
};

export function ekegusiiReviewStatus(reference: string) {
  const link = ekegusiiBibleReference(reference);
  const checked = INSPECTED_SCRIPTURE[reference];
  return {
    hasChapterLink: Boolean(link),
    bibleTextInspected: Boolean(checked),
    bibleEdition: "Ebibilia Enchenu © 2021 Bible Society of Kenya",
    bibleSource: link?.url ?? "https://ebible.org/details.php?id=guz",
    passageCue: checked?.keywordCue ?? null,
    translationHumanApproved: false,
    doctrineHumanApproved: false,
  };
}

export function ekegusiiPathwayCheck(slug: string) {
  return EKEGUSII_PATHWAY_REVIEW[slug] ?? null;
}

export function getEkegusiiSourceCoverage() {
  let steps = 0, inspected = 0, unmapped = 0;
  for (const pathway of allPathways) {
    for (const step of pathway.steps) {
      steps++;
      const status = ekegusiiReviewStatus(step.reference);
      if (status.bibleTextInspected) inspected++;
      if (!status.hasChapterLink) unmapped++;
    }
  }
  return { pathways: allPathways.length, steps, bibleTextInspectedSteps: inspected, linksUnmapped: unmapped };
}
