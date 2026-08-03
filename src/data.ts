export type Topic = {
  slug: string;
  title: string;
  claim: string;
  summary: string;
  category: "God and Christ" | "Salvation" | "Biblical interpretation";
  keyScriptures: string[];
  accent: string;
};

export type Section = {
  heading?: string;
  paragraphs: string[];
  scripture?: { reference: string; text: string };
};

export type Answer = {
  slug: string;
  question: string;
  shortAnswer: string;
  summary: string;
  topicSlug: string;
  scriptures: string[];
  sections: Section[];
};

export type Article = {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  topicSlug: string;
  readingMinutes: number;
  publishedAt: string;
  sections: Section[];
};

export type ScriptureEntry = {
  slug: string;
  path: string;
  reference: string;
  text: string;
  translation: string;
  mainPoint: string;
  context: string;
  apostolicConnection: string;
  misunderstanding?: string;
  topicSlugs: string[];
  related: string[];
};

export type Pathway = {
  slug: string;
  appSlug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  level: "Foundational" | "Intermediate";
  topicSlug: string;
  steps: { title: string; reference: string; explanation: string }[];
};

export const topics: Topic[] = [
  {
    slug: "god-is-one",
    title: "God Is One",
    claim: "Scripture presents one indivisible God, not three divine beings.",
    summary: "Begin with the repeated biblical confession that YHWH alone is God, Creator, Savior, and King.",
    category: "God and Christ",
    keyScriptures: ["Deuteronomy 6:4", "Isaiah 44:6", "Mark 12:29"],
    accent: "ONE"
  },
  {
    slug: "jesus-is-god",
    title: "Jesus Is God",
    claim: "Jesus Christ is the full revelation of the invisible God in genuine humanity.",
    summary: "Trace how divine identity, works, worship, and Old Testament declarations of YHWH are applied to Jesus Christ.",
    category: "God and Christ",
    keyScriptures: ["John 1:1, 14", "Colossians 2:9", "Hebrews 1:8"],
    accent: "JESUS"
  },
  {
    slug: "the-father-in-the-son",
    title: "The Father in the Son",
    claim: "The invisible Father was dwelling, speaking, and working in Christ.",
    summary: "Read Jesus' own explanation of how seeing him is seeing the Father without denying his real humanity as the Son.",
    category: "God and Christ",
    keyScriptures: ["John 14:9–11", "2 Corinthians 5:19", "Colossians 1:15"],
    accent: "REVEALED"
  },
  {
    slug: "the-word-became-flesh",
    title: "The Word Became Flesh",
    claim: "God's eternal self-expression became flesh, not a second God beside him.",
    summary: "Connect Genesis 1, Psalm 33, Isaiah 55, and John 1 without turning God's Word into another divine being.",
    category: "God and Christ",
    keyScriptures: ["Genesis 1:1–3", "Psalm 33:6", "John 1:1–14"],
    accent: "WORD"
  },
  {
    slug: "the-son-of-god",
    title: "The Son of God",
    claim: "The Son was begotten in time through the incarnation and is the genuine human life of Jesus Christ.",
    summary: "Let Luke and Galatians define why Jesus is called the Son while Hebrews and John establish his deity.",
    category: "God and Christ",
    keyScriptures: ["Luke 1:35", "Galatians 4:4", "Hebrews 1:1–3"],
    accent: "SON"
  },
  {
    slug: "the-name-of-jesus",
    title: "The Name of Jesus",
    claim: "Jesus is the revealed saving name proclaimed and invoked by the apostles.",
    summary: "Follow the singular name from Matthew 28 through Luke 24 and every baptismal account in Acts.",
    category: "Salvation",
    keyScriptures: ["Matthew 28:19", "Luke 24:47", "Acts 2:38"],
    accent: "NAME"
  },
  {
    slug: "the-new-birth",
    title: "The New Birth",
    claim: "The apostolic response to the gospel includes repentance, water baptism, and receiving the Holy Ghost.",
    summary: "Read John 3 and Acts 2 together as one salvation message rather than competing formulas.",
    category: "Salvation",
    keyScriptures: ["John 3:3–5", "Acts 2:38", "Titus 3:5"],
    accent: "BORN"
  },
  {
    slug: "right-hand-of-god",
    title: "The Right Hand of God",
    claim: "The right hand is biblical authority and exaltation language, not a second throne beside God.",
    summary: "Use Scripture's own symbolic language to understand Christ's exalted authority and mediatorial reign.",
    category: "Biblical interpretation",
    keyScriptures: ["Psalm 110:1", "Acts 2:32–36", "1 Corinthians 15:24–28"],
    accent: "POWER"
  }
];

