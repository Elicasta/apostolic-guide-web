import type { TeleprompterDocument } from "./types";

export const TELEPROMPTER_STORAGE_KEY = "ag:teleprompter:documents:v1";

export const JESUS_IS_GOD_SAMPLE = `# Jesus Is God
If Jesus isn't God, then we have to explain some things.

I don't mean what Oneness says.
I don't mean what the Trinity says.

**What do we do with the Bible?**
@note Start conversationally. Let the question breathe.

---

# Start With One God
Before we even get to Jesus, we have to start here.

**How many Gods are there?**

> I am the first, and I am the last; and beside me there is no God.
@ref Isaiah 44:6
@note Read the final phrase slowly.

---

# Before. After. Beside.
Before Him? No God.

After Him? No God.

Beside Him? No God.

So I'm not looking for a way to put Jesus beside God as another God.
@ref Isaiah 43:10; 44:6

---

# Who Created Everything?
Isaiah says God created everything **alone** and **by Himself**.

John says everything was made through the Word.

So... **who is the Word?**
@ref Isaiah 44:24; John 1:1-3
@note Pause after "by Himself." Then move to John.

---

# The Word Was God
If I make the Word another God helping God create, I just created a problem with Isaiah.

John already gave us the answer:

**The Word was God.**
@ref John 1:1

---

# The Word Became Flesh
It doesn't say the Word stood next to a man.

It doesn't say the Word occasionally used a man.

**The Word was made flesh.**
@ref John 1:14
@note Keep this simple. Do not rush into every incarnation objection yet.

---

# What Did Thomas Call Jesus?
Thomas is standing in front of Jesus and says:

> My Lord and my God.

If Jesus isn't God, this would be a pretty good place for Jesus to correct him.
@ref John 20:28-29

---

# How Much Of God?
Paul doesn't say some of God.

Not part.

Not one-third.

**All the fullness of the Godhead bodily.**
@ref Colossians 2:9

---

# Then Why Did Jesus Pray?
Good question.

But first ask something else:

**Does prayer erase humanity, or does prayer prove humanity?**
@ref 1 Timothy 3:16
@note This is a bridge. Do not turn it into Episode 2.

---

# Who Is The Savior?
God says there is no Savior beside Him.

Luke calls Jesus the Savior.

Matthew says Jesus will save **His people** from their sins.

So who is Jesus?
@ref Isaiah 43:11; Luke 2:11; Matthew 1:21

---

# Put It Together
One God.

No God beside Him.

He created everything alone.

The Word was God.

The Word became flesh.

Thomas calls Jesus **my God**.

All the fullness dwells in Him bodily.

Jesus is our Savior.

**Who is Jesus?**

---

# Where We Go Next
If Jesus is God...

**who was He praying to?**

Good.

Because if our doctrine is true, it has to explain all of Scripture.

Comment **JESUS** and I'll send you the Scripture pathway.
@note Finish calm. Invitation, not a victory lap.`;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTeleprompterDocument(
  title = "Untitled Script",
  content = "# Opening\nStart here.\n\n@note Add a private speaker cue here.\n\n---\n\n# Next Thought\nOne idea per slide.",
): TeleprompterDocument {
  const now = new Date().toISOString();
  return { id: makeId(), title, content, createdAt: now, updatedAt: now };
}

export function getSeedDocuments(): TeleprompterDocument[] {
  return [createTeleprompterDocument("Jesus Is God", JESUS_IS_GOD_SAMPLE)];
}

export function loadTeleprompterDocuments(): TeleprompterDocument[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY);
    if (!raw) {
      const seed = getSeedDocuments();
      saveTeleprompterDocuments(seed);
      return seed;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = getSeedDocuments();
      saveTeleprompterDocuments(seed);
      return seed;
    }

    return parsed as TeleprompterDocument[];
  } catch {
    return getSeedDocuments();
  }
}

export function saveTeleprompterDocuments(documents: TeleprompterDocument[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(documents));
}

export function duplicateTeleprompterDocument(document: TeleprompterDocument) {
  return createTeleprompterDocument(`${document.title} Copy`, document.content);
}
