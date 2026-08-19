import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";

export type ClusterLink = {
  href: string;
  title: string;
  description: string;
  kind: string;
};

export type SearchIntentClusterDefinition = {
  heading: string;
  intro: string;
  paths: string[];
  links: ClusterLink[];
};

export const searchIntentClusters: SearchIntentClusterDefinition[] = [
  {
    heading: "Questions about the deity of Jesus",
    intro: "Follow the connected passages and questions that define who Jesus is without separating his deity from his genuine humanity.",
    paths: [
      "/topics/jesus-is-god",
      "/pathways/jesus-is-god",
      "/pathways/fullness-of-godhead",
      "/answers/is-jesus-god",
      "/answers/is-jesus-the-father",
      "/answers/why-did-jesus-pray",
      "/scripture/john/1/1",
      "/scripture/colossians/2/9",
      "/scripture/john/20/28",
      "/articles/the-one-god-revealed-in-jesus-christ"
    ],
    links: [
      { href: "/answers/is-jesus-god", title: "Is Jesus God?", description: "See the direct biblical case for Christ's deity.", kind: "Direct answer" },
      { href: "/pathways/jesus-is-god", title: "Jesus Is God Bible Study", description: "Follow the strongest passages in a guided sequence.", kind: "Guided pathway" },
      { href: "/scripture/colossians/2/9", title: "What does Colossians 2:9 mean?", description: "Study Paul's statement that all divine fullness dwells bodily in Christ.", kind: "Scripture study" },
      { href: "/answers/is-jesus-the-father", title: "Is Jesus the Father?", description: "Read John 14 without erasing either the Father or the Son.", kind: "Related question" },
      { href: "/answers/why-did-jesus-pray", title: "Why did Jesus pray if he is God?", description: "Understand prayer through Christ's genuine humanity.", kind: "Related question" },
      { href: "/articles/the-one-god-revealed-in-jesus-christ", title: "The One God Revealed in Jesus Christ", description: "Connect divine identity, incarnation, and the biblical confession of one God.", kind: "Article" }
    ]
  },
  {
    heading: "Questions about the Son and Jesus' prayers",
    intro: "Trace the Son's birth, humanity, prayer, mediation, and the Father's full presence in Christ.",
    paths: [
      "/topics/the-son-of-god",
      "/pathways/son-was-born",
      "/pathways/jesus-prayers-and-humanity",
      "/answers/why-did-jesus-pray",
      "/answers/who-was-jesus-praying-to",
      "/answers/did-the-son-exist-eternally",
      "/answers/why-is-jesus-called-son-of-god",
      "/scripture/hebrews/5/7",
      "/scripture/john/17/1-5",
      "/articles/why-jesus-prayed",
      "/articles/understanding-the-son-of-god"
    ],
    links: [
      { href: "/answers/why-did-jesus-pray", title: "Why did Jesus pray if he is God?", description: "See why prayer belongs to the real human life of the Son.", kind: "Direct answer" },
      { href: "/answers/who-was-jesus-praying-to", title: "Who was Jesus praying to?", description: "Distinguish the praying man Christ Jesus from the eternal God without creating two Gods.", kind: "Related question" },
      { href: "/answers/did-the-son-exist-eternally", title: "Did the Son exist eternally?", description: "Distinguish the eternal divine identity from sonship in the incarnation.", kind: "Related question" },
      { href: "/pathways/jesus-prayers-and-humanity", title: "Jesus' Prayers and Humanity", description: "Follow the prayer and humanity passages in sequence.", kind: "Guided pathway" },
      { href: "/scripture/hebrews/5/7", title: "Hebrews 5:7 meaning", description: "Study Jesus' prayers in “the days of his flesh.”", kind: "Scripture study" },
      { href: "/articles/why-jesus-prayed", title: "Why Jesus Prayed", description: "Go deeper into prayer, incarnation, and the Father dwelling in Christ.", kind: "Article" }
    ]
  },
  {
    heading: "Questions about baptism in Jesus' name",
    intro: "Read the Great Commission, the baptism accounts in Acts, and the meaning of baptism into Christ as one connected biblical pattern.",
    paths: [
      "/topics/the-name-of-jesus",
      "/pathways/name-of-jesus",
      "/pathways/matthew-28-and-acts-2",
      "/pathways/baptism-in-jesus-name",
      "/answers/does-matthew-28-19-contradict-acts-2-38",
      "/answers/why-baptize-in-jesus-name",
      "/scripture/matthew/28/19",
      "/scripture/acts/2/38",
      "/scripture/acts/8/16",
      "/scripture/acts/10/48",
      "/scripture/acts/19/5",
      "/articles/matthew-28-19-and-the-name-of-jesus"
    ],
    links: [
      { href: "/answers/does-matthew-28-19-contradict-acts-2-38", title: "Does Matthew 28:19 contradict Acts 2:38?", description: "Read Jesus' command and the apostles' practice together.", kind: "Direct answer" },
      { href: "/answers/why-baptize-in-jesus-name", title: "Why did the apostles baptize in Jesus' name?", description: "Trace the repeated baptismal name through Acts.", kind: "Direct answer" },
      { href: "/pathways/baptism-in-jesus-name", title: "Baptism in Jesus' Name Bible Study", description: "Follow the Acts pattern and its meaning in the epistles.", kind: "Guided pathway" },
      { href: "/scripture/acts/2/38", title: "Acts 2:38 meaning", description: "Study repentance, Jesus-name baptism, and the promise of the Holy Ghost.", kind: "Scripture study" },
      { href: "/scripture/matthew/28/19", title: "Matthew 28:19 meaning", description: "Examine the singular name in the Great Commission.", kind: "Scripture study" },
      { href: "/articles/matthew-28-19-and-the-name-of-jesus", title: "Matthew 28:19 and the Name of Jesus", description: "Compare the commission with its apostolic fulfillment.", kind: "Article" }
    ]
  },
  {
    heading: "Questions about the right hand of God",
    intro: "Let Scripture define right-hand language through power, authority, exaltation, and the Messiah's reign.",
    paths: [
      "/topics/right-hand-of-god",
      "/pathways/right-hand-of-god",
      "/answers/what-does-right-hand-of-god-mean",
      "/scripture/psalm/110/1",
      "/scripture/acts/2/32-36",
      "/scripture/1-corinthians/15/24-28"
    ],
    links: [
      { href: "/answers/what-does-right-hand-of-god-mean", title: "What does the right hand of God mean?", description: "See how the Bible uses right-hand language for power and authority.", kind: "Direct answer" },
      { href: "/pathways/right-hand-of-god", title: "Right Hand of God Bible Study", description: "Follow the Old and New Testament passages in sequence.", kind: "Guided pathway" },
      { href: "/scripture/psalm/110/1", title: "Psalm 110:1 meaning", description: "Study the key messianic text behind New Testament right-hand language.", kind: "Scripture study" },
      { href: "/scripture/acts/2/32-36", title: "Acts 2:32–36 meaning", description: "See how Peter explains Christ's resurrection and exaltation.", kind: "Scripture study" },
      { href: "/scripture/1-corinthians/15/24-28", title: "1 Corinthians 15:24–28 meaning", description: "Follow the purpose and completion of Christ's mediatorial reign.", kind: "Scripture study" }
    ]
  },
  {
    heading: "Questions about the one God",
    intro: "Start with Scripture's repeated confession that the LORD alone is God, then follow how that confession frames the revelation of Jesus Christ.",
    paths: [
      "/topics/god-is-one",
      "/pathways/god-is-one",
      "/pathways/no-god-beside-him",
      "/pathways/god-alone-creator",
      "/scripture/deuteronomy/6/4",
      "/scripture/isaiah/44/6",
      "/scripture/mark/12/29",
      "/answers/is-the-holy-ghost-another-person"
    ],
    links: [
      { href: "/pathways/god-is-one", title: "God Is One Bible Study", description: "Begin with the Shema and the Bible's controlling confession of one God.", kind: "Guided pathway" },
      { href: "/pathways/no-god-beside-him", title: "No God Beside Him", description: "Read the strongest biblical denials of another God beside the LORD.", kind: "Guided pathway" },
      { href: "/scripture/deuteronomy/6/4", title: "Deuteronomy 6:4 meaning", description: "Study Israel's central confession that the LORD is one.", kind: "Scripture study" },
      { href: "/scripture/isaiah/44/6", title: "Isaiah 44:6 meaning", description: "See the First and the Last deny any God beside him.", kind: "Scripture study" },
      { href: "/answers/is-the-holy-ghost-another-person", title: "Is the Holy Ghost another person beside the Father?", description: "Trace the Bible's language for the one Spirit of God.", kind: "Related question" }
    ]
  }
];

