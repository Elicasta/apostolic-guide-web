import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCTRINE_EPISODES,
  TELEPROMPTER_DOCTRINE_SEED_KEY,
  TELEPROMPTER_DOCTRINE_SEED_VERSION,
  doctrineDocumentId,
  getDoctrineSeedDocuments,
} from "../src/lib/teleprompter/doctrine";
import {
  TELEPROMPTER_EPISODE_SEED_KEY,
  TELEPROMPTER_EPISODE_SEED_VERSION,
  getEpisodeSeedDocuments,
} from "../src/lib/teleprompter/episodes";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import {
  TELEPROMPTER_PERSONAL_SEED_KEY,
  TELEPROMPTER_PERSONAL_SEED_VERSION,
} from "../src/lib/teleprompter/personal";
import { TELEPROMPTER_LEGACY_ARCHIVE_KEY, loadTeleprompterDocuments } from "../src/lib/teleprompter/seeded-storage";
import { TELEPROMPTER_STORAGE_KEY } from "../src/lib/teleprompter/storage";
import type { TeleprompterDocument } from "../src/lib/teleprompter/types";

const FORBIDDEN_IN_TEACHING = [
  /\bthree persons\b/i,
  /\bGod the Son\b/,
  /\bsecond person\b/i,
  /\btrinity\b/i,
];

const seeds = getDoctrineSeedDocuments();

test("doctrine library adds episodes 01 through 24 under distinct draft ids", () => {
  assert.equal(DOCTRINE_EPISODES.length, 24);
  assert.deepEqual(
    seeds.map((seed) => seed.id),
    DOCTRINE_EPISODES.map((episode) => doctrineDocumentId(episode.number)),
  );
  assert.equal(new Set(seeds.map((seed) => seed.id)).size, 24);
  assert.ok(seeds.every((seed) => /^ag-doctrine-ep-(0[1-9]|1\d|2[0-4])$/.test(seed.id)));
  assert.ok(seeds.every((seed) => !seed.id.startsWith("apostolic-guide-episode-")));

  DOCTRINE_EPISODES.forEach((episode, index) => {
    const number = String(episode.number).padStart(2, "0");
    assert.equal(
      seeds[index].title,
      `AG Doctrine ${number} · ${episode.title} · Batch ${episode.batch}: ${episode.batchLabel}`,
    );
  });
});

test("all 24 doctrine narrations move from opening through each canonical verse to a connected conclusion", () => {
  DOCTRINE_EPISODES.forEach((episode, index) => {
    const slides = parseTeleprompterDocument(seeds[index].content);
    assert.deepEqual(
      slides.map((slide) => slide.heading),
      [episode.title, ...episode.verses.map((verse) => verse.reference), "Bring It Together"],
      episode.title,
    );
    assert.equal(slides[0].reference, episode.pathway);
    const opening = slides[0].body.join(" ");
    const close = slides.at(-1)?.body.join(" ") ?? "";
    assert.ok(opening.length > 100, episode.title + " opening is too thin");
    assert.ok(close.length > 120, episode.title + " conclusion is too thin");
    assert.ok(close.includes(episode.pathway.split(" / ")[0]), episode.title + " misses its Pathway");
    assert.equal(seeds[index].content.includes("# The Claim"), false);
    assert.equal(seeds[index].content.includes("# The Objection"), false);
    assert.equal(seeds[index].content.includes("# The Answer"), false);
    assert.equal(seeds[index].content.includes("# Reel Cues"), false);

    episode.verses.forEach((verse) => {
      const slide = slides.find((candidate) => candidate.heading === verse.reference);
      assert.ok(slide, episode.title + " missing " + verse.reference);
      assert.deepEqual(slide.quotes, [verse.text]);
      assert.ok(slide.body.join(" ").length > verse.text.length + 150,
        episode.title + " / " + verse.reference + " needs actual teaching between references");
    });
  });
});

