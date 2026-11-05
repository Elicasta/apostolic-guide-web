/**
 * Video speech is evidence of what was preached. A word-for-word KJV variation
 * in that speech calls for owner review, not an unoverrideable graphics failure.
 * Only a model issue explicitly confined to wording may be downgraded.
 * Doctrinal contradictions, fabricated citations and wrong doctrine still FAIL.
 */
export type ProducerReviewIssue = {
  severity: "flag" | "fail";
  location: string;
  line: string;
  reason: string;
  reference: string;
};

const wordingOnly = /\b(?:misquot(?:e|es|ed)|wording|paraphras(?:e|es|ed)|homophone|transcrib(?:ed|ing)|transcription|does not match|not exact|omits?|omitted|differs? from|rather than)\b/i;
const doctrinal = /\b(?:heresy|heretical|doctrin(?:e|al)|contradict(?:s|ion|ory)?|denies?|reverses?|fabricat(?:ed|ion)?|invent(?:ed|ion)?|false teaching|wrong (?:reference|citation|verse)|changes? (?:the )?meaning|alters? (?:the )?meaning|wrongly attributes?|unverified|nonexistent)\b/i;
const dangerousClaim = /\b(?:Jesus is not God|God is not one|there (?:are|is) (?:many|three) gods|there is no God|God did not come in (?:the )?flesh|Jesus never rose)\b/i;

export function classifyVideoProducerIssue(issue: ProducerReviewIssue): ProducerReviewIssue {
  if (issue.severity !== "fail" || !/^spoken_transcript(?:\b|$)/i.test(issue.location)) return issue;
  if (!issue.reference.trim() || !wordingOnly.test(issue.reason)) return issue;
  if (doctrinal.test(issue.reason) || dangerousClaim.test(issue.line)) return issue;
  return { ...issue, severity: "flag" };
}
