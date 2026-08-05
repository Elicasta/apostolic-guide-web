import type { Pathway } from "@/data";

export type PathwayCollection =
  | "One God and divine identity"
  | "Jesus Christ and the incarnation"
  | "Salvation and new birth"
  | "Questions and biblical interpretation";

export type WebsitePathway = Pathway & { collection: PathwayCollection };

function pathway(input: Omit<WebsitePathway, "appSlug"> & { appSlug?: string }): WebsitePathway {
  return { ...input, appSlug: input.appSlug ?? input.slug };
}

export const allPathways: WebsitePathway[] = [
  pathway({ slug: "god-is-one", title: "God Is One", summary: "Begin with Scripture's controlling confession of one indivisible God.", estimatedMinutes: 10, level: "Foundational", topicSlug: "god-is-one", collection: "One God and divine identity", steps: [
    { title: "Begin with the confession", reference: "Deuteronomy 6:4", explanation: "Israel's central confession names the LORD as one." },
    { title: "No God before or after", reference: "Isaiah 43:10", explanation: "The LORD denies any formed God before Him or after Him." },
    { title: "No God beside Him", reference: "Isaiah 44:8", explanation: "God says He knows no other God or Rock." },
    { title: "Jesus preserves the Shema", reference: "Mark 12:29", explanation: "Jesus keeps the confession of one LORD as the first commandment." },
    { title: "The apostles continue it", reference: "1 Corinthians 8:4", explanation: "Paul carries the same confession into the church." }
  ]}),
  pathway({ slug: "no-god-beside-him", title: "No God Beside Him", summary: "Follow the Bible's clearest denials of another God with, beside, before, or after the LORD.", estimatedMinutes: 9, level: "Foundational", topicSlug: "god-is-one", collection: "One God and divine identity", steps: [
    { title: "None beside Him", reference: "Deuteronomy 4:35", explanation: "The exodus revealed that the LORD is God and there is none else." },
    { title: "No God with Him", reference: "Deuteronomy 32:39", explanation: "God says there is no god with Him." },
    { title: "None before or after", reference: "Isaiah 43:10", explanation: "No God was formed before the LORD and none will be after Him." },
    { title: "First, Last, and only God", reference: "Isaiah 44:6", explanation: "The LORD joins eternal titles with the denial of any God beside Him." },
    { title: "Apostolic continuity", reference: "1 Corinthians 8:4", explanation: "The New Testament does not abandon the prophetic confession." }
  ]}),
  pathway({ slug: "god-alone-creator", title: "God Alone Is Creator", summary: "Compare the LORD creating alone with New Testament creation language about Christ.", estimatedMinutes: 10, level: "Intermediate", topicSlug: "god-is-one", collection: "One God and divine identity", steps: [
    { title: "One Creator acts", reference: "Genesis 1:1", explanation: "The Bible begins with God as the single acting Creator." },
    { title: "He creates alone", reference: "Isaiah 44:24", explanation: "The LORD says He made all things alone and by Himself." },
    { title: "God creates by His Word", reference: "Psalm 33:6", explanation: "God's Word and breath are His own effective action." },
    { title: "All things through the Word", reference: "John 1:3", explanation: "Nothing created came into being without the Word." },
    { title: "All things in Christ", reference: "Colossians 1:16", explanation: "Creation language places Christ within the identity of the one Creator." }
  ]}),
  pathway({ slug: "jesus-is-god", title: "Jesus Is God", summary: "Build a direct biblical case for the absolute deity of Jesus Christ.", estimatedMinutes: 12, level: "Foundational", topicSlug: "jesus-is-god", collection: "Jesus Christ and the incarnation", steps: [
    { title: "The promised child's identity", reference: "Isaiah 9:6", explanation: "The born child bears the titles Mighty God and Everlasting Father." },
    { title: "God with us", reference: "Matthew 1:23", explanation: "Matthew identifies Jesus as Immanuel." },
    { title: "The Word was God", reference: "John 1:1", explanation: "God's eternal Word is fully divine." },
    { title: "God in Christ", reference: "2 Corinthians 5:19", explanation: "God is the saving actor present in Christ." },
    { title: "All divine fullness", reference: "Colossians 2:9", explanation: "All the fullness of deity dwells bodily in Christ." },
    { title: "My Lord and my God", reference: "John 20:28", explanation: "Thomas directly confesses the risen Jesus as God." }
  ]}),
  pathway({ slug: "word-became-flesh", title: "The Word Became Flesh", summary: "Follow God's eternal Word into the genuine humanity of Jesus Christ.", estimatedMinutes: 11, level: "Intermediate", topicSlug: "the-word-became-flesh", collection: "Jesus Christ and the incarnation", steps: [
    { title: "The Word was God", reference: "John 1:1", explanation: "The Word belongs to God and is God." },
    { title: "Creation through the Word", reference: "John 1:3", explanation: "Everything created comes through the Word." },
    { title: "The Old Testament background", reference: "Psalm 33:6", explanation: "God creates by His own Word and breath." },
    { title: "The turning point", reference: "John 1:14", explanation: "The Word becomes flesh." },
    { title: "The holy child called Son", reference: "Luke 1:35", explanation: "The angel connects Son of God to conception and birth." }
  ]}),
  pathway({ slug: "son-was-born", title: "The Son Was Born", summary: "Trace Sonship through conception, birth, human life, and saving mission.", estimatedMinutes: 10, level: "Intermediate", topicSlug: "the-son-of-god", collection: "Jesus Christ and the incarnation", steps: [
    { title: "A child born, a Son given", reference: "Isaiah 9:6", explanation: "The prophecy locates Sonship in the born child while naming divine identity." },
    { title: "Therefore called Son", reference: "Luke 1:35", explanation: "The angel connects the title to the miraculous conception." },
    { title: "Made of a woman", reference: "Galatians 4:4", explanation: "The Son enters history under the law." },
    { title: "The Son truly grows", reference: "Luke 2:52", explanation: "Jesus lives a real human life." },
    { title: "The man Christ Jesus", reference: "1 Timothy 2:5", explanation: "The mediator genuinely represents humanity before the one God." }
  ]}),
  pathway({ slug: "father-dwells-in-son", title: "The Father Dwells in the Son", summary: "Use Jesus' own explanation of the Father's presence and work in Him.", estimatedMinutes: 9, level: "Foundational", topicSlug: "the-father-in-the-son", collection: "Jesus Christ and the incarnation", steps: [
    { title: "Knowing Jesus, knowing the Father", reference: "John 14:7", explanation: "Jesus says truly knowing Him brings knowledge of the Father." },
    { title: "Seeing Jesus, seeing the Father", reference: "John 14:9", explanation: "Jesus points to His own life as the Father's visible revelation." },
    { title: "The Father dwells and works", reference: "John 14:10", explanation: "Jesus explains that the Father in Him performs the works." },
    { title: "God reconciling in Christ", reference: "2 Corinthians 5:19", explanation: "The saving mission is God present in Christ." },
    { title: "All fullness bodily", reference: "Colossians 2:9", explanation: "The complete divine fullness dwells bodily in Christ." }
  ]}),
  pathway({ slug: "jesus-image-of-god", title: "Jesus Is the Image of God", summary: "See how the invisible God becomes visible and knowable in Christ.", estimatedMinutes: 9, level: "Intermediate", topicSlug: "the-father-in-the-son", collection: "Jesus Christ and the incarnation", steps: [
    { title: "The unseen God declared", reference: "John 1:18", explanation: "The Son makes the invisible God known." },
    { title: "The Father seen in Jesus", reference: "John 14:9", explanation: "Jesus answers the desire to see the Father by pointing to Himself." },
    { title: "Image of the invisible God", reference: "Colossians 1:15", explanation: "Christ gives visible expression to the invisible God." },
    { title: "Fullness dwelling", reference: "Colossians 1:19", explanation: "The image is complete because divine fullness dwells in Christ." },
    { title: "Exact expression", reference: "Hebrews 1:3", explanation: "The Son radiates God's glory and expresses His being." }
  ]}),
  pathway({ slug: "fullness-of-godhead", title: "The Fullness of the Godhead", summary: "Build Paul's case that God's complete fullness dwells bodily in Jesus Christ.", estimatedMinutes: 9, level: "Intermediate", topicSlug: "jesus-is-god", collection: "Jesus Christ and the incarnation", steps: [
    { title: "God in Christ", reference: "2 Corinthians 5:19", explanation: "Reconciliation is God's own action in Christ." },
    { title: "The Father dwelling", reference: "John 14:10", explanation: "Jesus says the Father in Him performs the works." },
    { title: "The visible image", reference: "Colossians 1:15", explanation: "Christ is the visible revelation of the invisible God." },
    { title: "All fullness", reference: "Colossians 1:19", explanation: "Paul says all fullness was pleased to dwell in Christ." },
    { title: "All fullness bodily", reference: "Colossians 2:9", explanation: "Paul removes ambiguity: all deity dwells bodily in Christ." }
  ]}),
  pathway({ slug: "name-of-jesus", title: "The Name of Jesus", summary: "Follow the saving name through revelation, salvation, worship, and baptism.", estimatedMinutes: 11, level: "Foundational", topicSlug: "the-name-of-jesus", collection: "Salvation and new birth", steps: [
    { title: "The saving name given", reference: "Matthew 1:21", explanation: "The child is named Jesus because He will save His people from their sins." },
    { title: "The Father's name manifested", reference: "John 17:6", explanation: "Jesus says He manifested the Father's name." },
    { title: "No other saving name", reference: "Acts 4:12", explanation: "The apostles center salvation in the name of Jesus." },
    { title: "The name above every name", reference: "Philippians 2:9–11", explanation: "Universal confession and worship center on Jesus Christ as Lord." },
    { title: "Everything in Jesus' name", reference: "Colossians 3:17", explanation: "Every word and deed comes under His name and authority." }
  ]}),
  pathway({ slug: "matthew-28-and-acts-2", title: "Matthew 28:19 and Acts 2:38", summary: "Read Jesus' command and its apostolic fulfillment together.", estimatedMinutes: 10, level: "Foundational", topicSlug: "the-name-of-jesus", collection: "Salvation and new birth", steps: [
    { title: "Notice the singular name", reference: "Matthew 28:19", explanation: "Jesus commands baptism into one name." },
    { title: "The commission in His name", reference: "Luke 24:46–47", explanation: "Repentance and remission are proclaimed in Jesus' name." },
    { title: "The apostles begin the mission", reference: "Acts 2:38", explanation: "Peter commands baptism in the name of Jesus Christ." },
    { title: "The pattern crosses boundaries", reference: "Acts 8:16", explanation: "Samaritan believers receive the same baptismal name." },
    { title: "The pattern is corrected and repeated", reference: "Acts 19:5", explanation: "Paul baptizes disciples into the name of the Lord Jesus." }
  ]}),
  pathway({ slug: "baptism-in-jesus-name", title: "Baptism in Jesus' Name", summary: "Follow the explicit baptismal language and its meaning through Acts and the epistles.", estimatedMinutes: 12, level: "Foundational", topicSlug: "the-name-of-jesus", collection: "Salvation and new birth", steps: [
    { title: "The risen Lord's commission", reference: "Luke 24:46–47", explanation: "Jesus commands repentance and remission in His name." },
    { title: "The first apostolic response", reference: "Acts 2:38", explanation: "Peter joins repentance, Jesus-name baptism, and the Holy Ghost." },
    { title: "The pattern continues", reference: "Acts 8:16", explanation: "Samaritans are baptized in the name of the Lord Jesus." },
    { title: "Gentiles are commanded", reference: "Acts 10:47–48", explanation: "Spirit reception does not cancel water baptism." },
    { title: "Buried with Christ", reference: "Romans 6:3–4", explanation: "Baptism identifies believers with Christ's death and burial." },
    { title: "Faith in God's operation", reference: "Colossians 2:12", explanation: "Baptism works through faith in God's saving action." }
  ]}),
  pathway({ slug: "new-birth", title: "The New Birth", summary: "Connect Jesus' teaching about water and Spirit with the apostolic response in Acts.", estimatedMinutes: 12, level: "Foundational", topicSlug: "the-new-birth", collection: "Salvation and new birth", steps: [
    { title: "Birth from above required", reference: "John 3:3", explanation: "Jesus says no one can see God's kingdom without being born again." },
    { title: "Water and Spirit", reference: "John 3:5", explanation: "Entrance into the kingdom requires birth of water and Spirit." },
    { title: "The apostolic answer", reference: "Acts 2:37–38", explanation: "Convicted hearers are told to repent, be baptized, and receive the Holy Ghost." },
    { title: "The promise continues", reference: "Acts 2:39", explanation: "The promise extends to all whom God calls." },
    { title: "Water and Spirit distinguished", reference: "Acts 8:14–17", explanation: "The Samaritans were baptized but still needed to receive the Spirit." },
    { title: "Washing and renewal", reference: "Titus 3:5–6", explanation: "Paul joins washing and renewal by the Holy Ghost under God's mercy." }
  ]}),
  pathway({ slug: "repentance", title: "Repentance", summary: "See repentance as a commanded turning toward God, not mere regret.", estimatedMinutes: 9, level: "Foundational", topicSlug: "the-new-birth", collection: "Salvation and new birth", steps: [
    { title: "Jesus opens with repentance", reference: "Mark 1:15", explanation: "The kingdom announcement demands repentance and faith." },
    { title: "Repentance is necessary", reference: "Luke 13:3", explanation: "Jesus warns against refusing to turn." },
    { title: "Part of the commission", reference: "Luke 24:46–47", explanation: "The risen Christ commands repentance and remission to every nation." },
    { title: "The first response", reference: "Acts 2:37–38", explanation: "Peter answers conviction with a direct command to repent." },
    { title: "Godly sorrow produces change", reference: "2 Corinthians 7:10", explanation: "Godly grief produces repentance that leads toward salvation." }
  ]}),
  pathway({ slug: "receiving-the-holy-ghost", title: "Receiving the Holy Ghost", summary: "Trace the promise, reception, and recognizable experience of the Holy Ghost.", estimatedMinutes: 12, level: "Foundational", topicSlug: "the-new-birth", collection: "Salvation and new birth", steps: [
    { title: "The promise", reference: "Joel 2:28–29", explanation: "God promises to pour out His Spirit across generations." },
    { title: "With you and in you", reference: "John 14:16–18", explanation: "The Comforter will dwell in the disciples." },
    { title: "The promise arrives", reference: "Acts 2:1–4", explanation: "All are filled and speak as the Spirit gives utterance." },
    { title: "Promised to those God calls", reference: "Acts 2:38–39", explanation: "Peter extends the gift beyond the first audience." },
    { title: "Gentiles visibly receive", reference: "Acts 10:44–46", explanation: "Their reception is recognized by what is heard." },
    { title: "Believers asked and filled", reference: "Acts 19:1–6", explanation: "Paul asks about reception and the disciples receive the Spirit." }
  ]}),
  pathway({ slug: "tongues-as-initial-sign", title: "Tongues as the Initial Sign", summary: "Distinguish the repeated reception sign in Acts from the public gift in Corinthians.", estimatedMinutes: 11, level: "Intermediate", topicSlug: "the-new-birth", collection: "Salvation and new birth", steps: [
    { title: "All speak at Pentecost", reference: "Acts 2:1–4", explanation: "Every person filled speaks with other tongues." },
    { title: "Seen and heard", reference: "Acts 2:33", explanation: "Peter calls the outpouring observable." },
    { title: "The identifying sign", reference: "Acts 10:44–46", explanation: "The Gentiles' reception is recognized because they speak with tongues." },
    { title: "The same gift as at the beginning", reference: "Acts 11:15–17", explanation: "Peter compares the Gentile experience directly to Pentecost." },
    { title: "The pattern appears again", reference: "Acts 19:6", explanation: "The Ephesian disciples speak with tongues when the Spirit comes." },
    { title: "The public gift is distributed", reference: "1 Corinthians 12:30", explanation: "Paul's question concerns ministry in the assembled body." }
  ]}),
  pathway({ slug: "gospel-pattern", title: "The Gospel Pattern", summary: "Move from Christ's death, burial, and resurrection into the believer's response.", estimatedMinutes: 10, level: "Foundational", topicSlug: "the-new-birth", collection: "Salvation and new birth", steps: [
    { title: "The gospel events", reference: "1 Corinthians 15:1–4", explanation: "Christ died, was buried, and rose again." },
    { title: "The risen Christ commissions the response", reference: "Luke 24:46–47", explanation: "The gospel leads into repentance and remission in His name." },
    { title: "The apostolic response", reference: "Acts 2:38", explanation: "Repentance, baptism, and the Holy Ghost answer conviction." },
    { title: "Death and burial applied", reference: "Romans 6:3–4", explanation: "Baptism joins believers to Christ's death and burial." },
    { title: "Resurrection life by the Spirit", reference: "Romans 8:11", explanation: "The Spirit who raised Jesus gives life to believers." }
  ]}),
  pathway({ slug: "faith-grace-and-obedience", title: "Faith, Grace, and Obedience", summary: "Answer the false choice between grace and an obedient response of faith.", estimatedMinutes: 11, level: "Intermediate", topicSlug: "the-new-birth", collection: "Questions and biblical interpretation", steps: [
    { title: "Start with grace", reference: "Ephesians 2:8–10", explanation: "Salvation is God's gift and creates a life of obedience." },
    { title: "The obedience of faith", reference: "Romans 1:5", explanation: "Paul joins grace, apostleship, faith, and obedience." },
    { title: "Faith works through love", reference: "Galatians 5:6", explanation: "Biblical faith is active rather than lifeless." },
    { title: "Dead faith", reference: "James 2:17", explanation: "Faith with no corresponding action is dead." },
    { title: "Baptism through faith", reference: "Colossians 2:12", explanation: "Baptism is faith in God's operation, not confidence in human merit." }
  ]}),
  pathway({ slug: "right-hand-of-god", title: "The Right Hand of God", summary: "Read right-hand language as power, victory, exaltation, and authority.", estimatedMinutes: 10, level: "Intermediate", topicSlug: "right-hand-of-god", collection: "Questions and biblical interpretation", steps: [
    { title: "Scripture defines the symbol", reference: "Exodus 15:6", explanation: "God's right hand is glorious in power." },
    { title: "The LORD's right hand acts", reference: "Psalm 118:16", explanation: "The symbol describes divine action and victory." },
    { title: "Messianic exaltation", reference: "Psalm 110:1", explanation: "The Messiah is placed in supreme authority." },
    { title: "Peter explains the exaltation", reference: "Acts 2:32–36", explanation: "The risen Jesus receives and exercises messianic authority." },
    { title: "The kingdom reaches its goal", reference: "1 Corinthians 15:24–28", explanation: "Mediatorial rule completes its saving purpose under the one God." }
  ]}),
  pathway({ slug: "jesus-prayers-and-humanity", title: "Jesus' Prayers and Humanity", summary: "Keep Christ's genuine human life and the Father's full indwelling together.", estimatedMinutes: 12, level: "Intermediate", topicSlug: "the-son-of-god", collection: "Questions and biblical interpretation", steps: [
    { title: "Begin with the incarnation", reference: "Luke 1:35", explanation: "The Son is the holy child conceived by the Holy Ghost." },
    { title: "Real human growth", reference: "Luke 2:52", explanation: "Jesus develops in wisdom and stature." },
    { title: "The Father dwelling in Him", reference: "John 14:10", explanation: "Humanity does not exclude deity." },
    { title: "A genuine human will", reference: "Matthew 26:39", explanation: "Jesus' human will submits to the divine will." },
    { title: "Prayer in the days of His flesh", reference: "Hebrews 5:7–8", explanation: "Hebrews locates prayer and learned obedience in His incarnate life." },
    { title: "All fullness remains", reference: "Colossians 2:9", explanation: "The praying Son is still the bodily dwelling of all divine fullness." }
  ]})
];

export const pathwayCollections: Array<{ title: PathwayCollection; description: string }> = [
  { title: "One God and divine identity", description: "Start with who God is before asking how He is revealed in Christ." },
  { title: "Jesus Christ and the incarnation", description: "Follow deity, Sonship, indwelling, image, and the Word made flesh." },
  { title: "Salvation and new birth", description: "Trace the gospel response, the saving name, water baptism, and the Holy Ghost." },
  { title: "Questions and biblical interpretation", description: "Work through common objections using Scripture's own language and patterns." }
];

export function pathwayBySlug(slug: string) {
  return allPathways.find((item) => item.slug === slug);
}
