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
    keyScriptures: ["John 1:1–14", "Colossians 2:9", "Hebrews 1:8–9"],
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
    summary: "A Scripture-first case for God's absolute oneness, Christ's full deity, and Christ's genuine humanity.",
    topicSlug: "jesus-is-god",
    readingMinutes: 12,
    publishedAt: "2026-08-03",
    sections: [
      { heading: "Start with the confession Scripture repeats", paragraphs: ["We do not begin with a philosophical model and then force the Bible to fit it. We begin where Scripture begins: there is one God, YHWH, and there is none beside him.", "Deuteronomy 6:4 is not a warm-up verse that becomes less important once we reach the New Testament. Jesus repeats it in Mark 12:29 as the first commandment. Isaiah says the same God is the first and the last, the only Creator, and the only Savior."], scripture: { reference: "Deuteronomy 6:4", text: "Hear, O Israel: The LORD our God is one LORD." } },
      { heading: "Jesus is not placed beside that God", paragraphs: ["The New Testament does not introduce Jesus as another divine being standing next to YHWH. It reveals the one God in flesh.", "John says the Word was God and that the Word was made flesh. Thomas looks at the risen Jesus and says, “My Lord and my God.” Hebrews addresses the Son as God. Colossians says all the fullness of the Godhead dwells in him bodily. Those are not weak statements. They are direct."], scripture: { reference: "Colossians 2:9", text: "For in him dwelleth all the fulness of the Godhead bodily." } },
      { heading: "The incarnation explains the distinction", paragraphs: ["The Father is the eternal invisible Spirit. The Son is the holy human life conceived in Mary and born in time. That distinction is real because the incarnation is real.", "Jesus could pray, obey, suffer, hunger, and die because he was genuinely human. At the same time, the Father was dwelling in him, speaking through him, and doing the works. The distinction does not require two Gods. It requires us to take both deity and humanity seriously."], scripture: { reference: "John 14:9–11", text: "He that hath seen me hath seen the Father... the Father that dwelleth in me, he doeth the works." } },
      { heading: "Read the whole biblical case", paragraphs: ["A strong doctrine of Christ should not need to explain away the oneness of God, the deity of Jesus, or the humanity of Jesus. It should allow every one of those truths to remain fully stated.", "The one God did not send another God to save us. God was in Christ, reconciling the world unto himself. That is the center of the biblical confession: one God, revealed and present in Jesus Christ for our salvation."], scripture: { reference: "2 Corinthians 5:19", text: "God was in Christ, reconciling the world unto himself." } }
    ]
  },
  {
    slug: "john-1-and-genesis-1",
    title: "John 1 and Genesis 1",
    eyebrow: "Passage study",
    summary: "John's opening reveals the eternal Word of the one Creator becoming flesh.",
    topicSlug: "the-word-became-flesh",
    readingMinutes: 10,
    publishedAt: "2026-08-01",
    sections: [
      { heading: "John intentionally takes us back to Genesis", paragraphs: ["John opens with “In the beginning” because he wants us to hear Genesis before we hear anything else. Genesis introduces one God creating by speaking. John returns to that same beginning and identifies the Word with God himself.", "The point is not that a second divine being helped God create. Psalm 33:6 says the heavens were made by the word of the LORD and by the breath of his mouth. God's Word is his own self-expression, purpose, wisdom, and power going forth."], scripture: { reference: "Genesis 1:1–3", text: "In the beginning God created the heaven and the earth... And God said, Let there be light: and there was light." } },
      { heading: "The Word was with God and was God", paragraphs: ["John preserves distinction without creating another God. The Word was with God because God's self-expression belongs to him and proceeds from him. The Word was God because it was not a second identity beside him.", "This is why Scripture can speak of God's Word being sent, accomplishing his purpose, and returning to him without describing another divine person walking away from God."], scripture: { reference: "John 1:1", text: "In the beginning was the Word, and the Word was with God, and the Word was God." } },
      { heading: "The Word became flesh", paragraphs: ["John 1:14 is the turning point. What God eternally was in Word became a real human life. The text does not say an eternal Son became flesh. It says the Word became flesh.", "Jesus did not begin to exist in Bethlehem as to his divine identity. The one revealed in him is eternal God. But the flesh, the human life, the Son who was born and given, entered history through Mary."], scripture: { reference: "John 1:14", text: "And the Word was made flesh, and dwelt among us." } },
      { heading: "The Creator entered his creation", paragraphs: ["The same God who spoke light into existence came among us in genuine humanity. That is why John can move from creation to incarnation without introducing a second Creator.", "The Word became flesh so that the invisible God could be known, seen, heard, touched, rejected, crucified, and raised in the person of Jesus Christ."], scripture: { reference: "Colossians 1:15", text: "Who is the image of the invisible God." } }
    ]
  },
  {
    slug: "the-father-dwells-in-the-son",
    title: "The Father Dwells in the Son",
    eyebrow: "Bible study",
    summary: "John 14 gives Jesus' own explanation of the Father-Son relationship.",
    topicSlug: "the-father-in-the-son",
    readingMinutes: 9,
    publishedAt: "2026-07-30",
    sections: [
      { heading: "Philip asks for the Father", paragraphs: ["Philip does not ask Jesus for a theory. He says, “Lord, shew us the Father.” Jesus answers by pointing to himself: “He that hath seen me hath seen the Father.”", "That answer should be allowed to carry its full weight. Jesus is not saying that he resembles the Father from a distance. He is saying the invisible Father is being made known in him."], scripture: { reference: "John 14:8–9", text: "Lord, shew us the Father... he that hath seen me hath seen the Father." } },
      { heading: "Jesus explains how this is true", paragraphs: ["Jesus immediately explains his statement: “The Father that dwelleth in me, he doeth the works.” The relationship is one of indwelling and revelation.", "The Son is the visible, speaking, suffering human life. The Father is the invisible Spirit dwelling in that life. This preserves the distinction without dividing God into separate divine beings."], scripture: { reference: "John 14:10–11", text: "The Father that dwelleth in me, he doeth the works." } },
      { heading: "The same pattern appears elsewhere", paragraphs: ["Paul says God was in Christ reconciling the world unto himself. Colossians calls Christ the image of the invisible God. Hebrews calls him the express image of God's person.", "These passages do not present Jesus as one part of God. They present the one invisible God fully revealed and active in Christ."], scripture: { reference: "2 Corinthians 5:19", text: "God was in Christ, reconciling the world unto himself." } },
      { heading: "The distinction is real because the humanity is real", paragraphs: ["The one praying, obeying, and speaking is genuinely the Son. The one dwelling in him is genuinely the Father. We do not erase either side.", "But the Bible never asks us to turn that distinction into two Gods, two divine Spirits, or two separate divine identities. Jesus gives us his own explanation: the Father is in him, and seeing him is seeing the Father."], scripture: { reference: "Colossians 2:9", text: "For in him dwelleth all the fulness of the Godhead bodily." } }
    ]
  },
  {
    slug: "why-jesus-prayed",
    title: "Why Jesus Prayed",
    eyebrow: "Answer expanded",
    summary: "Prayer reveals Christ's humanity while John 14 preserves the fullness of God's presence in him.",
    topicSlug: "the-son-of-god",
    readingMinutes: 9,
    publishedAt: "2026-07-27",
    sections: [
      { heading: "Jesus did not pretend to be human", paragraphs: ["Jesus did not perform humanity for an audience. He truly grew, became tired, felt sorrow, suffered temptation, learned obedience, and prayed.", "If his prayers were fake, the incarnation would be fake. Hebrews says he offered prayers and supplications with strong crying and tears. That is genuine human dependence."], scripture: { reference: "Hebrews 5:7", text: "Who in the days of his flesh... offered up prayers and supplications with strong crying and tears." } },
      { heading: "Prayer belongs to the Son's human life", paragraphs: ["The man Christ Jesus lived in perfect submission to God. He possessed a real human will and could say, “Not my will, but thine, be done.”", "This does not mean one divine God was praying to another divine God. It means the Son, in genuine humanity, prayed to the eternal God who was his Father."], scripture: { reference: "Luke 22:42", text: "Nevertheless not my will, but thine, be done." } },
      { heading: "The Father was not absent from him", paragraphs: ["The same Jesus who prayed also said the Father dwelt in him and did the works. The Father was not far away while the Son prayed. God was fully present in Christ.", "Prayer shows relationship within the incarnation: true humanity relating to the eternal Spirit. It does not require us to divide God into separate divine centers."], scripture: { reference: "John 14:10", text: "The Father that dwelleth in me, he doeth the works." } },
      { heading: "Read all the evidence together", paragraphs: ["The praying Jesus forgives sins, receives worship, commands creation, knows hearts, gives life, and is confessed as Lord and God.", "A complete doctrine must account for both sides. His prayers prove he was truly man. His divine works and identity prove that the one revealed in him is truly God."], scripture: { reference: "1 Timothy 2:5", text: "There is one God, and one mediator between God and men, the man Christ Jesus." } }
    ]
  },
  {
    slug: "matthew-28-19-and-the-name-of-jesus",
    title: "Matthew 28:19 and the Name of Jesus",
    eyebrow: "Passage study",
    summary: "Why the singular name in Matthew and the Jesus-name baptisms in Acts belong to the same command.",
    topicSlug: "the-name-of-jesus",
    readingMinutes: 10,
    publishedAt: "2026-07-24",
    sections: [
      { heading: "Jesus gave one name", paragraphs: ["Matthew 28:19 says “in the name,” singular. Father, Son, and Holy Ghost are not three names listed in the verse. They are the biblical ways God is known in relation to us.", "The question is not whether we honor the words of Jesus. The question is how the apostles, who heard him directly, understood and obeyed them."], scripture: { reference: "Matthew 28:19", text: "Baptizing them in the name of the Father, and of the Son, and of the Holy Ghost." } },
      { heading: "Luke gives the bridge", paragraphs: ["Luke records the same commission and says repentance and remission of sins would be preached in Jesus' name among all nations, beginning at Jerusalem.", "That statement connects the commission to the actual preaching that begins in Acts 2. We do not have to guess what name the apostles proclaimed."], scripture: { reference: "Luke 24:47", text: "Repentance and remission of sins should be preached in his name among all nations, beginning at Jerusalem." } },
      { heading: "Acts records the inspired obedience", paragraphs: ["At Pentecost Peter commands every hearer to be baptized in the name of Jesus Christ. Samaritans are baptized in the name of the Lord Jesus. Gentiles are commanded to be baptized in the name of the Lord. The disciples at Ephesus are baptized in the name of the Lord Jesus.", "Acts is not a record of the apostles repeatedly misunderstanding Jesus. It is the inspired record of how they carried out his command."], scripture: { reference: "Acts 2:38", text: "Repent, and be baptized every one of you in the name of Jesus Christ." } },
      { heading: "Matthew and Acts belong together", paragraphs: ["Matthew gives the command. Luke identifies the saving name. Acts records the execution.", "There is no contradiction unless we assume the apostles should have repeated the titles instead of invoking the name those titles reveal. The apostolic pattern is clear: baptism was administered in the name of Jesus Christ."], scripture: { reference: "Acts 19:5", text: "When they heard this, they were baptized in the name of the Lord Jesus." } }
    ]
  },
  {
    slug: "understanding-the-son-of-god",
    title: "Understanding the Son of God",
    eyebrow: "Doctrine",
    summary: "A biblical definition of sonship that protects both the deity and humanity of Jesus Christ.",
    topicSlug: "the-son-of-god",
    readingMinutes: 11,
    publishedAt: "2026-07-20",
    sections: [
      { heading: "Let Scripture define when the Son was given", paragraphs: ["Isaiah says a child would be born and a Son would be given. Galatians says God sent forth his Son, made of a woman. Luke connects the title Son of God directly to the miraculous conception.", "The one revealed in Jesus is eternal God. But sonship is tied to the incarnation, birth, and redemptive mission in time."], scripture: { reference: "Luke 1:35", text: "Therefore also that holy thing which shall be born of thee shall be called the Son of God." } },
      { heading: "The Son is genuine humanity", paragraphs: ["The Son could grow, obey, pray, suffer, die, rise, and mediate because the Son is the real human life of Jesus Christ.", "This does not make Jesus merely human. It explains how the eternal God truly entered our condition without ceasing to be God."], scripture: { reference: "Galatians 4:4", text: "God sent forth his Son, made of a woman, made under the law." } },
      { heading: "The one born is Mighty God", paragraphs: ["Isaiah does not separate the child from the divine identity. The child born and Son given is called Mighty God and Everlasting Father.", "That does not erase the Son's humanity. It tells us who is revealed in that humanity."], scripture: { reference: "Isaiah 9:6", text: "Unto us a child is born, unto us a son is given... The mighty God, The everlasting Father." } },
      { heading: "Sonship is redemptive", paragraphs: ["Through the Son, God obeys where humanity failed, bears our suffering, dies for our sins, rises in victory, mediates for us, and brings every enemy under his feet.", "The role reaches its goal, but Jesus Christ does not cease to exist. The risen Lamb remains the visible revelation of God forever."], scripture: { reference: "1 Corinthians 15:24–28", text: "Then cometh the end... that God may be all in all." } }
    ]
  }
];