export const answers: Answer[] = [
  {
    slug: "is-jesus-god",
    question: "Is Jesus God?",
    shortAnswer: "Yes. Scripture identifies Jesus as God while also presenting him as genuinely human for our salvation.",
    summary: "The New Testament applies divine identity, works, worship, and titles to Jesus Christ.",
    topicSlug: "jesus-is-god",
    scriptures: ["John 1:1–14", "John 20:28", "Colossians 2:9", "Hebrews 1:8–9"],
    sections: [
      { heading: "Start with what the text says", paragraphs: ["John calls the Word God and says the Word was made flesh. Thomas addresses the risen Jesus as “My Lord and my God.” Hebrews addresses the Son as God."] },
      { heading: "Do not erase his humanity", paragraphs: ["Jesus could hunger, suffer, pray, obey, and die because the incarnation was real. Those human experiences do not cancel the identity of the Spirit dwelling in him."], scripture: { reference: "2 Corinthians 5:19", text: "God was in Christ, reconciling the world unto himself." } }
    ]
  },
  {
    slug: "is-jesus-the-father",
    question: "Is Jesus the Father?",
    shortAnswer: "Jesus is not the Father as to his humanity as the Son, yet the Father is fully revealed and dwelling in him.",
    summary: "The Bible preserves the Father and Son distinction without presenting two Gods or two divine Spirits.",
    topicSlug: "the-father-in-the-son",
    scriptures: ["John 14:9–11", "Isaiah 9:6", "2 Corinthians 5:19"],
    sections: [
      { heading: "Use Jesus' own explanation", paragraphs: ["Jesus said that seeing him was seeing the Father, then explained that the Father dwelling in him did the works."] },
      { heading: "Keep the incarnation intact", paragraphs: ["The Son is the man Christ Jesus, born of Mary, who lived in real relation to God. The Father is the eternal Spirit revealed through that human life."] }
    ]
  },
  {
    slug: "why-did-jesus-pray",
    question: "Why did Jesus pray if he is God?",
    shortAnswer: "Jesus prayed from his genuine human life as the Son, not because a second divine God needed help from the first.",
    summary: "Prayer proves the incarnation was real. It does not prove that God is divided into multiple divine centers.",
    topicSlug: "the-son-of-god",
    scriptures: ["Hebrews 5:7", "John 17:1–5", "1 Timothy 2:5"],
    sections: [
      { heading: "Prayer belongs to his humanity", paragraphs: ["Jesus truly lived as a man under the law, dependent upon God, tempted, obedient, and able to suffer."] },
      { heading: "God was still fully present in him", paragraphs: ["The Gospel that records Jesus praying also records him saying the Father dwelt in him and that whoever saw him saw the Father."] }
    ]
  },
  {
    slug: "who-was-jesus-praying-to",
    question: "Who was Jesus praying to?",
    shortAnswer: "The man Christ Jesus prayed to the eternal God who was his Father and who also dwelt in him.",
    summary: "The incarnate Son lived a real human relationship to God.",
    topicSlug: "the-son-of-god",
    scriptures: ["Luke 22:42", "John 14:10", "Hebrews 5:7"],
    sections: [
      { heading: "A real human relationship", paragraphs: ["As man, Jesus possessed a human will, human consciousness, and genuine dependence. His prayers were not staged conversations."] },
      { heading: "One God remained indivisible", paragraphs: ["The Father was not absent from Christ while receiving Christ's prayers. Jesus said the Father was in him doing the works."] }
    ]
  },
  {
    slug: "did-the-son-exist-eternally",
    question: "Did the Son exist eternally?",
    shortAnswer: "The one who became the Son is eternally God, but Scripture connects sonship to the incarnation, birth, and redemptive mission.",
    summary: "The eternal Word was God. The Son was born, given, made of a woman, and sent in the likeness of sinful flesh.",
    topicSlug: "the-son-of-god",
    scriptures: ["Luke 1:35", "Galatians 4:4", "John 1:14"],
    sections: [
      { heading: "Distinguish identity from role", paragraphs: ["Jesus did not begin to exist at Bethlehem. The divine identity revealed in him is eternal. Sonship describes the incarnate life brought forth in time."] },
      { heading: "Let Scripture choose the terms", paragraphs: ["The Bible explicitly calls the Word eternal and explicitly says the Son was born and given."] }
    ]
  },
  {
    slug: "why-is-jesus-called-son-of-god",
    question: "Why is Jesus called the Son of God?",
    shortAnswer: "Because he was conceived by the Holy Ghost and born of Mary as the holy human manifestation through whom God saved us.",
    summary: "Luke 1:35 directly connects the title Son of God to the miraculous conception.",
    topicSlug: "the-son-of-god",
    scriptures: ["Luke 1:35", "Matthew 1:20–23", "Galatians 4:4"],
    sections: [
      { heading: "Luke gives the cause", paragraphs: ["The angel says “therefore” the holy thing born would be called the Son of God. The title is tied to what happened in Mary's womb."] },
      { heading: "Son does not mean lesser deity", paragraphs: ["The Son is the image of the invisible God and the bodily dwelling of all divine fullness."] }
    ]
  },
  {
    slug: "is-the-holy-ghost-another-person",
    question: "Is the Holy Ghost another person beside the Father?",
    shortAnswer: "The Holy Ghost is God's own Spirit in holy action and presence, not another divine Spirit alongside the Father.",
    summary: "Scripture moves between Spirit of God, Spirit of the Father, Spirit of Christ, and Holy Ghost because one Spirit is being described.",
    topicSlug: "god-is-one",
    scriptures: ["Matthew 10:20", "Romans 8:9–11", "Ephesians 4:4"],
    sections: [
      { heading: "One Spirit", paragraphs: ["Paul describes the same indwelling presence as the Spirit of God and the Spirit of Christ."] },
      { heading: "The distinction is functional", paragraphs: ["Holy Ghost names God as he moves, fills, sanctifies, speaks, and dwells in believers."] }
    ]
  },
  {
    slug: "what-does-right-hand-of-god-mean",
    question: "What does the right hand of God mean?",
    shortAnswer: "It means divine power, authority, victory, and exalted rule.",
    summary: "Biblical right-hand language communicates position and authority rather than placing two divine bodies on adjacent seats.",
    topicSlug: "right-hand-of-god",
    scriptures: ["Exodus 15:6", "Psalm 118:16", "Acts 2:33–36"],
    sections: [
      { heading: "Scripture defines its own symbol", paragraphs: ["God's right hand dashes enemies, creates salvation, and is exalted. These passages are not descriptions of a literal divine limb."] },
      { heading: "Christ is exalted", paragraphs: ["Jesus at God's right hand means the crucified and risen Messiah has received all authority."] }
    ]
  },
  {
    slug: "does-matthew-28-19-contradict-acts-2-38",
    question: "Does Matthew 28:19 contradict Acts 2:38?",
    shortAnswer: "No. Matthew commands baptism in the singular name, and Acts records the apostles invoking that name as Jesus Christ.",
    summary: "Luke 24 connects Jesus' command to repentance and remission of sins preached in his name.",
    topicSlug: "the-name-of-jesus",
    scriptures: ["Matthew 28:19", "Luke 24:47", "Acts 2:38", "Acts 19:5"],
    sections: [
      { heading: "The command says name, singular", paragraphs: ["Father, Son, and Holy Ghost are revelatory titles. The apostles understood the one saving name to be Jesus."] },
      { heading: "Acts is the inspired execution", paragraphs: ["Every recorded apostolic baptism that names a formula points to Jesus Christ or the Lord Jesus."] }
    ]
  },
  {
    slug: "why-baptize-in-jesus-name",
    question: "Why did the apostles baptize in Jesus' name?",
    shortAnswer: "Because Jesus is the saving name given under heaven, and baptism identifies the believer with his death, burial, and resurrection.",
    summary: "Jesus-name baptism is the consistent apostolic pattern in Acts.",
    topicSlug: "the-name-of-jesus",
    scriptures: ["Acts 2:38", "Acts 8:16", "Acts 10:48", "Acts 19:5"],
    sections: [
      { heading: "The recorded pattern", paragraphs: ["Jews, Samaritans, Gentiles, and disciples of John were directed into baptism connected explicitly with the name of Jesus."] },
      { heading: "The theological meaning", paragraphs: ["Baptism is into Christ, into his death, and into the name in which salvation is found."] }
    ]
  },
  {
    slug: "was-the-thief-on-the-cross-baptized",
    question: "What about the thief on the cross?",
    shortAnswer: "The thief died before the new-covenant gospel response was commanded and preached after Christ's death and resurrection.",
    summary: "His salvation under Christ's earthly authority does not cancel the later command given to the church.",
    topicSlug: "the-new-birth",
    scriptures: ["Luke 23:39–43", "Luke 24:46–47", "Acts 2:37–38"],
    sections: [
      { heading: "Place the event in covenant history", paragraphs: ["Jesus had not yet died, been buried, risen, or commissioned the apostles to preach the completed gospel to all nations."] },
      { heading: "Follow the post-resurrection command", paragraphs: ["After the resurrection, “What shall we do?” receives the apostolic answer of repentance, baptism in Jesus' name, and the Holy Ghost."] }
    ]
  },
  {
    slug: "does-first-corinthians-15-end-jesus",
    question: "Does 1 Corinthians 15 mean Jesus stops existing?",
    shortAnswer: "No. The mediatorial kingdom and subjection of the Son reach their goal, but the risen Jesus remains the visible revelation of God.",
    summary: "The passage describes the completion of redemptive administration, not the erasure of Jesus Christ.",
    topicSlug: "right-hand-of-god",
    scriptures: ["1 Corinthians 15:24–28", "Revelation 22:3–4", "Hebrews 7:24"],
    sections: [
      { heading: "What ends", paragraphs: ["The Son's mediatorial reign over enemies reaches completion when death is destroyed."] },
      { heading: "What remains", paragraphs: ["Jesus remains the glorified Lamb and eternal high priest. The role reaches fulfillment; the risen Christ is not annihilated."] }
    ]
  }
];

