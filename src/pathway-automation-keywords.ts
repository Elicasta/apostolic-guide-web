export const PATHWAY_AUTOMATION_KEYWORDS: Record<string, string> = {
  "god-is-one": "ONEGOD",
  "no-god-beside-him": "ONEGOD",
  "god-alone-creator": "CREATOR",
  "jesus-is-god": "JESUS",
  "word-became-flesh": "WORD",
  "son-was-born": "SON",
  "father-dwells-in-son": "FATHER",
  "jesus-image-of-god": "IMAGE",
  "fullness-of-godhead": "FULLNESS",
  "name-of-jesus": "NAME",
  "matthew-28-and-acts-2": "BAPTISM",
  "baptism-in-jesus-name": "BAPTISM",
  "new-birth": "NEWBIRTH",
  "repentance": "REPENT",
  "receiving-the-holy-ghost": "HOLYGHOST",
  "tongues-initial-sign": "TONGUES",
  "gospel-pattern": "GOSPEL",
  "faith-grace-obedience": "GRACE",
  "right-hand-of-god": "RIGHTHAND",
  "jesus-prayers-humanity": "HUMANITY"
};

export function pathwayAutomationKeyword(slug?: string | null, title?: string | null) {
  const normalizedSlug = slug?.trim().toLowerCase() || "";
  if (PATHWAY_AUTOMATION_KEYWORDS[normalizedSlug]) return PATHWAY_AUTOMATION_KEYWORDS[normalizedSlug];
  const source = title?.trim() || normalizedSlug.replace(/-/g, " ") || "STUDY";
  const words = source.toUpperCase().match(/[A-Z0-9]+/g) ?? ["STUDY"];
  const preferred = words.find((word) => word.length >= 4 && !["THE", "WITH", "AND", "FROM", "THIS", "THAT"].includes(word));
  return (preferred || words[0] || "STUDY").slice(0, 16);
}
