export type PublishingPathway = {
  slug: string;
  appSlug: string;
  title: string;
  summary: string;
  level: "Foundational" | "Intermediate";
  collection: "One God and divine identity" | "Jesus Christ and the incarnation" | "Salvation and new birth" | "Questions and biblical interpretation";
  estimatedMinutes: number;
  keySteps: number;
};

// Source of truth for Studio publishing projects.
// Keep this list aligned with https://www.apostolicguide.com/pathways.
export const publishingPathways: PublishingPathway[] = [
  { slug: "god-is-one", appSlug: "god-is-one", title: "God Is One", summary: "Begin with Scripture's controlling confession of one indivisible God.", level: "Foundational", collection: "One God and divine identity", estimatedMinutes: 10, keySteps: 5 },
  { slug: "no-god-beside-him", appSlug: "no-god-beside-him", title: "No God Beside Him", summary: "Follow the Bible's clearest denials of another God with, beside, before, or after the LORD.", level: "Foundational", collection: "One God and divine identity", estimatedMinutes: 9, keySteps: 5 },
  { slug: "god-alone-creator", appSlug: "god-alone-creator", title: "God Alone Is Creator", summary: "Compare the LORD creating alone with New Testament creation language about Christ.", level: "Intermediate", collection: "One God and divine identity", estimatedMinutes: 10, keySteps: 5 },

  { slug: "jesus-is-god", appSlug: "jesus-is-god", title: "Jesus Is God", summary: "Build a direct biblical case for the absolute deity of Jesus Christ.", level: "Foundational", collection: "Jesus Christ and the incarnation", estimatedMinutes: 12, keySteps: 6 },
  { slug: "word-became-flesh", appSlug: "word-became-flesh", title: "The Word Became Flesh", summary: "Follow God's eternal Word into the genuine humanity of Jesus Christ.", level: "Intermediate", collection: "Jesus Christ and the incarnation", estimatedMinutes: 11, keySteps: 5 },
  { slug: "son-was-born", appSlug: "son-was-born", title: "The Son Was Born", summary: "Trace Sonship through conception, birth, human life, and saving mission.", level: "Intermediate", collection: "Jesus Christ and the incarnation", estimatedMinutes: 10, keySteps: 5 },
  { slug: "father-dwells-in-son", appSlug: "father-dwells-in-son", title: "The Father Dwells in the Son", summary: "Use Jesus' own explanation of the Father's presence and work in Him.", level: "Foundational", collection: "Jesus Christ and the incarnation", estimatedMinutes: 9, keySteps: 5 },
  { slug: "jesus-image-of-god", appSlug: "jesus-image-of-god", title: "Jesus Is the Image of God", summary: "See how the invisible God becomes visible and knowable in Christ.", level: "Intermediate", collection: "Jesus Christ and the incarnation", estimatedMinutes: 9, keySteps: 5 },
  { slug: "fullness-of-godhead", appSlug: "fullness-of-godhead", title: "The Fullness of the Godhead", summary: "Build Paul's case that God's complete fullness dwells bodily in Jesus Christ.", level: "Intermediate", collection: "Jesus Christ and the incarnation", estimatedMinutes: 9, keySteps: 5 },

  { slug: "name-of-jesus", appSlug: "name-of-jesus", title: "The Name of Jesus", summary: "Follow the saving name through revelation, salvation, worship, and baptism.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 11, keySteps: 5 },
  { slug: "matthew-28-and-acts-2", appSlug: "matthew-28-and-acts-2", title: "Matthew 28:19 and Acts 2:38", summary: "Read Jesus' command and its apostolic fulfillment together.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 10, keySteps: 5 },
  { slug: "baptism-in-jesus-name", appSlug: "baptism-in-jesus-name", title: "Baptism in Jesus' Name", summary: "Follow the explicit baptismal language and its meaning through Acts and the epistles.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 12, keySteps: 6 },
  { slug: "new-birth", appSlug: "new-birth", title: "The New Birth", summary: "Connect Jesus' teaching about water and Spirit with the apostolic response in Acts.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 12, keySteps: 6 },
  { slug: "repentance", appSlug: "repentance", title: "Repentance", summary: "See repentance as a commanded turning toward God, not mere regret.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 9, keySteps: 5 },
  { slug: "receiving-the-holy-ghost", appSlug: "receiving-the-holy-ghost", title: "Receiving the Holy Ghost", summary: "Trace the promise, reception, and recognizable experience of the Holy Ghost.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 12, keySteps: 6 },
  { slug: "tongues-as-initial-sign", appSlug: "tongues-as-initial-sign", title: "Tongues as the Initial Sign", summary: "Distinguish the repeated reception sign in Acts from the public gift in Corinthians.", level: "Intermediate", collection: "Salvation and new birth", estimatedMinutes: 11, keySteps: 6 },
  { slug: "gospel-pattern", appSlug: "gospel-pattern", title: "The Gospel Pattern", summary: "Move from Christ's death, burial, and resurrection into the believer's response.", level: "Foundational", collection: "Salvation and new birth", estimatedMinutes: 10, keySteps: 5 },

  { slug: "faith-grace-and-obedience", appSlug: "faith-grace-and-obedience", title: "Faith, Grace, and Obedience", summary: "Answer the false choice between grace and an obedient response of faith.", level: "Intermediate", collection: "Questions and biblical interpretation", estimatedMinutes: 11, keySteps: 5 },
  { slug: "right-hand-of-god", appSlug: "right-hand-of-god", title: "The Right Hand of God", summary: "Read right-hand language as power, victory, exaltation, and authority.", level: "Intermediate", collection: "Questions and biblical interpretation", estimatedMinutes: 10, keySteps: 5 },
  { slug: "jesus-prayers-and-humanity", appSlug: "jesus-prayers-and-humanity", title: "Jesus' Prayers and Humanity", summary: "Keep Christ's genuine human life and the Father's full indwelling together.", level: "Intermediate", collection: "Questions and biblical interpretation", estimatedMinutes: 12, keySteps: 6 }
];