export const scriptures: ScriptureEntry[] = [
  {
    slug: "genesis-1-1-3", path: "genesis/1/1-3", reference: "Genesis 1:1–3",
    text: "In the beginning God created the heaven and the earth... And God said, Let there be light: and there was light.", translation: "KJV",
    mainPoint: "The one Creator brings creation into being by his spoken Word.",
    context: "Genesis opens with God alone creating and speaking light into existence.",
    apostolicConnection: "John 1 intentionally returns to this beginning when identifying the Word that became flesh.",
    topicSlugs: ["the-word-became-flesh", "god-is-one"], related: ["Psalm 33:6", "John 1:1–14"]
  },
  {
    slug: "deuteronomy-6-4", path: "deuteronomy/6/4", reference: "Deuteronomy 6:4",
    text: "Hear, O Israel: The LORD our God is one LORD.", translation: "KJV",
    mainPoint: "Israel's confession identifies YHWH as one, not merely united.",
    context: "Moses prepares Israel to live faithfully among nations with many gods.",
    apostolicConnection: "Jesus repeats this confession as the first commandment in Mark 12:29.",
    topicSlugs: ["god-is-one"], related: ["Isaiah 44:6", "Mark 12:29"]
  },
  {
    slug: "exodus-15-6", path: "exodus/15/6", reference: "Exodus 15:6",
    text: "Thy right hand, O LORD, is become glorious in power: thy right hand, O LORD, hath dashed in pieces the enemy.", translation: "KJV",
    mainPoint: "God's right hand is biblical language for his victorious power.",
    context: "Moses celebrates YHWH's deliverance of Israel through the sea.",
    apostolicConnection: "Right-hand language should be interpreted by Scripture's own symbolic use before being treated as spatial anatomy.",
    topicSlugs: ["right-hand-of-god"], related: ["Psalm 118:16", "Acts 2:33–36"]
  },
  {
    slug: "psalm-33-6", path: "psalm/33/6", reference: "Psalm 33:6",
    text: "By the word of the LORD were the heavens made; and all the host of them by the breath of his mouth.", translation: "KJV",
    mainPoint: "Creation comes from YHWH's own Word and breath.",
    context: "The psalm praises the reliability, sovereignty, and creative power of the LORD.",
    apostolicConnection: "The verse connects Word and Spirit to God's own action rather than separate creators.",
    topicSlugs: ["the-word-became-flesh", "god-is-one"], related: ["Genesis 1:1–3", "John 1:1–14"]
  },
  {
    slug: "psalm-110-1", path: "psalm/110/1", reference: "Psalm 110:1",
    text: "The LORD said unto my Lord, Sit thou at my right hand, until I make thine enemies thy footstool.", translation: "KJV",
    mainPoint: "The Messiah is exalted to God's authority and victory.",
    context: "David speaks prophetically of the coming royal-priestly Messiah.",
    apostolicConnection: "The New Testament uses this verse to describe Christ's exaltation, not two divine thrones occupied by two Gods.",
    topicSlugs: ["right-hand-of-god", "the-son-of-god"], related: ["Acts 2:32–36", "1 Corinthians 15:24–28"]
  },
  {
    slug: "psalm-118-16", path: "psalm/118/16", reference: "Psalm 118:16",
    text: "The right hand of the LORD is exalted: the right hand of the LORD doeth valiantly.", translation: "KJV",
    mainPoint: "The LORD's right hand signifies exalted power and saving action.",
    context: "The psalm celebrates deliverance and victory given by the LORD.",
    apostolicConnection: "This establishes the symbolic field for later right-hand passages about Christ.",
    topicSlugs: ["right-hand-of-god"], related: ["Exodus 15:6", "Acts 2:33–36"]
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
    slug: "mark-12-29", path: "mark/12/29", reference: "Mark 12:29",
    text: "The first of all the commandments is, Hear, O Israel; The Lord our God is one Lord.", translation: "KJV",
    mainPoint: "Jesus reaffirms Israel's confession of the one God as the first commandment.",
    context: "Jesus answers a scribe asking which commandment is first of all.",
    apostolicConnection: "New Testament Christology must preserve the confession Jesus himself affirmed.",
    topicSlugs: ["god-is-one"], related: ["Deuteronomy 6:4", "Isaiah 44:6"]
  },
  {
    slug: "matthew-10-20", path: "matthew/10/20", reference: "Matthew 10:20",
    text: "For it is not ye that speak, but the Spirit of your Father which speaketh in you.", translation: "KJV",
    mainPoint: "The Holy Spirit is identified as the Spirit of the Father speaking in believers.",
    context: "Jesus prepares the disciples for persecution and divine assistance.",
    apostolicConnection: "The verse connects Father and Spirit without introducing another divine Spirit beside God.",
    topicSlugs: ["god-is-one"], related: ["Romans 8:9–11", "Ephesians 4:4"]
  },
  {
    slug: "matthew-1-20-23", path: "matthew/1/20-23", reference: "Matthew 1:20–23",
    text: "That which is conceived in her is of the Holy Ghost... and they shall call his name Emmanuel... God with us.", translation: "KJV",
    mainPoint: "The child conceived by the Holy Ghost is the manifestation of God with us.",
    context: "The angel explains Mary's conception and the meaning of the child's identity to Joseph.",
    apostolicConnection: "The same passage holds miraculous conception, real humanity, and divine identity together.",
    topicSlugs: ["the-son-of-god", "jesus-is-god"], related: ["Luke 1:35", "Isaiah 9:6"]
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
    slug: "luke-1-31-35", path: "luke/1/31-35", reference: "Luke 1:31–35",
    text: "Thou shalt conceive in thy womb, and bring forth a son, and shalt call his name JESUS... therefore also that holy thing which shall be born of thee shall be called the Son of God.", translation: "KJV",
    mainPoint: "The title Son of God is connected directly to the miraculous conception and birth.",
    context: "Gabriel explains to Mary how she will conceive and who the child will be.",
    apostolicConnection: "The Spirit of God brings forth the genuine human Son in whom God is revealed.",
    topicSlugs: ["the-son-of-god", "jesus-is-god"], related: ["Matthew 1:20–23", "Galatians 4:4"]
  },
  {
    slug: "luke-22-42", path: "luke/22/42", reference: "Luke 22:42",
    text: "Father, if thou be willing, remove this cup from me: nevertheless not my will, but thine, be done.", translation: "KJV",
    mainPoint: "Jesus expresses a real human will in perfect submission to God.",
    context: "Jesus prays in Gethsemane before his arrest and crucifixion.",
    apostolicConnection: "The prayer belongs to his genuine human life as the Son.",
    topicSlugs: ["the-son-of-god"], related: ["Hebrews 5:7", "1 Timothy 2:5"]
  },
  {
    slug: "luke-23-39-43", path: "luke/23/39-43", reference: "Luke 23:39–43",
    text: "And Jesus said unto him, Verily I say unto thee, To day shalt thou be with me in paradise.", translation: "KJV",
    mainPoint: "Jesus grants mercy to the thief before the new-covenant gospel is preached after the resurrection.",
    context: "The thief appeals to Jesus while both are crucified.",
    apostolicConnection: "The event occurs before the death, burial, resurrection, and post-resurrection commission are completed.",
    topicSlugs: ["the-new-birth"], related: ["Luke 24:46–47", "Acts 2:37–38"]
  },
  {
    slug: "luke-24-46-47", path: "luke/24/46-47", reference: "Luke 24:46–47",
    text: "Thus it is written, and thus it behoved Christ to suffer, and to rise from the dead the third day: and that repentance and remission of sins should be preached in his name among all nations, beginning at Jerusalem.", translation: "KJV",
    mainPoint: "The risen Christ connects the completed gospel to repentance and remission preached in his name.",
    context: "Jesus commissions the disciples after opening their understanding of the Scriptures.",
    apostolicConnection: "Acts 2 records the beginning at Jerusalem and identifies the name as Jesus Christ.",
    topicSlugs: ["the-name-of-jesus", "the-new-birth"], related: ["Matthew 28:19", "Acts 2:38"]
  },
  {
    slug: "john-1-1", path: "john/1/1", reference: "John 1:1",
    text: "In the beginning was the Word, and the Word was with God, and the Word was God.", translation: "KJV",
    mainPoint: "The eternal Word belongs to God's own identity and is God.",
    context: "John deliberately echoes Genesis before describing creation and incarnation.",
    apostolicConnection: "The verse presents God's own self-expression, not a second God beside him.",
    topicSlugs: ["the-word-became-flesh", "jesus-is-god"], related: ["Genesis 1:1–3", "John 1:14"]
  },
  {
    slug: "john-1-14", path: "john/1/14", reference: "John 1:14",
    text: "And the Word was made flesh, and dwelt among us.", translation: "KJV",
    mainPoint: "God's eternal Word entered genuine human existence.",
    context: "John moves from the eternal Word and creation to incarnation.",
    apostolicConnection: "The text says the Word became flesh and identifies the incarnate revelation with Jesus Christ.",
    topicSlugs: ["the-word-became-flesh", "the-son-of-god", "jesus-is-god"], related: ["John 1:1", "Luke 1:31–35"]
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
    slug: "john-3-3-5", path: "john/3/3-5", reference: "John 3:3–5",
    text: "Except a man be born of water and of the Spirit, he cannot enter into the kingdom of God.", translation: "KJV",
    mainPoint: "Jesus teaches a new birth involving water and Spirit.",
    context: "Jesus explains spiritual birth to Nicodemus.",
    apostolicConnection: "Acts 2 shows the apostolic response of repentance, water baptism, and receiving the Holy Ghost.",
    topicSlugs: ["the-new-birth"], related: ["Acts 2:38", "Titus 3:5"]
  },
  {
    slug: "john-14-8-9", path: "john/14/8-9", reference: "John 14:8–9",
    text: "Philip saith unto him, Lord, shew us the Father... he that hath seen me hath seen the Father.", translation: "KJV",
    mainPoint: "Jesus answers the request to see the Father by pointing to himself.",
    context: "Philip asks Jesus for a direct revelation of the Father.",
    apostolicConnection: "The invisible Father is made known visibly in Christ.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["John 14:10–11", "Colossians 1:15"]
  },
  {
    slug: "john-14-10", path: "john/14/10", reference: "John 14:10",
    text: "The Father that dwelleth in me, he doeth the works.", translation: "KJV",
    mainPoint: "Jesus identifies the Father dwelling in him as the source of the works.",
    context: "Jesus explains his answer to Philip in the upper-room discourse.",
    apostolicConnection: "The distinction is explained through real humanity and divine indwelling.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["John 14:8–9", "2 Corinthians 5:19"]
  },
  {
    slug: "john-14-10-11", path: "john/14/10-11", reference: "John 14:10–11",
    text: "The Father that dwelleth in me, he doeth the works. Believe me that I am in the Father, and the Father in me.", translation: "KJV",
    mainPoint: "Jesus explains the Father-Son relationship through mutual relation and the Father's indwelling works.",
    context: "Jesus continues answering Philip's request to see the Father.",
    apostolicConnection: "The passage preserves distinction without dividing the one God.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["John 14:8–9", "Colossians 2:9"]
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
    slug: "john-17-1-5", path: "john/17/1-5", reference: "John 17:1–5",
    text: "Father, the hour is come; glorify thy Son... glorify thou me with thine own self with the glory which I had with thee before the world was.", translation: "KJV",
    mainPoint: "Jesus prays from his messianic human mission toward the glory purposed in God before creation.",
    context: "Jesus prays before his arrest and crucifixion.",
    apostolicConnection: "The passage must be read with John 1, John 14, and the biblical distinction between God's eternal purpose and the Son's historical mission.",
    topicSlugs: ["the-son-of-god", "the-father-in-the-son"], related: ["John 1:1–14", "John 14:9–11"]
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
    slug: "acts-2-32-36", path: "acts/2/32-36", reference: "Acts 2:32–36",
    text: "This Jesus hath God raised up... being by the right hand of God exalted... God hath made that same Jesus... both Lord and Christ.", translation: "KJV",
    mainPoint: "The risen Messiah is exalted to divine authority and publicly declared Lord and Christ.",
    context: "Peter explains Psalm 110 and the resurrection on Pentecost.",
    apostolicConnection: "Right-hand language describes exaltation and authority within the messianic mission.",
    topicSlugs: ["right-hand-of-god", "the-son-of-god"], related: ["Psalm 110:1", "1 Corinthians 15:24–28"]
  },
  {
    slug: "acts-2-37-38", path: "acts/2/37-38", reference: "Acts 2:37–38",
    text: "Men and brethren, what shall we do? Then Peter said unto them, Repent, and be baptized every one of you in the name of Jesus Christ.", translation: "KJV",
    mainPoint: "The first post-resurrection gospel appeal receives an apostolic response of repentance and Jesus-name baptism.",
    context: "Convicted hearers respond to Peter's Pentecost sermon.",
    apostolicConnection: "This follows the risen Christ's commission that repentance and remission be preached in his name.",
    topicSlugs: ["the-new-birth", "the-name-of-jesus"], related: ["Luke 24:46–47", "Acts 2:38"]
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
    slug: "acts-8-16", path: "acts/8/16", reference: "Acts 8:16",
    text: "Only they were baptized in the name of the Lord Jesus.", translation: "KJV",
    mainPoint: "Samaritan believers were baptized in the name of the Lord Jesus.",
    context: "Peter and John visit Samaria after Philip's preaching.",
    apostolicConnection: "The Jesus-name pattern continues beyond Jerusalem and Jewish hearers.",
    topicSlugs: ["the-name-of-jesus", "the-new-birth"], related: ["Acts 2:38", "Acts 19:5"]
  },
  {
    slug: "acts-10-48", path: "acts/10/48", reference: "Acts 10:48",
    text: "And he commanded them to be baptized in the name of the Lord.", translation: "KJV",
    mainPoint: "Gentile believers who received the Holy Ghost were still commanded to be baptized in the Lord's name.",
    context: "Peter responds after Cornelius and his household receive the Holy Ghost.",
    apostolicConnection: "Receiving the Spirit does not make water baptism or the name irrelevant.",
    topicSlugs: ["the-name-of-jesus", "the-new-birth"], related: ["Acts 2:38", "Acts 8:16"]
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
    slug: "romans-8-9-11", path: "romans/8/9-11", reference: "Romans 8:9–11",
    text: "The Spirit of God dwell in you... the Spirit of Christ... the Spirit of him that raised up Jesus from the dead dwell in you.", translation: "KJV",
    mainPoint: "Paul describes the one indwelling Spirit as the Spirit of God and the Spirit of Christ.",
    context: "Paul contrasts life in the flesh with life in the Spirit.",
    apostolicConnection: "The language is fluid because one Spirit is being described, not separate divine Spirits.",
    topicSlugs: ["god-is-one"], related: ["Matthew 10:20", "Ephesians 4:4"]
  },
  {
    slug: "first-corinthians-15-24-28", path: "1-corinthians/15/24-28", reference: "1 Corinthians 15:24–28",
    text: "Then cometh the end, when he shall have delivered up the kingdom to God, even the Father... that God may be all in all.", translation: "KJV",
    mainPoint: "Christ's mediatorial kingdom reaches its appointed goal when every enemy is defeated.",
    context: "Paul explains resurrection order and the final destruction of death.",
    apostolicConnection: "The Son's office reaches its purpose without implying that Jesus ceases to exist.",
    topicSlugs: ["right-hand-of-god", "the-son-of-god"], related: ["Revelation 22:3–4", "Hebrews 7:24"]
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
    slug: "galatians-4-4", path: "galatians/4/4", reference: "Galatians 4:4",
    text: "But when the fulness of the time was come, God sent forth his Son, made of a woman, made under the law.", translation: "KJV",
    mainPoint: "The Son enters history by being made of a woman under the law.",
    context: "Paul explains adoption, redemption, and the arrival of the promised heir.",
    apostolicConnection: "The eternal God is revealed in the Son whose human life is brought forth in time.",
    topicSlugs: ["the-son-of-god"], related: ["Luke 1:31–35", "John 1:14"]
  },
  {
    slug: "ephesians-4-4", path: "ephesians/4/4", reference: "Ephesians 4:4",
    text: "There is one body, and one Spirit, even as ye are called in one hope of your calling.", translation: "KJV",
    mainPoint: "The church's unity rests on the confession of one Spirit.",
    context: "Paul urges believers to preserve the unity of the Spirit.",
    apostolicConnection: "The Spirit of God, Spirit of the Father, Spirit of Christ, and Holy Ghost describe the one divine Spirit.",
    topicSlugs: ["god-is-one"], related: ["Romans 8:9–11", "Matthew 10:20"]
  },
  {
    slug: "colossians-1-15", path: "colossians/1/15", reference: "Colossians 1:15",
    text: "Who is the image of the invisible God, the firstborn of every creature.", translation: "KJV",
    mainPoint: "The invisible God is made known in the visible Christ.",
    context: "Paul describes Christ's supremacy in creation and redemption.",
    apostolicConnection: "Image language explains revelation, not a second divine copy.",
    topicSlugs: ["the-father-in-the-son", "jesus-is-god"], related: ["Hebrews 1:3", "John 14:9–11"]
  },
  {
    slug: "colossians-2-9", path: "colossians/2/9", reference: "Colossians 2:9",
    text: "For in him dwelleth all the fulness of the Godhead bodily.", translation: "KJV",
    mainPoint: "All divine fullness dwells bodily in Christ.",
    context: "Paul warns believers not to be moved away from Christ.",
    apostolicConnection: "Jesus does not contain one member of a divided Godhead.",
    topicSlugs: ["jesus-is-god", "the-father-in-the-son"], related: ["Colossians 1:15", "John 14:10"]
  },
  {
    slug: "first-timothy-2-5", path: "1-timothy/2/5", reference: "1 Timothy 2:5",
    text: "For there is one God, and one mediator between God and men, the man Christ Jesus.", translation: "KJV",
    mainPoint: "The one mediator is explicitly identified in his genuine humanity.",
    context: "Paul grounds prayer for all people in the one God and Christ's saving mediation.",
    apostolicConnection: "Mediation does not require a second God; it requires the real man Christ Jesus.",
    topicSlugs: ["the-son-of-god", "jesus-is-god"], related: ["Hebrews 5:7", "2 Corinthians 5:19"]
  },
  {
    slug: "first-timothy-3-16", path: "1-timothy/3/16", reference: "1 Timothy 3:16",
    text: "God was manifest in the flesh, justified in the Spirit, seen of angels, preached unto the Gentiles.", translation: "KJV",
    mainPoint: "The mystery of godliness centers on God manifested in flesh.",
    context: "Paul summarizes the church's confession concerning Christ.",
    apostolicConnection: "The incarnation is God's own manifestation, not the appearance of another divine being.",
    topicSlugs: ["jesus-is-god", "the-word-became-flesh"], related: ["John 1:14", "2 Corinthians 5:19"]
  },
  {
    slug: "titus-3-5", path: "titus/3/5", reference: "Titus 3:5",
    text: "According to his mercy he saved us, by the washing of regeneration, and renewing of the Holy Ghost.", translation: "KJV",
    mainPoint: "Salvation is described through washing and renewal by the Holy Ghost.",
    context: "Paul contrasts God's mercy with human works of righteousness.",
    apostolicConnection: "The language harmonizes with Jesus' teaching of water and Spirit and the apostolic response in Acts 2.",
    topicSlugs: ["the-new-birth"], related: ["John 3:3–5", "Acts 2:38"]
  },
  {
    slug: "hebrews-1-1-3", path: "hebrews/1/1-3", reference: "Hebrews 1:1–3",
    text: "God... hath in these last days spoken unto us by his Son... who being the brightness of his glory, and the express image of his person.", translation: "KJV",
    mainPoint: "God's final revelation comes through the Son, the visible expression of his glory and being.",
    context: "Hebrews opens by contrasting earlier prophetic revelation with God's revelation in the Son.",
    apostolicConnection: "The passage joins genuine sonship with the full revelation of the invisible God.",
    topicSlugs: ["the-son-of-god", "jesus-is-god"], related: ["Colossians 1:15", "Hebrews 1:8–9"]
  },
  {
    slug: "hebrews-1-8-9", path: "hebrews/1/8-9", reference: "Hebrews 1:8–9",
    text: "But unto the Son he saith, Thy throne, O God, is for ever and ever.", translation: "KJV",
    mainPoint: "The Son is directly addressed as God while his anointed messianic role is affirmed.",
    context: "Hebrews contrasts the Son with angels.",
    apostolicConnection: "The passage holds deity and messianic humanity together.",
    topicSlugs: ["jesus-is-god", "the-son-of-god"], related: ["Psalm 45:6–7", "Hebrews 1:1–3"]
  },
  {
    slug: "hebrews-5-7", path: "hebrews/5/7", reference: "Hebrews 5:7",
    text: "Who in the days of his flesh... offered up prayers and supplications with strong crying and tears.", translation: "KJV",
    mainPoint: "Jesus' prayers arise from the days of his flesh and genuine human experience.",
    context: "Hebrews explains Christ's priesthood, suffering, and obedience.",
    apostolicConnection: "Prayer proves real humanity without denying the fullness of God dwelling in him.",
    topicSlugs: ["the-son-of-god"], related: ["Luke 22:42", "1 Timothy 2:5"]
  },
  {
    slug: "hebrews-7-24", path: "hebrews/7/24", reference: "Hebrews 7:24",
    text: "But this man, because he continueth ever, hath an unchangeable priesthood.", translation: "KJV",
    mainPoint: "The risen Christ continues forever in an enduring priesthood.",
    context: "Hebrews contrasts Christ's permanent priesthood with mortal Levitical priests.",
    apostolicConnection: "The completion of the mediatorial kingdom does not mean Jesus ceases to exist.",
    topicSlugs: ["the-son-of-god", "right-hand-of-god"], related: ["1 Corinthians 15:24–28", "Revelation 22:3–4"]
  },
  {
    slug: "revelation-1-17-18", path: "revelation/1/17-18", reference: "Revelation 1:17–18",
    text: "Fear not; I am the first and the last: I am he that liveth, and was dead; and, behold, I am alive for evermore.", translation: "KJV",
    mainPoint: "The crucified and risen Jesus identifies himself as the First and the Last.",
    context: "John encounters the glorified Christ in the opening vision of Revelation.",
    apostolicConnection: "Isaiah's exclusive divine title for YHWH is applied directly to Jesus.",
    topicSlugs: ["jesus-is-god", "god-is-one"], related: ["Isaiah 44:6", "Revelation 22:13"]
  },
  {
    slug: "revelation-22-3-4", path: "revelation/22/3-4", reference: "Revelation 22:3–4",
    text: "The throne of God and of the Lamb shall be in it... and they shall see his face; and his name shall be in their foreheads.", translation: "KJV",
    mainPoint: "God and the Lamb culminate in one throne, one face, and one name.",
    context: "John describes the final city and the eternal reign of God.",
    apostolicConnection: "The risen Lamb remains the visible revelation of God without multiplying divine thrones or identities.",
    topicSlugs: ["jesus-is-god", "the-son-of-god"], related: ["1 Corinthians 15:24–28", "Revelation 22:13"]
  },
  {
    slug: "revelation-22-13", path: "revelation/22/13", reference: "Revelation 22:13",
    text: "I am Alpha and Omega, the beginning and the end, the first and the last.", translation: "KJV",
    mainPoint: "Jesus bears the absolute divine title of First and Last.",
    context: "The closing chapter of Revelation records the speaker coming quickly and identifying himself with eternal divine titles.",
    apostolicConnection: "The title belongs exclusively to YHWH in Isaiah and is applied to Jesus in Revelation.",
    topicSlugs: ["jesus-is-god", "god-is-one"], related: ["Isaiah 44:6", "Revelation 1:17–18"]
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
      { title: "Preached in his name", reference: "Luke 24:46–47", explanation: "Luke connects the commission to remission in Jesus' name." },
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