test("recording voice keeps cumulative Scripture-first explanations instead of template fragments", () => {
  // Manuscript lines wrap for large-type teleprompter reading. Assertions
  // inspect spoken prose, not the display line-break layout.
  const spoken = (episodeNumber: number) => scriptFor(episodeNumber).replace(/\s+/g, " ");
  assert.match(spoken(13), /do not use Jesus' humanity to erase His deity/i);
  assert.match(spoken(14), /He was praying to the Father/i);
  assert.match(spoken(7), /the Father dwells in Me/i);
  assert.match(spoken(18), /Matthew gives the commission/i);
  assert.match(spoken(23), /initial reception sign/i);
  assert.equal(seeds.every((seed) => seed.content.includes("Often stated.")), false);
});

test("doctrine drafts keep the source KJV spellings, including Isaiah 9:6 Counsellor", () => {
  const joined = seeds.map((seed) => seed.content).join("\n");
  assert.equal(joined.includes("Counseller"), false);
  assert.match(
    scriptFor(7),
    /Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace\./,
  );
  assert.match(
    scriptFor(24),
    /Wonderful, Counsellor, The mighty God, The everlasting Father, The Prince of Peace\./,
  );
  assert.match(scriptFor(6), /all the fulness of the Godhead bodily/);
  assert.match(scriptFor(6), /in him should all fulness dwell;/);
  assert.match(scriptFor(7), /Shew us the Father\?/);
  assert.match(scriptFor(15), /looked up stedfastly into heaven/);
  assert.match(scriptFor(22), /To day shalt thou be with me in paradise/);
  assert.match(scriptFor(10), /made of a woman, made under the law,/);
  assert.match(scriptFor(17), /\(For as yet he was fallen upon none of them: only they were baptized in the name of the Lord Jesus\.\)/);
  assert.match(scriptFor(23), /Then answered Peter,/);
  assert.equal(joined.includes("..."), false);
  assert.equal(joined.includes("…"), false);
});

test("teaching slides do not add Trinitarian wording outside a quoted objection or reel cue", () => {
  for (const seed of seeds) {
    for (const slide of parseTeleprompterDocument(seed.content)) {
      if (slide.heading === "The Objection" || slide.heading === "Reel Cues") continue;
      const spoken = [slide.heading, ...slide.body].join("\n");
      for (const pattern of FORBIDDEN_IN_TEACHING) {
        assert.equal(pattern.test(spoken), false, `${seed.title} / ${slide.heading} contains ${pattern}`);
      }
    }
  }
});

test("doctrine prose stays on short teleprompter lines", () => {
  for (const seed of seeds) {
    const longLines = seed.content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.length > 64 &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith(">") &&
        !trimmed.startsWith("@") &&
        trimmed !== "---"
      );
    });
    assert.deepEqual(longLines, [], seed.title);
  }
});

test("a browser that already has the old seeds receives doctrine drafts without touching edits", () => {
  const episodeOne: TeleprompterDocument = {
    id: "apostolic-guide-episode-01",
    title: "Episode 1: Who Is Jesus?",
    content: "Eli already edited the opening.",
    createdAt: "2026-08-30T06:15:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const custom: TeleprompterDocument = {
    id: "custom-document",
    title: "My custom script",
    content: "# Custom\nDo not overwrite me.",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
  };
  const editedEpisodeTwo: TeleprompterDocument = {
    ...getEpisodeSeedDocuments()[0],
    title: "My edited Episode 2",
    content: "User edit",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
  const original = [episodeOne, custom, editedEpisodeTwo];
  const store = installLocalStorage({
    [TELEPROMPTER_STORAGE_KEY]: JSON.stringify(original),
    [TELEPROMPTER_EPISODE_SEED_KEY]: String(TELEPROMPTER_EPISODE_SEED_VERSION),
    [TELEPROMPTER_PERSONAL_SEED_KEY]: String(TELEPROMPTER_PERSONAL_SEED_VERSION),
  });

  try {
    const loaded = loadTeleprompterDocuments();
    assert.deepEqual(
      loaded.filter((document) => document.id.startsWith("ag-doctrine-ep-")).map((document) => document.id),
      seeds.map((seed) => seed.id),
    );
    assert.ok(loaded.some((document) => document.id === "apostolic-guide-teaching-who-did-jesus-pray-to"));
    // Retired v1 episode drafts are no longer mixed into the rewritten Doctrine library.
    assert.equal(loaded.some((document) => document.id.startsWith("apostolic-guide-episode-")), false);
    const archived = JSON.parse(store.get(TELEPROMPTER_LEGACY_ARCHIVE_KEY) ?? "[]") as TeleprompterDocument[];
    for (const document of original) {
      if (document.id.startsWith("apostolic-guide-episode-")) {
        assert.deepEqual(archived.find((candidate) => candidate.id === document.id), document);
      } else {
        assert.deepEqual(loaded.find((candidate) => candidate.id === document.id), document);
      }
    }
    assert.equal(store.get(TELEPROMPTER_DOCTRINE_SEED_KEY), String(TELEPROMPTER_DOCTRINE_SEED_VERSION));

    const editedDoctrine: TeleprompterDocument = {
      ...loaded[0],
      content: "# Kept edit",
      updatedAt: "2026-11-16T00:00:00.000Z",
    };
    const afterUser = loaded
      .map((document) => (document.id === editedDoctrine.id ? editedDoctrine : document))
      .filter((document) => document.id !== "ag-doctrine-ep-02");
    store.set(TELEPROMPTER_STORAGE_KEY, JSON.stringify(afterUser));

    assert.deepEqual(loadTeleprompterDocuments(), afterUser);
    assert.equal(loadTeleprompterDocuments().some((document) => document.id === "ag-doctrine-ep-02"), false);
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

function scriptFor(episodeNumber: number) {
  const script = seeds.find((seed) => seed.id === doctrineDocumentId(episodeNumber));
  assert.ok(script);
  return script.content;
}

function installLocalStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage },
    configurable: true,
  });
  return store;
}