function normalizePath(path: string) {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? path;
  return withoutQuery !== "/" ? withoutQuery.replace(/\/$/, "") : withoutQuery;
}

export function searchIntentClusterForPath(path: string) {
  const normalized = normalizePath(path);
  return searchIntentClusters.find((item) => item.paths.includes(normalized)) ?? null;
}

export function SearchIntentCluster({ currentPath }: { currentPath: string }) {
  const path = normalizePath(currentPath);
  const cluster = searchIntentClusterForPath(path);
  if (!cluster) return null;
  const links = cluster.links.filter((item) => normalizePath(item.href) !== path).slice(0, 5);
  if (!links.length) return null;
  const id = `search-intent-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;

  return (
    <section className="smart-next" aria-labelledby={id} data-reveal>
      <div className="smart-next-intro">
        <span className="smart-next-icon"><Search size={19} aria-hidden /></span>
        <span className="eyebrow eyebrow-light">Related Bible questions</span>
        <h2 id={id}>{cluster.heading}</h2>
        <p>{cluster.intro}</p>
      </div>
      <nav className="smart-next-secondary" aria-label={cluster.heading}>
        {links.map((item) => (
          <Link href={item.href} key={item.href}>
            <span><small>{item.kind} · {item.description}</small><strong>{item.title}</strong></span>
            <ArrowRight size={16} />
          </Link>
        ))}
      </nav>
    </section>
  );
}