export const articles: Article[] = [
  {
    slug: "the-one-god-revealed-in-jesus-christ",
    title: "The One God Revealed in Jesus Christ",
    eyebrow: "Doctrine",
    summary: "A Scripture-first framework for holding together God's absolute oneness, Christ's full deity, and Christ's genuine humanity.",
    topicSlug: "jesus-is-god",
    readingMinutes: 9,
    publishedAt: "2026-08-03",
    sections: [
      { heading: "Begin where Scripture begins", paragraphs: ["The biblical confession is that YHWH is one, alone created all things, and knows no God beside himself.", "Any doctrine of Christ must preserve that confession rather than quietly changing the meaning of one."] },
      { heading: "The invisible God made himself known", paragraphs: ["No man has seen God as Spirit. Yet the Son is the image of the invisible God and the express image of his person."], scripture: { reference: "Colossians 2:9", text: "For in him dwelleth all the fulness of the Godhead bodily." } },
      { heading: "Father and Son are not interchangeable terms", paragraphs: ["Father identifies the eternal Spirit. Son identifies the holy human life conceived and born in time. The distinction is real, but it does not divide God."] }
    ]
  },
  {
    slug: "john-1-and-genesis-1",
    title: "John 1 and Genesis 1",
    eyebrow: "Passage study",
    summary: "John's opening reveals the eternal Word of the one Creator becoming flesh.",
    topicSlug: "the-word-became-flesh",
    readingMinutes: 8,
    publishedAt: "2026-08-01",
    sections: [
      { heading: "The deliberate return to Genesis", paragraphs: ["John opens with “In the beginning” because he wants the reader to hear Genesis. God creates by speaking."] },
      { heading: "The Word was God", paragraphs: ["God's Word belongs to God's own identity, wisdom, purpose, and self-expression."] },
      { heading: "The Word became flesh", paragraphs: ["What God eternally was in self-expression came into human existence as Jesus Christ."] }
    ]
  },
  {
    slug: "the-father-dwells-in-the-son",
    title: "The Father Dwells in the Son",
    eyebrow: "Bible study",
    summary: "John 14 gives Jesus' own explanation of the Father-Son relationship.",
    topicSlug: "the-father-in-the-son",
    readingMinutes: 7,
    publishedAt: "2026-07-30",
    sections: [
      { heading: "Philip's request", paragraphs: ["Philip asks to see the Father. Jesus answers with himself."] },
      { heading: "Jesus explains the works", paragraphs: ["He says the Father dwelling in him does the works."] },
      { heading: "The distinction remains", paragraphs: ["The one speaking is the Son in genuine humanity. The one dwelling in him is the Father."] }
    ]
  },
  {
    slug: "why-jesus-prayed",
    title: "Why Jesus Prayed",
    eyebrow: "Answer expanded",
    summary: "Prayer reveals Christ's humanity while John 14 preserves the fullness of God's presence in him.",
    topicSlug: "the-son-of-god",
    readingMinutes: 6,
    publishedAt: "2026-07-27",
    sections: [
      { heading: "Not a performance", paragraphs: ["Jesus did not pretend to depend on God. He grew, suffered, learned obedience, and offered prayers."] },
      { heading: "Not two Gods", paragraphs: ["Prayer shows the man Christ Jesus fulfilling his human vocation in perfect submission."] },
      { heading: "Read all the evidence", paragraphs: ["The praying Jesus also forgives sins, receives worship, commands nature, and says the Father is in him."] }
    ]
  },
  {
    slug: "matthew-28-19-and-the-name-of-jesus",
    title: "Matthew 28:19 and the Name of Jesus",
    eyebrow: "Passage study",
    summary: "Why the singular name in Matthew and the Jesus-name baptisms in Acts belong to the same command.",
    topicSlug: "the-name-of-jesus",
    readingMinutes: 8,
    publishedAt: "2026-07-24",
    sections: [
      { heading: "One name", paragraphs: ["Jesus did not say names. He gave one name associated with Father, Son, and Holy Ghost."] },
      { heading: "Luke supplies the bridge", paragraphs: ["Luke says repentance and remission of sins would be preached in Jesus' name."] },
      { heading: "Acts records the obedience", paragraphs: ["At Jerusalem Peter commands baptism in the name of Jesus Christ."] }
    ]
  },
  {
    slug: "understanding-the-son-of-god",
    title: "Understanding the Son of God",
    eyebrow: "Doctrine",
    summary: "A biblical definition of sonship that protects both the deity and humanity of Jesus Christ.",
    topicSlug: "the-son-of-god",
    readingMinutes: 10,
    publishedAt: "2026-07-20",
    sections: [
      { heading: "The Son was born", paragraphs: ["Isaiah says the child would be born and the Son given. Luke connects the title to the miraculous conception."] },
      { heading: "The one born is more than a man", paragraphs: ["The child is called Mighty God and Everlasting Father."] },
      { heading: "Sonship is redemptive", paragraphs: ["Through the Son, God enters our condition, obeys, dies, rises, mediates, and brings the kingdom to its goal."] }
    ]
  }
];

