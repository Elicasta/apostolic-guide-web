import { pathwayBySlug } from "./pathway-catalog";

export const COMMENT_GUIDE_ARGUMENT_CATEGORIES = [
  "godhead",
  "christology",
  "holy_spirit",
  "baptism",
  "salvation",
  "tongues",
  "history_accusation"
] as const;

export type CommentGuideArgumentCategory = (typeof COMMENT_GUIDE_ARGUMENT_CATEGORIES)[number];
export type CommentGuideArgumentKind = "claim" | "strawman" | "accusation";

export type CommentGuideArgument = {
  id: string;
  category: CommentGuideArgumentCategory;
  kind: CommentGuideArgumentKind;
  title: string;
  claim: string;
  calmCorrection: string;
  replyVariants?: string[];
  pathwaySlugs: string[];
  patterns: RegExp[];
};

export const COMMENT_GUIDE_ARGUMENT_LIBRARY: CommentGuideArgument[] = [
  {
    id: "jesus-not-the-father",
    category: "christology",
    kind: "claim",
    title: "Jesus is not the Father",
    claim: "The Father and Jesus are distinguished, so Jesus cannot reveal the Father as the one God in flesh.",
    calmCorrection: "Apostolic teaching preserves the genuine Father-Son distinction while confessing that the eternal Father dwells and works in the genuine human Son.",
    replyVariants: [
      "Oneness keeps the real Father-Son distinction: the Father is the eternal Spirit, and the Son is the genuine man in whom He dwells.",
      "We distinguish the Father from the Son without dividing God: the Father is the eternal Spirit dwelling in the genuine human Son."
    ],
    pathwaySlugs: ["father-dwells-in-son", "jesus-image-of-god"],
    patterns: [/\bjesus\s+(?:is|was)\s+not\s+(?:the\s+)?father\b/i, /\bthe\s+father\s+(?:is|was)\s+not\s+(?:jesus|the\s+son)\b/i]
  },
  {
    id: "three-persons-one-god",
    category: "godhead",
    kind: "claim",
    title: "One God in three persons",
    claim: "The Trinity defines the one God as three distinct coequal persons, and denying that definition denies Father, Son, and Holy Spirit.",
    calmCorrection: "Apostolic teaching confesses the Father, Son, and Holy Ghost while asking whether Scripture itself defines the one God as three divine persons; it finds the one God fully revealed in Jesus Christ.",
    replyVariants: [
      "We are not denying the Father, Son, or Holy Spirit. The question is whether Scripture uses a three-person definition of the one God.",
      "Father, Son, and Holy Spirit are all biblical. Our disagreement is with dividing the one God into three personal distinctions."
    ],
    pathwaySlugs: ["god-is-one", "father-dwells-in-son"],
    patterns: [/one\s+god\s+in\s+three\s+(?:distinct\s+)?persons\b/i, /\b(?:god|trinity)\s+(?:is|means)\s+three\s+(?:distinct\s+)?persons\b/i, /\b(?:deny|denying)\s+(?:the\s+)?trinity\b/i]
  },
  {
    id: "jesus-prayed-to-the-father",
    category: "christology",
    kind: "claim",
    title: "Jesus prayed to the Father",
    claim: "Jesus praying to the Father proves two divine persons.",
    calmCorrection: "Jesus' prayers are real prayers from His genuine human life to the one eternal Spirit, not one divine person performing a conversation with another.",
    pathwaySlugs: ["jesus-prayers-and-humanity", "father-dwells-in-son"],
    patterns: [/\b(?:who|whom)\s+did\s+jesus\s+pray\s+to\b/i, /\bjesus\s+(?:prayed|prays|praying)\s+to\s+(?:god|the\s+father|himself)\b/i, /\bwhy\s+did\s+jesus\s+pray\b/i]
  },
  {
    id: "baptism-shows-three-persons",
    category: "godhead",
    kind: "claim",
    title: "Three appear at Jesus' baptism",
    claim: "The voice, the Son in the water, and the descending Spirit prove three divine persons.",
    calmCorrection: "The baptism scene distinguishes the genuine Son, God's voice from heaven, and God's Spirit descending without requiring three divine centers in the one omnipresent God.",
    pathwaySlugs: ["father-dwells-in-son", "god-is-one"],
    patterns: [/\b(?:baptism|baptized)\s+of\s+jesus\b/i, /\bson\s+(?:in|under)\s+(?:the\s+)?water.*(?:voice|father|dove|spirit)\b/i, /\bfather.*son.*(?:holy\s+)?spirit.*(?:baptism|water|dove)\b/i]
  },
  {
    id: "john-17-preexistent-glory",
    category: "christology",
    kind: "claim",
    title: "The Son had glory with the Father",
    claim: "John 17 says the Son personally shared glory and love with the Father before creation.",
    calmCorrection: "Apostolic teaching reads Christ's pre-creation glory in God's eternal plan and Word, now spoken by the real man who came to fulfill that purpose.",
    pathwaySlugs: ["word-became-flesh", "jesus-prayers-and-humanity"],
    patterns: [/\bjohn\s*17\s*:?\s*(?:5|24)\b/i, /\bglory\s+(?:i|which\s+i)\s+had\s+with\s+(?:you|thee)\b/i, /\b(?:loved|glory).*before\s+(?:the\s+)?(?:world|foundation|creation)\b/i]
  },
  {
    id: "word-was-with-god",
    category: "christology",
    kind: "claim",
    title: "The Word was with God",
    claim: "The Word being with God proves a second eternal divine person.",
    calmCorrection: "God's Word is His own eternal self-expression and action; the Word was God and became flesh in the genuine human life of Jesus Christ.",
    pathwaySlugs: ["word-became-flesh", "god-alone-creator"],
    patterns: [/\bword\s+was\s+with\s+god\b/i, /\bjohn\s*1\s*:?\s*(?:1|2|14)\b/i, /\bpros\s+ton\s+theon\b/i]
  },
  {
    id: "father-sent-the-son",
    category: "christology",
    kind: "claim",
    title: "The Father sent the Son",
    claim: "Sending language requires two eternal divine persons.",
    calmCorrection: "Sending language describes God's real saving mission through the Son born into the world, while Scripture identifies God Himself as the saving actor in Christ.",
    pathwaySlugs: ["son-was-born", "fullness-of-godhead"],
    patterns: [/\bfather\s+(?:sent|sends)\s+(?:the\s+)?son\b/i, /\bgod\s+(?:sent|sends)\s+(?:his\s+)?son\b/i, /\bson\s+sent\s+(?:by|from)\s+(?:the\s+)?father\b/i]
  },
  {
    id: "father-loves-the-son",
    category: "christology",
    kind: "claim",
    title: "The Father loves the Son",
    claim: "Love between Father and Son requires two eternal divine persons.",
    calmCorrection: "Scripture's Father-Son love is genuine within the incarnation and saving mission; Apostolic teaching does not reduce the Son to an unreal role.",
    pathwaySlugs: ["son-was-born", "father-dwells-in-son"],
    patterns: [/\bfather\s+loves?\s+(?:the\s+)?son\b/i, /\blove\s+requires\s+(?:two|another|distinct)\s+persons?\b/i]
  },
  {
    id: "father-greater-unknown-hour",
    category: "christology",
    kind: "claim",
    title: "The Father is greater and the Son did not know",
    claim: "Jesus' limits prove He is a distinct or lesser divine person.",
    calmCorrection: "The Son's growth, submission, and limited human knowledge belong to His authentic humanity, while the Father dwelling in Him is the unlimited eternal Spirit.",
    pathwaySlugs: ["jesus-prayers-and-humanity", "son-was-born"],
    patterns: [/\bfather\s+is\s+greater\s+than\s+i\b/i, /\b(?:son|jesus)\s+(?:did\s+not|doesn'?t|didn'?t)\s+know\s+(?:the\s+)?(?:day|hour)\b/i, /\bmark\s*13\s*:?\s*32\b/i, /\bjohn\s*14\s*:?\s*28\b/i]
  },
  {
    id: "not-my-will-two-wills",
    category: "christology",
    kind: "claim",
    title: "Not my will but yours",
    claim: "Gethsemane reveals two divine wills and therefore two divine persons.",
    calmCorrection: "Gethsemane reveals Christ's real human will submitting to God's will, which confirms His true humanity rather than dividing the one God into divine persons.",
    pathwaySlugs: ["jesus-prayers-and-humanity", "son-was-born"],
    patterns: [/\bnot\s+my\s+will\s+but\s+(?:your|yours|thine)\b/i, /\b(?:two|different|distinct)\s+wills?\b/i, /\bgethsemane\b/i]
  },
  {
    id: "right-hand-of-god",
    category: "christology",
    kind: "claim",
    title: "Jesus is at God's right hand",
    claim: "Jesus at God's right hand means two visible divine persons beside each other.",
    calmCorrection: "The right hand is biblical authority and exaltation language: the risen man Christ Jesus exercises the power and rule of the one invisible God.",
    pathwaySlugs: ["right-hand-of-god", "jesus-image-of-god"],
    patterns: [/\bright\s+hand\s+of\s+(?:the\s+)?(?:father|god)\b/i, /\bstephen\s+saw\s+(?:jesus|the\s+son)\b/i, /\bacts\s*7\s*:?\s*(?:55|56)\b/i]
  },
  {
    id: "another-comforter",
    category: "holy_spirit",
    kind: "claim",
    title: "Another Comforter",
    claim: "Another Comforter proves the Holy Spirit is a distinct divine person from Jesus.",
    calmCorrection: "Jesus promised the one God's own Spirit as Comforter and immediately said He would come to the disciples, joining distinction of operation with identity of Spirit.",
    pathwaySlugs: ["receiving-the-holy-ghost", "father-dwells-in-son"],
    patterns: [/\banother\s+(?:comforter|helper|advocate)\b/i, /\bjohn\s*14\s*:?\s*(?:16|17|18)\b/i]
  },
  {
    id: "mediator-and-intercessor",
    category: "christology",
    kind: "claim",
    title: "Jesus mediates and intercedes",
    claim: "A mediator or intercessor must be a second divine person beside the Father.",
    calmCorrection: "The man Christ Jesus genuinely mediates between the one God and humanity because the incarnation truly joins full deity and authentic humanity in Him.",
    pathwaySlugs: ["son-was-born", "jesus-prayers-and-humanity"],
    patterns: [/\b(?:one\s+)?mediator\b/i, /\bjesus\s+(?:intercedes|interceding|makes?\s+intercession)\b/i, /\b1\s*timothy\s*2\s*:?\s*5\b/i]
  },
  {
    id: "plural-let-us",
    category: "godhead",
    kind: "claim",
    title: "Let us make man",
    claim: "God's plural pronouns reveal multiple divine persons.",
    calmCorrection: "Apostolic teaching reads the occasional divine plural within Scripture's repeated declaration that God created alone and by Himself.",
    pathwaySlugs: ["god-alone-creator", "god-is-one"],
    patterns: [/\blet\s+us\s+make\s+man\b/i, /\bgenesis\s*1\s*:?\s*26\b/i, /\bwho\s+is\s+(?:the\s+)?us\s+in\s+genesis\b/i]
  },
  {
    id: "eternal-son-created-through-him",
    category: "christology",
    kind: "claim",
    title: "The Son existed before creation",
    claim: "Creation through the Son proves an eternal Son-person distinct from the Father.",
    calmCorrection: "God created through His own eternal Word and purpose, which became flesh; Sonship is located in the conceived and born human life without denying Christ's full deity.",
    pathwaySlugs: ["word-became-flesh", "son-was-born", "god-alone-creator"],
    patterns: [/\beternal\s+son\b/i, /\bson\s+(?:created|made)\s+(?:all|the\s+world|everything)\b/i, /\bthrough\s+(?:the\s+)?son\s+(?:he\s+)?made\b/i, /\bhebrews\s*1\s*:?\s*2\b/i]
  },
  {
    id: "holy-spirit-is-a-person",
    category: "holy_spirit",
    kind: "claim",
    title: "The Holy Spirit speaks, wills, and can be grieved",
    claim: "Personal actions of the Holy Spirit require a third divine person.",
    calmCorrection: "The Holy Ghost acts personally because He is God's own living Spirit, not an impersonal force and not another divine center beside God.",
    pathwaySlugs: ["receiving-the-holy-ghost", "god-is-one"],
    patterns: [/\bholy\s+spirit\s+(?:is\s+a\s+person|speaks|talks|wills|thinks|can\s+be\s+grieved)\b/i, /\b(?:grieve|lied\s+to)\s+(?:the\s+)?holy\s+(?:ghost|spirit)\b/i]
  },
  {
    id: "triadic-passages",
    category: "godhead",
    kind: "claim",
    title: "Father, Son, and Spirit are named together",
    claim: "Triadic passages prove three coequal divine persons.",
    calmCorrection: "Naming Father, Son, and Holy Ghost together shows real biblical distinctions in revelation and salvation, but the text must still be read within Scripture's confession of one indivisible God.",
    pathwaySlugs: ["god-is-one", "matthew-28-and-acts-2"],
    patterns: [/\b2\s*corinthians\s*13\s*:?\s*14\b/i, /\b(?:father|son).*(?:son|holy\s+(?:ghost|spirit)).*(?:holy\s+(?:ghost|spirit)|father)\b/i, /\bthree\s+(?:are|persons?)\s+(?:named|mentioned)\b/i]
  },
  {
    id: "who-raised-jesus",
    category: "christology",
    kind: "claim",
    title: "The Father raised Jesus",
    claim: "Statements that God raised Jesus prove a divine person separate from Him.",
    calmCorrection: "Scripture can say God raised Jesus and that Jesus would raise His own body because the one divine Spirit acted in and through the genuine human Christ.",
    pathwaySlugs: ["fullness-of-godhead", "father-dwells-in-son"],
    patterns: [/\bwho\s+raised\s+jesus\b/i, /\b(?:father|god)\s+raised\s+jesus\b/i, /\bjesus\s+raised\s+himself\b/i]
  },
  {
    id: "god-cannot-die-or-be-tempted",
    category: "christology",
    kind: "claim",
    title: "God cannot die or be tempted",
    claim: "Jesus' death, temptation, weakness, or growth disproves His absolute deity.",
    calmCorrection: "The eternal Spirit did not cease to be God; the genuine man Christ Jesus could suffer, be tempted, grow, and die while all divine fullness dwelt in Him.",
    pathwaySlugs: ["son-was-born", "fullness-of-godhead"],
    patterns: [/\bgod\s+(?:cannot|can'?t)\s+(?:die|be\s+tempted|sleep|grow)\b/i, /\bjesus\s+(?:died|was\s+tempted|slept|grew).*(?:so|therefore).*not\s+god\b/i]
  },
  {
    id: "matthew-28-baptismal-formula",
    category: "baptism",
    kind: "claim",
    title: "Matthew 28:19 gives the baptismal formula",
    claim: "Jesus commanded the titles Father, Son, and Holy Spirit, so Jesus-name baptism disobeys Him.",
    calmCorrection: "Apostolic teaching accepts Matthew 28:19 and reads the apostles' repeated Jesus-name baptisms as their inspired fulfillment of the singular name Jesus commanded.",
    pathwaySlugs: ["matthew-28-and-acts-2", "baptism-in-jesus-name"],
    patterns: [/\bmatthew\s*28\s*:?\s*19\b/i, /\bbaptiz(?:e|ed|ing)\s+(?:you|them|people)?\s*(?:in|into)\s+(?:the\s+)?name\s+of\s+(?:the\s+)?father\b/i, /\bfather\s+son\s+and\s+(?:the\s+)?holy\s+(?:ghost|spirit)\s+(?:formula|baptism)\b/i]
  },
  {
    id: "jesus-name-means-authority-not-words",
    category: "baptism",
    kind: "claim",
    title: "In Jesus' name means authority, not spoken wording",
    claim: "Acts only describes baptism under Jesus' authority and gives no baptismal invocation.",
    calmCorrection: "The Acts accounts repeatedly name Jesus Christ or the Lord Jesus at baptism, so Apostolic practice treats His name as both authority and the revealed name invoked in obedience.",
    pathwaySlugs: ["baptism-in-jesus-name", "name-of-jesus"],
    patterns: [/\bin\s+jesus'?\s+name\s+(?:only\s+)?means?\s+(?:authority|under\s+his\s+authority)\b/i, /\bnot\s+(?:a\s+)?(?:formula|magic\s+words|spoken\s+words)\b/i]
  },
  {
    id: "baptism-is-only-symbolic",
    category: "baptism",
    kind: "claim",
    title: "Baptism is only an outward symbol",
    claim: "Water baptism follows salvation and has no place in receiving remission or new birth.",
    calmCorrection: "Apostolic teaching does not treat water as magic; it treats baptism as obedient faith in God's operation, joining the believer to Christ's burial and the promised remission of sins.",
    pathwaySlugs: ["baptism-in-jesus-name", "new-birth"],
    patterns: [/\bbaptism\s+(?:is|was)\s+(?:only|just|merely)\s+(?:a\s+)?(?:symbol|sign|public\s+declaration)\b/i, /\boutward\s+sign\s+of\s+an\s+inward\b/i, /\bsaved\s+before\s+baptism\b/i]
  },
  {
    id: "baptism-is-a-work",
    category: "salvation",
    kind: "claim",
    title: "Baptism is a work opposed to grace",
    claim: "Requiring baptism adds human merit to grace and faith.",
    calmCorrection: "Apostolic teaching rejects human merit and receives baptism as obedient faith in God's saving work, not a deed that earns salvation.",
    pathwaySlugs: ["faith-grace-and-obedience", "baptism-in-jesus-name"],
    patterns: [/\bbaptism\s+(?:is|equals)\s+(?:a\s+)?work\b/i, /\bsaved\s+by\s+grace.*not\s+(?:by\s+)?works\b/i, /\bephesians\s*2\s*:?\s*(?:8|9|8\s*[-–]\s*9)\b/i]
  },
  {
    id: "thief-on-the-cross",
    category: "salvation",
    kind: "claim",
    title: "The thief was saved without baptism",
    claim: "The thief on the cross proves baptism and Spirit reception are never part of the gospel response.",
    calmCorrection: "The thief received Christ's promise before the death, resurrection, and Pentecost proclamation; Apostolic teaching follows the new-covenant response preached after those events.",
    pathwaySlugs: ["gospel-pattern", "new-birth"],
    patterns: [/\bthief\s+on\s+(?:the\s+)?cross\b/i, /\bthief\s+(?:was\s+)?saved\s+without\s+(?:being\s+)?baptized\b/i]
  },
  {
    id: "cornelius-before-water-baptism",
    category: "salvation",
    kind: "claim",
    title: "Cornelius received the Spirit before water baptism",
    claim: "Acts 10 proves water baptism is unnecessary after Spirit reception.",
    calmCorrection: "Peter treated the Spirit's outpouring as God's sign that Gentiles were accepted and then immediately commanded water baptism rather than canceling it.",
    pathwaySlugs: ["baptism-in-jesus-name", "receiving-the-holy-ghost"],
    patterns: [/\bcornelius\b/i, /\bacts\s*10\s*:?\s*(?:44|45|46|47|48)\b/i, /\breceived\s+(?:the\s+)?(?:holy\s+)?spirit\s+before\s+(?:water\s+)?baptism\b/i]
  },
  {
    id: "paul-not-sent-to-baptize",
    category: "baptism",
    kind: "claim",
    title: "Paul was not sent to baptize",
    claim: "First Corinthians 1:17 separates baptism from the saving gospel.",
    calmCorrection: "Paul addressed loyalty to human ministers, not whether believers should be baptized; the same passage assumes the Corinthians had been baptized into Christ rather than into Paul.",
    pathwaySlugs: ["baptism-in-jesus-name", "gospel-pattern"],
    patterns: [/\b(?:christ|jesus)\s+(?:did\s+)?not\s+send\s+(?:me|paul)\s+to\s+baptize\b/i, /\b1\s*corinthians\s*1\s*:?\s*17\b/i]
  },
  {
    id: "believe-and-confess-only",
    category: "salvation",
    kind: "claim",
    title: "Belief and confession alone are the whole response",
    claim: "John 3:16 or Romans 10:9 excludes repentance, baptism, and Spirit reception from conversion.",
    calmCorrection: "Apostolic teaching centers salvation entirely in Christ's grace and reads believing faith as the living response that receives the apostolic commands rather than setting Scripture against Scripture.",
    pathwaySlugs: ["faith-grace-and-obedience", "gospel-pattern"],
    patterns: [/\b(?:just|only|simply)\s+believe\b/i, /\bconfess\s+with\s+(?:your|the)\s+mouth.*believe\s+in\s+(?:your|the)\s+heart\b/i, /\bromans\s*10\s*:?\s*(?:9|10|13)\b/i, /\bjohn\s*3\s*:?\s*16\b/i]
  },
  {
    id: "john-3-water-is-not-baptism",
    category: "salvation",
    kind: "claim",
    title: "Born of water does not mean baptism",
    claim: "John 3:5 refers to natural birth, cleansing, or the Word rather than water baptism.",
    calmCorrection: "Apostolic teaching reads Jesus' water-and-Spirit language with the apostolic water-and-Spirit response in Acts, while keeping both under God's mercy and new birth.",
    pathwaySlugs: ["new-birth", "gospel-pattern"],
    patterns: [/\bborn\s+of\s+water\s+(?:means|is|refers\s+to)\s+(?:natural\s+birth|the\s+word|cleansing)\b/i, /\bjohn\s*3\s*:?\s*5\b/i]
  },
  {
    id: "acts-2-38-grammar",
    category: "salvation",
    kind: "claim",
    title: "Acts 2:38 disconnects baptism from remission",
    claim: "Greek grammar or the word eis makes baptism because of forgiveness rather than for remission.",
    calmCorrection: "Apostolic teaching reads Peter's command as a unified response of repentance, baptism in Jesus Christ's name, and the promise of the Holy Ghost.",
    pathwaySlugs: ["gospel-pattern", "baptism-in-jesus-name"],
    patterns: [/\bacts\s*2\s*:?\s*38\b.*\b(?:grammar|greek|eis|because\s+of)\b/i, /\b(?:eis|for)\s+(?:the\s+)?remission\s+of\s+sins\b/i]
  },
  {
    id: "spirit-received-at-belief",
    category: "holy_spirit",
    kind: "claim",
    title: "Every believer receives the Spirit at belief",
    claim: "Spirit reception always happens invisibly at the first moment of faith, so no distinct experience is expected.",
    calmCorrection: "Apostolic teaching honors every work of God drawing a believer while following Acts, where people could believe or be baptized and still receive a recognizable outpouring of the Spirit.",
    pathwaySlugs: ["receiving-the-holy-ghost", "new-birth"],
    patterns: [/\breceive\s+(?:the\s+)?(?:holy\s+)?spirit\s+(?:when|the\s+moment)\s+(?:you|we|they)\s+believe\b/i, /\bevery\s+believer\s+(?:already\s+)?has\s+(?:the\s+)?holy\s+spirit\b/i, /\bephesians\s*1\s*:?\s*13\b/i]
  },
  {
    id: "not-all-speak-with-tongues",
    category: "tongues",
    kind: "claim",
    title: "Do all speak with tongues?",
    claim: "First Corinthians 12:30 proves tongues cannot accompany every reception of the Holy Ghost.",
    calmCorrection: "Apostolic teaching distinguishes the congregational gift Paul regulates from the initial sign repeatedly accompanying Spirit reception in Acts.",
    pathwaySlugs: ["tongues-as-initial-sign", "receiving-the-holy-ghost"],
    patterns: [/\bdo\s+all\s+speak\s+(?:with|in)\s+tongues\b/i, /\bnot\s+everyone\s+(?:speaks|has\s+to\s+speak)\s+(?:with|in)\s+tongues\b/i, /\b1\s*corinthians\s*12\s*:?\s*30\b/i]
  },
  {
    id: "tongues-were-known-languages-or-ceased",
    category: "tongues",
    kind: "claim",
    title: "Tongues were only known languages or ceased",
    claim: "Acts 2 was only missionary languages, or tongues ended with the apostolic age.",
    calmCorrection: "Acts presents Spirit-given utterance as the recognizable sign, while First Corinthians distinguishes public use, private prayer, and interpretation without declaring the experience unavailable.",
    pathwaySlugs: ["tongues-as-initial-sign", "receiving-the-holy-ghost"],
    patterns: [/\btongues\s+(?:were|are)\s+(?:only|just)\s+(?:known|human|foreign)\s+languages\b/i, /\btongues\s+(?:have\s+)?ceased\b/i, /\bcessation(?:ism|ist)?\b/i]
  },
  {
    id: "tongues-not-required-for-salvation",
    category: "tongues",
    kind: "claim",
    title: "Tongues are not required for salvation",
    claim: "Requiring tongues makes a spiritual gift into a human work or salvation test.",
    calmCorrection: "Apostolic teaching does not present tongues as merit; it presents Spirit-given speech as the repeated initial sign that God Himself supplies when people receive the Holy Ghost.",
    pathwaySlugs: ["tongues-as-initial-sign", "receiving-the-holy-ghost"],
    patterns: [/\b(?:don'?t|do\s+not)\s+have\s+to\s+speak\s+(?:with|in)\s+tongues\s+to\s+be\s+saved\b/i, /\btongues\s+(?:are|is)\s+not\s+(?:required|necessary)\s+(?:for|to)\s+salvation\b/i]
  },
  {
    id: "modalism-masks-or-modes",
    category: "history_accusation",
    kind: "strawman",
    title: "Modalism or Sabellianism accusation",
    claim: "Oneness teaches one God changing masks, roles, or modes.",
    calmCorrection: "Apostolic teaching rejects a mask-switching view and an unreal Son; it confesses one eternal Spirit genuinely incarnate in a real human life.",
    replyVariants: [
      "That is not a mask-switching view; the Son is a genuine human life, not a temporary role.",
      "Oneness does not mean God rotates through roles. The Son is real humanity, not a mask."
    ],
    pathwaySlugs: ["father-dwells-in-son", "son-was-born"],
    patterns: [/\bmodalis(?:m|t)\b/i, /\bsabellian(?:ism)?\b/i, /\b(?:masks?|modes?|roles?)\s+(?:of|for)\s+god\b/i]
  },
  {
    id: "heresy-cult-not-christian",
    category: "history_accusation",
    kind: "accusation",
    title: "Heresy, cult, or not Christian accusation",
    claim: "Oneness believers should be dismissed by label rather than heard from Scripture.",
    calmCorrection: "Apostolic Guide answers the doctrinal claim from Scripture without attacking another tradition or asking anyone to accept a label as proof.",
    replyVariants: [
      "Calling it heresy does not settle the biblical question.",
      "A label cannot take the place of examining the biblical claim."
    ],
    pathwaySlugs: ["god-is-one", "jesus-is-god"],
    patterns: [/\bheres(?:y|ies)\b/i, /\bheretic(?:al|s)?\b/i, /\b(?:a\s+)?cult\b/i, /\bnot\s+(?:real\s+)?christians?\b/i, /\bfalse\s+(?:religion|church|gospel|doctrine|teaching)\b/i]
  },
  {
    id: "jesus-only-strawman",
    category: "history_accusation",
    kind: "accusation",
    title: "Jesus Only accusation",
    claim: "Oneness denies the Father, the Son, or the Holy Ghost.",
    calmCorrection: "Apostolic teaching confesses the Father, Son, and Holy Ghost exactly as Scripture speaks of them while rejecting three divine persons in the one God.",
    pathwaySlugs: ["father-dwells-in-son", "receiving-the-holy-ghost"],
    patterns: [/\bjesus\s+only\b/i, /\bdeny\s+(?:the\s+)?(?:father|son|holy\s+(?:ghost|spirit))\b/i, /\bdoesn'?t\s+believe\s+in\s+(?:the\s+)?(?:father|holy\s+(?:ghost|spirit))\b/i]
  },
  {
    id: "nicaea-and-church-history",
    category: "history_accusation",
    kind: "accusation",
    title: "The historic church condemned Oneness",
    claim: "Nicaea, later councils, or majority tradition settle the biblical question by themselves.",
    calmCorrection: "Church history matters, but Apostolic Guide lets the biblical texts define the belief and invites people to examine those texts directly.",
    pathwaySlugs: ["god-is-one", "word-became-flesh"],
    patterns: [/\bnicaea(?:n)?\b/i, /\bchurch\s+(?:fathers?|councils?|history)\b/i, /\b(?:historic|orthodox)\s+christianity\b/i, /\bcondemned\s+(?:as\s+)?heresy\b/i]
  },
  {
    id: "patripassian-father-died",
    category: "history_accusation",
    kind: "accusation",
    title: "Patripassianism or the Father died",
    claim: "If the Father was in Christ, the eternal Spirit must have died on the cross.",
    calmCorrection: "Apostolic teaching does not say the eternal Spirit died; the genuine human Son suffered and died while God was in Christ reconciling the world to Himself.",
    pathwaySlugs: ["son-was-born", "fullness-of-godhead"],
    patterns: [/\bpatripassian(?:ism)?\b/i, /\bfather\s+(?:died|suffered|was\s+crucified)\b/i, /\bgod\s+(?:died|was\s+crucified)\b/i]
  },
  {
    id: "invented-in-1913",
    category: "history_accusation",
    kind: "accusation",
    title: "Oneness was invented in 1913",
    claim: "The modern movement's twentieth-century organization proves its reading cannot be biblical.",
    calmCorrection: "A movement's modern history does not settle the exegesis, so Apostolic Guide returns the question to the biblical confession, incarnation, and apostolic practice.",
    pathwaySlugs: ["god-is-one", "matthew-28-and-acts-2"],
    patterns: [/\b(?:invented|started|created|began)\s+in\s+1913\b/i, /\bnew\s+issue\b/i, /\bno\s+oneness\s+before\s+(?:1913|the\s+20th\s+century)\b/i]
  }
];

export function commentGuideArgumentById(id: string) {
  return COMMENT_GUIDE_ARGUMENT_LIBRARY.find((argument) => argument.id === id) ?? null;
}

export function commentGuideArgumentDirectory() {
  return COMMENT_GUIDE_ARGUMENT_LIBRARY.map(({ id, category, kind, title, claim, calmCorrection, replyVariants, pathwaySlugs }) => ({
    id,
    category,
    kind,
    title,
    claim,
    approvedCorrection: calmCorrection,
    approvedReplyVariants: replyVariants ?? [calmCorrection],
    pathwaySlugs
  }));
}

export function commentGuideArgumentsForIds(ids: string[]) {
  const unique = [...new Set(ids)];
  return unique.map(commentGuideArgumentById).filter((argument): argument is CommentGuideArgument => Boolean(argument));
}

export function matchCommentGuideArguments(comment: string, limit = 6) {
  return COMMENT_GUIDE_ARGUMENT_LIBRARY
    .filter((argument) => argument.patterns.some((pattern) => pattern.test(comment)))
    .slice(0, Math.max(0, limit));
}

export function mergeCommentGuideArgumentIds(comment: string, modelIds: string[], limit = 6) {
  const detected = matchCommentGuideArguments(comment, limit).map((argument) => argument.id);
  return [...new Set([...detected, ...modelIds.filter((id) => commentGuideArgumentById(id))])].slice(0, limit);
}

export function preferredPathwayForArguments(ids: string[]) {
  const argumentsFound = commentGuideArgumentsForIds(ids);
  const ordered = [...argumentsFound.filter((argument) => argument.kind === "claim"), ...argumentsFound.filter((argument) => argument.kind === "accusation")];
  for (const argument of ordered) {
    for (const slug of argument.pathwaySlugs) if (pathwayBySlug(slug)) return slug;
  }
  return null;
}

export function buildArgumentGuidedFallbackReply(input: {
  argumentIds: string[];
  pathwayTitle: string;
  intent: "sincere_question" | "doctrinal_objection" | "gotcha_contention";
  seed?: string;
  recentReplies?: string[];
}) {
  const argumentsFound = commentGuideArgumentsForIds(input.argumentIds);
  const claims = argumentsFound.filter((argument) => argument.kind === "claim");
  const strawmen = argumentsFound.filter((argument) => argument.kind === "strawman");
  const accusations = argumentsFound.filter((argument) => argument.kind === "accusation");
  const selectedArguments = [...claims.slice(0, 1), ...strawmen.slice(0, 1), ...accusations.slice(0, 1)];
  const openings = input.intent === "sincere_question"
    ? ["Good question.", "Here is how we understand it.", "The distinction matters here."]
    : input.intent === "doctrinal_objection"
      ? ["", "Here is the distinction.", "That is not what we mean by Oneness."]
      : ["", "Here is where we differ.", "That conclusion does not follow from what we believe."];
  const pathwayTitle = input.pathwayTitle.trim() || "Apostolic Guide";
  const pathwayName = pathwayTitle.replace(/^the\s+/i, "");
  const destinations = [
    `The ${pathwayName} guide walks through the biblical texts behind that reading.`,
    `The ${pathwayName} guide lays out the passages behind that conclusion.`,
    `The ${pathwayName} Pathway gives the Scripture sequence behind that answer.`,
    `You can follow the full biblical case in the ${pathwayName} guide.`
  ];
  let hash = 2166136261;
  for (const character of input.seed ?? "comment-guide") {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const correctionSets = selectedArguments.map((argument) => argument.replyVariants?.length ? argument.replyVariants : [argument.calmCorrection]);
  const start = (hash >>> 0) % (openings.length * destinations.length * 3);
  const recent = new Set((input.recentReplies ?? []).map((reply) => reply.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
  const candidates: string[] = [];
  for (let offset = 0; offset < openings.length * destinations.length * 3; offset += 1) {
    const index = (start + offset) % (openings.length * destinations.length * 3);
    const opening = openings[index % openings.length];
    const destination = destinations[Math.floor(index / openings.length) % destinations.length];
    const blocks = correctionSets.map((set, blockIndex) => set[(index + blockIndex) % set.length]);
    const prefix = opening ? `${opening} ` : "";
    const fullReply = `${prefix}${blocks.join(" ")} ${destination}`.trim();
    const shorterReply = `${prefix}${blocks.slice(0, 2).join(" ")} ${destination}`.trim();
    const shortestReply = `${prefix}${blocks.slice(0, 1).join(" ")} ${destination}`.trim();
    candidates.push(fullReply.length <= 500 ? fullReply : shorterReply.length <= 500 ? shorterReply : shortestReply);
  }
  return candidates.find((reply) => !recent.has(reply.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim())) ?? candidates[0];
}
