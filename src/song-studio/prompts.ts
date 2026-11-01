import type { SongMechanics, SongProject, SongStyleProfile } from "./types";

export const SONG_PROMPT_VERSION = "apostolic-song-studio-v1";

const APOSTOLIC_SONG_STANDARD = `
You are writing and reviewing congregational songs for Apostolic Guide.

THEOLOGICAL STANDARD
- Scripture presents one indivisible God. Do not write as though God is multiple divine centers or separate Gods.
- Jesus Christ is fully and absolutely divine, not a lesser divine being.
- Preserve the real biblical distinction between Father, Son, and Spirit without forcing those biblical terms into three divine centers.
- Preserve the genuine humanity of Jesus. The Son is born/given in the incarnation. Do not flatten every statement about Jesus' humanity into a statement about deity.
- The Father is the eternal Spirit dwelling in and revealed through the Son. The Word is God's own self-expression made flesh, not a second God alongside Him.
- Jesus is the saving name proclaimed by the apostles. Use Jesus-centered language naturally when the subject calls for it.
- Prefer explicit biblical language and imagery over systematic-theology jargon.

SONGWRITING STANDARD
- This is worship first, not a debate set to music.
- An Apostolic congregation must be able to sing every line without mentally editing the theology.
- A visitor unfamiliar with Oneness theology should still hear a beautiful biblical song about God and Jesus, not a polemic.
- Verses may carry theological detail. Choruses should worship, declare, confess, pray, or respond.
- Give each song one theological center. Do not cram the whole doctrinal system into one lyric.
- The main hook must work without production tricks and should be learnable by a normal congregation by the second repetition.
- Avoid generic Christian-industry filler unless the specific line genuinely serves this song.
- Do not imitate a living artist, songwriter, band, or copyrighted song. Describe musical traits instead.
- Do not chase current trends. Write for theological durability, emotional truth, and congregational use.
`.trim();

function list(values: string[]) {
  return values.length ? values.join(", ") : "Not specified";
}

export function buildSongWritingPrompt(project: SongProject, style: SongStyleProfile | null) {
  return `${APOSTOLIC_SONG_STANDARD}

TASK
Write a complete first draft from this brief. Use labeled sections such as [Verse 1], [Chorus], [Bridge]. Do not add commentary inside the lyrics.

PROJECT
Working title: ${project.working_title || project.title || "Untitled"}
Song type: ${project.song_type}
Theological center: ${project.theological_center || "Not specified"}
Core Scriptures: ${list(project.core_scriptures)}
Audience/context: ${project.audience_context || "Congregational church worship"}
Desired tone: ${project.desired_tone || "Scripture-rich, reverent, singable"}
Creative brief: ${project.creative_brief || "No extra brief supplied."}

MUSICAL PALETTE
${style ? `Profile: ${style.name}
Musical family: ${style.musical_family}
Vocal texture: ${style.vocal_texture}
Instrumentation: ${list(style.instrumentation)}
Tempo: ${style.tempo_min ?? "open"}-${style.tempo_max ?? "open"} BPM
Energy: ${style.energy}/100
Suno style language: ${style.suno_style_prompt}
Avoid: ${list(style.negative_style_notes)}` : "No style profile selected. Keep the lyric musically flexible and congregational."}

RETURN
Create a title, finished lyric, concise theological-center statement, Scripture references actually informing the lyric, and a production-ready Suno style description using musical traits only.`;
}

export function buildSongRefinePrompt(project: SongProject, lyrics: string, instruction: string, style: SongStyleProfile | null) {
  return `${APOSTOLIC_SONG_STANDARD}

TASK
Revise the existing song according to the editorial instruction. Protect any strong lines that do not need changing. Do not make the song more generic just to make it smoother.

PROJECT CENTER
${project.theological_center}
Core Scriptures: ${list(project.core_scriptures)}
Song type: ${project.song_type}
Style: ${style?.name ?? "Open"}

EDITORIAL INSTRUCTION
${instruction}

CURRENT LYRIC
${lyrics}

RETURN
Return a complete revised lyric, not patches. Also state the main change in one short sentence and provide updated Suno style language if the requested change affects production.`;
}

export function buildSongEvaluationPrompt(project: SongProject, lyrics: string, mechanics: SongMechanics) {
  return `${APOSTOLIC_SONG_STANDARD}

TASK
Act as a strict theological editor, congregational worship leader, and lyric editor. Score this song from 0-100 on every required metric. Do not reward a lyric for sounding religious. Cite actual reasons from the lyric.

HARD REVIEW RULES
- doctrinal_fidelity and oneness_integrity must be 92+ to clear the theological gate.
- biblical_language must be 84+.
- congregational_singability and worship_orientation must be 72+.
- A beautiful but theologically ambiguous line should lose points when the ambiguity creates a real doctrinal problem.
- Do not penalize a song merely because it does not explicitly teach every Apostolic doctrine. Judge fidelity to its chosen theological center.
- Do penalize argumentative or slogan-like Oneness language when biblical worship language would carry the truth better.

PROJECT
Title: ${project.working_title || project.title}
Song type: ${project.song_type}
Theological center: ${project.theological_center}
Core Scriptures: ${list(project.core_scriptures)}
Desired tone: ${project.desired_tone}

MECHANICAL SIGNALS
Line count: ${mechanics.lineCount}
Sections: ${mechanics.sectionCount}
Chorus lines: ${mechanics.chorusLineCount}
Average words/line: ${mechanics.averageWordsPerLine}
Longest line: ${mechanics.longestLineWords} words
Repeated-line ratio: ${mechanics.repeatedLineRatio}
Cliche hits: ${list(mechanics.clicheHits)}
Jargon hits: ${list(mechanics.jargonHits)}
Mechanical warnings: ${list(mechanics.warnings)}

LYRICS
${lyrics}

METRICS TO SCORE
1. doctrinal_fidelity
2. scripture_grounding
3. christ_centeredness
4. oneness_integrity
5. biblical_language
6. congregational_singability
7. hook_memorability
8. lyrical_originality
9. worship_orientation
10. cliche_resistance
11. structural_cohesion
12. suno_readiness

RETURN
Scores, strengths, specific issues, Scripture references the lyric actually reflects, and theological notes. Use blocker severity only for something that should stop this version from going to Suno.`;
}

export function buildSunoPrompt(project: SongProject, lyrics: string, style: SongStyleProfile | null) {
  return `${APOSTOLIC_SONG_STANDARD}

TASK
Prepare production metadata for Suno from an already approved lyric. Do not rewrite the lyric unless a line is literally unsingable. Do not name artists or copyrighted songs.

SONG
Type: ${project.song_type}
Center: ${project.theological_center}
Tone: ${project.desired_tone}
Style profile: ${style?.name ?? "Open"}
Style foundation: ${style?.suno_style_prompt ?? "Congregational worship, organic dynamics, clear lead vocal, natural room"}
Avoid: ${list(style?.negative_style_notes ?? [])}

LYRICS
${lyrics}

RETURN
A concise Suno style prompt, production notes, negative style notes, and a practical BPM range.`;
}
