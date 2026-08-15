# Comment Guide argument library

The Comment Guide uses a server-owned library of 39 recurring objections before Sol writes a reply. The library covers the full Apostolic Oneness position, not only modalism.

## What the library stores

Each record has:

- a stable argument ID
- one of seven doctrine categories
- a `claim`, `strawman`, or `accusation` classification
- common wording patterns for deterministic matching
- the claim being made
- an approved Apostolic correction
- optional short reply variations
- one or more live Apostolic Guide Pathways

The current categories are Godhead, Christology, Holy Spirit, baptism, salvation, tongues, and history or accusation.

## Reply pipeline

1. Normalize the untrusted comment.
2. Match explicit phrases against the server-owned library.
3. Give Sol the deterministic candidates and the full approved directory so it can catch paraphrases.
4. Keep deterministic matches first and discard any model-created ID.
5. Route by the central biblical claim before a strawman or accusation.
6. Let Sol compose one short answer from approved correction material.
7. Run a second Sol pass against the doctrine lock, selected Pathway, original comment, and recent bot replies.
8. Run deterministic publish checks for combative language, doctrine drift, unsupported Scripture, links, hashtags, length, and exact repetition.
9. If review fails, write a safe server-owned reply from the same argument records. Never publish the rejected draft.
10. Add the human-style delay and use the existing Pathway handoff.

For a combined comment such as `Jesus is not the Father. This is modalism and heresy.`, the system preserves three separate records:

- claim: `jesus-not-the-father`
- strawman: `modalism-masks-or-modes`
- accusation: `heresy-cult-not-christian`

It answers the claim first, corrects the actual strawman, defuses the label, and stops. It does not produce a point-by-point debate.

## Variation without doctrine drift

Sol sees the most recent bot replies and is told not to repeat them. The server fallback also rotates approved openings, concise correction variants, and Pathway handoffs using a stable event seed. Exact recent duplicates are rejected.

Variation changes voice, not belief. The doctrine lock, approved correction records, Pathway Scripture, and final validator remain fixed.

Doctrinal objections lead with substance. Phrases such as “thank you for raising the concern” are not used as generic filler. Positive comments remain a separate lane and may receive a natural short response.

## Current coverage

### Godhead and Christology

- one God in three persons
- Jesus is not the Father
- Jesus prayed to the Father
- Father, Son, and Spirit at Jesus' baptism
- John 17 pre-creation glory and love
- the Word was with God
- the Father sent or loves the Son
- the Father is greater and the Son did not know the hour
- “not my will” and two-will arguments
- the right hand of God and Stephen's vision
- another Comforter
- mediator and intercessor language
- “let us make man”
- creation through the Son and eternal Sonship
- personal actions of the Holy Spirit
- triadic passages
- who raised Jesus
- God cannot die or be tempted

### Baptism, salvation, and Spirit reception

- Matthew 28:19 and the Acts baptismal wording
- “in Jesus' name” means authority only
- baptism is only symbolic
- baptism is a human work opposed to grace
- the thief on the cross
- Cornelius receiving the Spirit before water baptism
- Paul was not sent to baptize
- belief and confession alone
- born of water does not mean baptism
- Acts 2:38 grammar and `eis`
- every believer automatically receives the Spirit at first belief

### Tongues

- “do all speak with tongues?”
- tongues were only known languages
- tongues ceased with the apostles
- tongues are not required for salvation

### Labels and history

- modalism or Sabellianism
- heresy, cult, and “not Christian” labels
- “Jesus Only” and denial of Father or Holy Spirit
- Nicaea, the councils, and majority tradition
- Patripassianism or “the Father died”
- Oneness was invented in 1913

## Research basis

The first library pass compares recurring argument lists, denominational position pages, debate material, and Apostolic answers. Sources are used to identify how objections are commonly framed. Apostolic Guide's own Pathways remain the authority for what Sol may affirm.

| Area | Public source | What it contributed |
| --- | --- | --- |
| Father, Son, Holy Spirit distinctions | [Christian Research Institute: Is Jesus the Father and the Holy Spirit?](https://www.equip.org/articles/is-jesus-the-father-and-the-holy-spirit/) | Common prayer, love, will, baptism, and Matthew 28 objections |
| Modalism and historical labels | [Catholic Answers: Sabellianism](https://www.catholic.com/magazine/print-edition/sabellianism) | Sabellianism, modes, Patripassianism, and historical framing |
| Modalism proof-text list | [Bible.ca: Trinity versus Modalism](https://www.bible.ca/trinity/trinity-modalism.htm) | A broad critical list of Father-Son distinction texts |
| Natural objection wording | [RIS3N: Trinity common objections](https://ris3n.com/codex/trinity-common-objections/) | Short forms used in ordinary online discussion |
| Apostolic Father-Son answers | [OnenessPentecostal.com: Is Jesus the Father?](https://www.onenesspentecostal.com/father.htm) | Apostolic distinction between Father and genuine human Son |
| Jesus-name baptism | [OnenessPentecostal.com: Acts 2:38 baptism](https://onenesspentecostal.com/Acts238baptism.htm) | Apostolic answers to baptism wording and authority objections |
| Baptism objections | [Apostolic.edu: Common objections to baptism](https://www.apostolic.edu/common-objections-to-baptism/) | Thief, grace and works, Paul, Cornelius, and related objections |
| Evangelical baptism critique | [Bible.org: Is baptism necessary for salvation?](https://bible.org/seriespage/8-baptism-necessary-salvation) | Common symbolic, grammar, grace, and proof-text objections |
| Tongues as initial evidence | [Assemblies of God: Baptism in the Holy Spirit](https://ag.org/Beliefs/Position-Papers/Baptism-in-the-Holy-Spirit) | Pentecostal distinction between Spirit baptism and gifts |
| Tongues critique | [GotQuestions: Must Christians speak in tongues to be saved?](https://www.gotquestions.org/speak-in-tongues-saved.html) | Common 1 Corinthians 12, salvation, and gift objections |
| Modern Oneness history | [Assemblies of God: The New Issue, 1919](https://news.ag.org/en/article-repository/news/2015/10/this-week-in-ag-history--october-18-1919) | The 1913 origin accusation and denominational history framing |
| Long-form public debate | [Oneness vs. Trinity: David Bernard and James White](https://apostoliclive.com/oneness-vs-trinity-david-bernard-vs-james-white-1-4/) | Repeated debate clusters and combined objections |

Facebook and Instagram comments are not bypass-scraped. Their public indexing is incomplete, and access controls must be respected. Production learning should come from comments received through the connected Meta account, approved Meta APIs, approved exports, or manually supplied examples. New wording can improve pattern coverage, but it cannot silently change the doctrine lock or approved corrections.

## Adding an argument

Add a record to `src/comment-guide-argument-library.ts`, map it only to live Pathway slugs, and add a real-world fixture to `tests/comment-guide-argument-library.test.ts`. The test suite rejects duplicate IDs, missing categories, missing patterns, and dead Pathway links.