export const scriptures: ScriptureEntry[] = [
  {
    slug: "deuteronomy-6-4", path: "deuteronomy/6/4", reference: "Deuteronomy 6:4",
    text: "Hear, O Israel: The LORD our God is one LORD.", translation: "KJV",
    mainPoint: "Israel's confession identifies YHWH as one, not merely united.",
    context: "Moses prepares Israel to live faithfully among nations with many gods.",
    apostolicConnection: "Jesus repeats this confession as the first commandment in Mark 12:29.",
    topicSlugs: ["god-is-one"], related: ["Isaiah 44:6", "Mark 12:29"]
  },
  {
    slug: "isaiah-44-6", path: "isaiah/44/6", reference: "Isaiah 44:6",
    text: "I am the first, and I am the last; and beside me there is no God.", translation: "KJV",
    mainPoint: "YHWH excludes any divine being beside himself.",
    context: "Isaiah contrasts the living God with idols.",
    apostolicConnection: "Revelation applies First and Last language to Jesus Christ.",
    topicSlugs: ["god-is-one", "jesus-is-god"], related: ["Revelation 1:17–18", "Revelation 22:13"]
  },
  {
    slug: "isaiah-9-6", path: "isaiah/9/6", reference: "Isaiah 9:6",
    text: "For unto us a child is born, unto us a son is given... The mighty God, The everlasting Father, The Prince of Peace.", translation: "KJV",
    mainPoint: "The born child bears titles that belong to God himself.",
    context: "Isaiah announces the Davidic ruler whose kingdom will have no end.",
    apostolicConnection: "The humanity is born and given; the divine identity is Mighty God and Everlasting Father.",
    topicSlugs: ["jesus-is-god", "the-son-of-god"], related: ["Luke 1:31–35", "Matthew 1:23"]
  },
  {
    slug: "john-1-1-14", path: "john/1/1-14", reference: "John 1:1–14",
    text: "In the beginning was the Word, and the Word was with God, and the Word was God... And the Word was made flesh.", translation: "KJV",
    mainPoint: "God's eternal Word was God and became flesh.",
    context: "John intentionally echoes Genesis before identifying the incarnate Word.",
    apostolicConnection: "The passage moves from God's own Word to genuine human manifestation.",
    topicSlugs: ["the-word-became-flesh", "jesus-is-god"], related: ["Genesis 1:1–3", "Psalm 33:6"]
  },
  {
    slug: "john-14-9-11", path: "john/14/9-11", reference: "John 14:9–11",
    text: "He that hath seen me hath seen the Father... the Father that dwelleth in me, he doeth the works.", translation: "KJV",
    mainPoint: "Jesus is the visible revelation of the Father dwelling in him.",
    context: "Philip asks Jesus to show the disciples the Father.",
    apostolicConnection: "Jesus explains the distinction through indwelling and revelation.",
    misunderstanding: "Seeing the Father in Jesus does not erase the Son's humanity.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["Colossians 1:15", "2 Corinthians 5:19"]
  },
  {
    slug: "john-20-28", path: "john/20/28", reference: "John 20:28",
    text: "And Thomas answered and said unto him, My Lord and my God.", translation: "KJV",
    mainPoint: "Thomas directly confesses the risen Jesus as Lord and God.",
    context: "Thomas responds after seeing the wounds of the resurrected Christ.",
    apostolicConnection: "John places this confession near the climax of his Gospel.",
    topicSlugs: ["jesus-is-god"], related: ["John 1:1", "John 20:31"]
  },
  {
    slug: "colossians-1-15", path: "colossians/1/15", reference: "Colossians 1:15",
    text: "Who is the image of the invisible God, the firstborn of every creature.", translation: "KJV",
    mainPoint: "The invisible God is made known in the visible Christ.",
    context: "Paul describes Christ's supremacy in creation and redemption.",
    apostolicConnection: "Image language explains revelation, not a second divine copy.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["Hebrews 1:3", "John 14:9"]
  },
  {
    slug: "colossians-2-9", path: "colossians/2/9", reference: "Colossians 2:9",
    text: "For in him dwelleth all the fulness of the Godhead bodily.", translation: "KJV",
    mainPoint: "All divine fullness dwells bodily in Christ.",
    context: "Paul warns believers not to be moved away from Christ.",
    apostolicConnection: "Jesus does not contain one member of a divided Godhead.",
    topicSlugs: ["jesus-is-god", "the-father-in-the-son"], related: ["Colossians 1:19", "John 14:10"]
  },
  {
    slug: "second-corinthians-5-19", path: "2-corinthians/5/19", reference: "2 Corinthians 5:19",
    text: "God was in Christ, reconciling the world unto himself.", translation: "KJV",
    mainPoint: "The saving actor in Christ was God reconciling the world to himself.",
    context: "Paul explains the ministry and message of reconciliation.",
    apostolicConnection: "The verse states the incarnation's saving reality without a second divine being.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["John 14:10", "1 Timothy 3:16"]
  },
  {
    slug: "hebrews-1-8-9", path: "hebrews/1/8-9", reference: "Hebrews 1:8–9",
    text: "But unto the Son he saith, Thy throne, O God, is for ever and ever.", translation: "KJV",
    mainPoint: "The Son is directly addressed as God while his anointed messianic role is affirmed.",
    context: "Hebrews contrasts the Son with angels.",
    apostolicConnection: "The passage holds deity and messianic humanity together.",
    topicSlugs: ["jesus-is-god", "the-son-of-god"], related: ["Psalm 45:6–7", "Hebrews 1:3"]
  },
  {
    slug: "luke-1-35", path: "luke/1/35", reference: "Luke 1:35",
    text: "The Holy Ghost shall come upon thee... therefore also that holy thing which shall be born of thee shall be called the Son of God.", translation: "KJV",
    mainPoint: "Son of God is connected directly to the miraculous conception and birth.",
    context: "Gabriel explains to Mary how she will conceive.",
    apostolicConnection: "The same Spirit identified as Holy Ghost and power of the Highest brings forth the Son.",
    topicSlugs: ["the-son-of-god", "god-is-one"], related: ["Matthew 1:20", "Galatians 4:4"]
  },
  {
    slug: "matthew-28-19", path: "matthew/28/19", reference: "Matthew 28:19",
    text: "Baptizing them in the name of the Father, and of the Son, and of the Holy Ghost.", translation: "KJV",
    mainPoint: "Jesus commands baptism into one singular name.",
    context: "The risen Jesus sends the apostles to teach all nations.",
    apostolicConnection: "Luke and Acts show that the apostles proclaimed this name as Jesus.",
    topicSlugs: ["the-name-of-jesus"], related: ["Luke 24:47", "Acts 2:38"]
  },
  {
    slug: "acts-2-38", path: "acts/2/38", reference: "Acts 2:38",
    text: "Repent, and be baptized every one of you in the name of Jesus Christ for the remission of sins, and ye shall receive the gift of the Holy Ghost.", translation: "KJV",
    mainPoint: "The apostolic response joins repentance, Jesus-name baptism, forgiveness, and the Holy Ghost.",
    context: "Peter answers convicted hearers on Pentecost.",
    apostolicConnection: "This is the first inspired answer to “What shall we do?” after the gospel is preached.",
    topicSlugs: ["the-name-of-jesus", "the-new-birth"], related: ["Acts 8:16", "Acts 19:5"]
  },
  {
    slug: "acts-19-5", path: "acts/19/5", reference: "Acts 19:5",
    text: "When they heard this, they were baptized in the name of the Lord Jesus.", translation: "KJV",
    mainPoint: "People previously baptized under John's ministry were baptized in Jesus' name.",
    context: "Paul encounters disciples at Ephesus.",
    apostolicConnection: "Their prior baptism did not make the name and gospel fulfillment irrelevant.",
    topicSlugs: ["the-name-of-jesus", "the-new-birth"], related: ["Acts 2:38", "Acts 8:16"]
  },
  {
    slug: "first-corinthians-15-24-28", path: "1-corinthians/15/24-28", reference: "1 Corinthians 15:24–28",
    text: "Then cometh the end, when he shall have delivered up the kingdom to God, even the Father... that God may be all in all.", translation: "KJV",
    mainPoint: "Christ's mediatorial kingdom reaches its appointed goal when every enemy is defeated.",
    context: "Paul explains resurrection order and the final destruction of death.",
    apostolicConnection: "The Son's office reaches its purpose without implying that Jesus ceases to exist.",
    topicSlugs: ["right-hand-of-god", "the-son-of-god"], related: ["Revelation 22:3–4", "Hebrews 7:24"]
  }
];

