export type PublishingPathway = {
  slug: string;
  appSlug: string;
  title: string;
  summary: string;
  level: "Foundational" | "Intermediate";
};

export const publishingPathways: PublishingPathway[] = [
  { slug:"god-is-one", appSlug:"god-is-one", title:"God Is One", summary:"Begin with the Bible's repeated confession that YHWH alone is God.", level:"Foundational" },
  { slug:"no-god-beside-him", appSlug:"no-god-beside-him", title:"No God Beside Him", summary:"Follow Isaiah's repeated declarations that no God exists beside YHWH.", level:"Foundational" },
  { slug:"god-alone-is-creator", appSlug:"god-alone-is-creator", title:"God Alone Is Creator", summary:"Trace the Bible's claim that YHWH created all things by himself.", level:"Foundational" },
  { slug:"jesus-is-god", appSlug:"jesus-is-god", title:"Jesus Is God", summary:"Follow the biblical evidence identifying Jesus Christ with the one God revealed in Scripture.", level:"Foundational" },
  { slug:"the-word-became-flesh", appSlug:"the-word-became-flesh", title:"The Word Became Flesh", summary:"Follow John's language from the eternal Word to the incarnation.", level:"Intermediate" },
  { slug:"the-son-was-born", appSlug:"the-son-was-born", title:"The Son Was Born", summary:"Let Scripture define sonship through conception, birth, and incarnation.", level:"Intermediate" },
  { slug:"the-father-dwells-in-the-son", appSlug:"father-dwells-in-son", title:"The Father Dwells in the Son", summary:"Read Jesus' own explanation of the Father dwelling and working in him.", level:"Intermediate" },
  { slug:"jesus-is-the-image-of-god", appSlug:"jesus-is-the-image-of-god", title:"Jesus Is the Image of God", summary:"Study Jesus as the visible image of the invisible God.", level:"Intermediate" },
  { slug:"the-fullness-of-the-godhead", appSlug:"the-fullness-of-the-godhead", title:"The Fullness of the Godhead", summary:"Focus on Paul's statement that all divine fullness dwells bodily in Christ.", level:"Intermediate" },
  { slug:"the-name-of-jesus", appSlug:"the-name-of-jesus", title:"The Name of Jesus", summary:"Trace the saving name revealed and preached by the apostles.", level:"Foundational" },
  { slug:"matthew-28-19-and-acts-2-38", appSlug:"matthew-28-19-and-acts-2-38", title:"Matthew 28:19 & Acts 2:38", summary:"Read the commission and apostolic execution together.", level:"Intermediate" },
  { slug:"baptism-in-jesus-name", appSlug:"baptism-in-jesus-name", title:"Baptism in Jesus' Name", summary:"Follow the apostolic baptismal pattern in Acts.", level:"Foundational" },
  { slug:"the-new-birth", appSlug:"the-new-birth", title:"The New Birth", summary:"Read John 3 and Acts 2 together as one apostolic salvation message.", level:"Foundational" },
  { slug:"repentance", appSlug:"repentance", title:"Repentance", summary:"Study repentance as the biblical turning of heart, mind, and life toward God.", level:"Foundational" },
  { slug:"receiving-the-holy-ghost", appSlug:"receiving-the-holy-ghost", title:"Receiving the Holy Ghost", summary:"Follow the promise and fulfillment of the Spirit in Acts.", level:"Foundational" },
  { slug:"tongues-initial-sign", appSlug:"tongues-initial-sign", title:"Tongues Initial Sign", summary:"Examine the repeated connection between receiving the Spirit and speaking in tongues.", level:"Intermediate" },
  { slug:"the-gospel-pattern", appSlug:"the-gospel-pattern", title:"The Gospel Pattern", summary:"Trace Christ's death, burial, and resurrection into the believer's response.", level:"Foundational" },
  { slug:"faith-grace-and-obedience", appSlug:"faith-grace-and-obedience", title:"Faith, Grace, and Obedience", summary:"Read biblical faith as trusting response rather than passive agreement.", level:"Intermediate" },
  { slug:"the-right-hand-of-god", appSlug:"right-hand-of-god", title:"The Right Hand of God", summary:"Understand right-hand language as authority, power, and exaltation.", level:"Intermediate" },
  { slug:"jesus-prayers-and-humanity", appSlug:"jesus-prayers-and-humanity", title:"Jesus' Prayers and Humanity", summary:"See how Jesus' prayers reveal genuine humanity without canceling his deity.", level:"Intermediate" }
];
