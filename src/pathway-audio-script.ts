export const APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES = `
THEOLOGICAL FRAME — APOSTOLIC ONENESS
- Write positively and explicitly from Apostolic Oneness theology. Do not write from a neutral, ecumenical, or Trinitarian framework.
- God is one indivisible God, the one YHWH of Scripture. Do not imply multiple divine beings, divine centers, or separate divine persons within God.
- Jesus Christ is the one true God revealed and manifested in genuine humanity for our salvation. He is the visible image and full revelation of the invisible God, and the fullness of deity dwells bodily in Him.
- The Father is the eternal divine Spirit. In the incarnation, the Father dwells in and works through the Son. Preserve the real biblical distinction between Father and Son without turning that distinction into two divine persons.
- The Son is genuinely begotten, born, given, human, obedient, able to pray, suffer, and die. Do not affirm an eternal Son-person, a pre-existent Son-person, God the Son, or a second divine person. Where relevant, distinguish the eternal God/Word from the Son who is born in the incarnation.
- In John 1, the Word is God's own eternal Word, self-expression, wisdom, and self-revelation. The Word was God and became flesh. Do not turn the Word into a second divine person alongside God.
- The Holy Spirit is the Spirit of the one God, not another divine person alongside the Father.
- Do not reduce Father, Son, and Spirit to disposable masks or pretend their biblical distinctions are unreal. Explain the incarnation carefully: full deity truly dwelling in genuine humanity.
- Never affirm phrases such as "God the Son," "eternal Son," "second person of the Trinity," "three divine persons," "coequal persons," or "one God in three persons." If the supplied Pathway discusses such language as an objection, describe it fairly and answer it from the supplied Scripture and the Oneness frame.
- Prefer explicit biblical language over later metaphysical vocabulary. When a conclusion is an inference, present it as an inference rather than pretending the verse states it word-for-word.
`.trim();

export const APOSTOLIC_GUIDE_AUDIO_OPENING_RULES = `
OPENING AND PLATFORM-NEUTRAL DELIVERY
- Begin with a short hook that states the question, tension, or reason this study matters.
- Immediately after the hook, include a brief natural greeting that identifies the ministry: "Welcome to Apostolic Guide."
- After the greeting, invite the listener to follow along with the Pathway as the Scriptures are studied. Keep this invitation natural and brief.
- The follow-along wording must work anywhere the audio is used. Never say "click the link below," "in this video," "on YouTube," "in the app," "in your browser," "in the description," or assume a specific platform.
- A good pattern is: "If you'd like to follow along, open this Pathway as we move through the Scriptures together." You may vary the wording naturally, but preserve the same meaning.
- Do not add a second branded intro, music cue, host introduction, subscribe request, like request, or social-media call to action. A reusable external video or podcast intro may be placed before this narration later.
`.trim();

export function buildPathwayAudioScriptPrompt(source: string) {
  return `Write a spoken-word narration script for an Apostolic Guide Scripture Pathway.

VOICE AND EDITORIAL RULES
- Scripture-first, calm, clear, confident, pastoral, and conversational.
- Teach rather than debate. Never mock or attack another theological group.
- Do not introduce historical claims or proof texts that are not present in the supplied Pathway.
- Preserve the Pathway's argument and sequence. Do not strengthen an inference into an explicit claim.
- Make the Apostolic Oneness meaning clear when the supplied passages support it. Do not flatten the script into generic Christian language.
- Explain why each passage follows the previous passage. Use natural transitions instead of saying Step 1, Step 2, etc.
- Quote only Scripture wording supplied below. Do not invent missing verse wording.
- End with a concise, platform-neutral summary and invitation to continue studying on Apostolic Guide.
- Output only the finished narration. No headings, markdown, notes, labels, or commentary.
- Keep the entire narration between 2,500 and 3,850 characters so it can be sent safely to the speech model.

${APOSTOLIC_GUIDE_AUDIO_OPENING_RULES}

${APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES}

CANONICAL PATHWAY SOURCE
${source}`;
}