export const pathways: Pathway[] = [
  {
    slug: "who-is-jesus-christ",
    appSlug: "jesus-is-god",
    title: "Who Is Jesus Christ?",
    summary: "Move from the one God of Israel to the full revelation of God in Jesus Christ.",
    estimatedMinutes: 18,
    level: "Foundational",
    topicSlug: "jesus-is-god",
    steps: [
      { title: "Confess the one God", reference: "Deuteronomy 6:4", explanation: "Establish the Bible's confession before interpreting Christology." },
      { title: "No God beside YHWH", reference: "Isaiah 44:6", explanation: "The first and the last excludes a second divine being beside God." },
      { title: "The Word was God", reference: "John 1:1–14", explanation: "God's eternal self-expression becomes flesh." },
      { title: "See the Father in Christ", reference: "John 14:9–11", explanation: "Jesus explains revelation through the Father dwelling in him." },
      { title: "All fullness bodily", reference: "Colossians 2:9", explanation: "Christ is the bodily dwelling of all divine fullness." }
    ]
  },
  {
    slug: "the-father-revealed-in-the-son",
    appSlug: "father-dwells-in-son",
    title: "The Father Revealed in the Son",
    summary: "A focused study of image, indwelling, revelation, and reconciliation.",
    estimatedMinutes: 14,
    level: "Intermediate",
    topicSlug: "the-father-in-the-son",
    steps: [
      { title: "The invisible God", reference: "Colossians 1:15", explanation: "Begin with divine invisibility and the meaning of image." },
      { title: "Philip asks to see", reference: "John 14:9–11", explanation: "Jesus points to himself and the Father's indwelling works." },
      { title: "God in Christ", reference: "2 Corinthians 5:19", explanation: "God himself is the saving actor in Christ." },
      { title: "Fullness bodily", reference: "Colossians 2:9", explanation: "The relationship reaches its clearest compact statement." }
    ]
  },
  {
    slug: "baptism-in-the-name-of-jesus",
    appSlug: "baptism-in-jesus-name",
    title: "Baptism in the Name of Jesus",
    summary: "Follow the command, the apostolic execution, and the theological meaning of the name.",
    estimatedMinutes: 16,
    level: "Foundational",
    topicSlug: "the-name-of-jesus",
    steps: [
      { title: "One name in the commission", reference: "Matthew 28:19", explanation: "Notice the singular word name." },
      { title: "Preached in his name", reference: "Luke 24:47", explanation: "Luke connects the commission to remission in Jesus' name." },
      { title: "The first apostolic answer", reference: "Acts 2:38", explanation: "Peter commands baptism in the name of Jesus Christ." },
      { title: "The pattern continues", reference: "Acts 19:5", explanation: "Ephesus confirms this was not limited to Pentecost." }
    ]
  }
];

export type MediaItem = {
  slug: string;
  title: string;
  type: "Music" | "Short" | "Teaching";
  summary: string;
  url: string | null;
  duration: string;
};

export const media: MediaItem[] = [
  { slug: "presenting-jesus-christ", title: "Presenting Jesus Christ", type: "Music", summary: "A lyrical introduction to the biblical identity and saving work of Jesus Christ.", url: null, duration: "3:18" },
  { slug: "john-14-in-sixty-seconds", title: "John 14 in Sixty Seconds", type: "Short", summary: "Why “he that hath seen me hath seen the Father” matters.", url: null, duration: "1:00" },
  { slug: "why-the-apostles-used-the-name", title: "Why the Apostles Used the Name", type: "Teaching", summary: "Matthew 28, Luke 24, and Acts read as one commission.", url: null, duration: "12:42" }
];

export function topicBySlug(slug: string) { return topics.find((item) => item.slug === slug); }
export function answerBySlug(slug: string) { return answers.find((item) => item.slug === slug); }
export function articleBySlug(slug: string) { return articles.find((item) => item.slug === slug); }
export function scriptureByPath(path: string) { return scriptures.find((item) => item.path === path); }
export function pathwayBySlug(slug: string) { return pathways.find((item) => item.slug === slug); }

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function score(query: string, title: string, body: string) {
  const q = normalize(query);
  if (!q) return 0;
  const t = normalize(title);
  const b = normalize(body);
  let result = t === q ? 100 : t.includes(q) ? 45 : 0;
  for (const term of q.split(" ")) {
    if (t.includes(term)) result += 10;
    if (b.includes(term)) result += 3;
  }
  return result;
}

export function searchContent(query: string) {
  const results: { kind: string; title: string; summary: string; href: string; score: number }[] = [];
  topics.forEach((item) => {
    const rank = score(query, item.title, `${item.claim} ${item.summary} ${item.keyScriptures.join(" ")}`);
    if (rank) results.push({ kind: "Topic", title: item.title, summary: item.claim, href: `/topics/${item.slug}`, score: rank });
  });
  answers.forEach((item) => {
    const rank = score(query, item.question, `${item.shortAnswer} ${item.summary} ${item.scriptures.join(" ")}`);
    if (rank) results.push({ kind: "Answer", title: item.question, summary: item.shortAnswer, href: `/answers/${item.slug}`, score: rank + 5 });
  });
  articles.forEach((item) => {
    const rank = score(query, item.title, `${item.summary} ${item.sections.flatMap((section) => section.paragraphs).join(" ")}`);
    if (rank) results.push({ kind: "Article", title: item.title, summary: item.summary, href: `/articles/${item.slug}`, score: rank });
  });
  scriptures.forEach((item) => {
    const rank = score(query, item.reference, `${item.text} ${item.mainPoint} ${item.apostolicConnection}`);
    if (rank) results.push({ kind: "Scripture", title: item.reference, summary: item.mainPoint, href: `/scripture/${item.path}`, score: rank + 8 });
  });
  pathways.forEach((item) => {
    const rank = score(query, item.title, `${item.summary} ${item.steps.map((step) => `${step.reference} ${step.explanation}`).join(" ")}`);
    if (rank) results.push({ kind: "Pathway", title: item.title, summary: item.summary, href: `/pathways/${item.slug}`, score: rank });
  });
  return results.sort((a, b) => b.score - a.score).slice(0, 30);
}
