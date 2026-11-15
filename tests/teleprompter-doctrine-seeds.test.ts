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
import { loadTeleprompterDocuments } from "../src/lib/teleprompter/seeded-storage";
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

test("each doctrine draft reads hook, claim, verses, objection, answer, close, then reel cues", () => {
  DOCTRINE_EPISODES.forEach((episode, index) => {
    const slides = parseTeleprompterDocument(seeds[index].content);
    assert.deepEqual(
      slides.map((slide) => slide.heading),
      [
        episode.title,
        "The Claim",
        ...episode.verses.map((verse) => verse.reference),
        "The Objection",
        "The Answer",
        "Close",
        "Reel Cues",
      ],
      episode.title,
    );
    assert.equal(slides[0].reference, `Batch ${episode.batch} · ${episode.batchLabel}`);
    assert.match(slides[0].note ?? "", /Welcome the question/);
    const close = (slides.at(-2)?.body ?? []).join(" ").replace(/\s+/g, " ");
    assert.match(close, /Full pathway in the app, link in bio/);
    assert.ok(close.includes(episode.pathway), `${episode.title} close is missing ${episode.pathway}`);
    assert.match(slides.at(-1)?.note ?? "", /not part of the teaching read/);

    episode.verses.forEach((verse) => {
      const slide = slides.find((candidate) => candidate.heading === verse.reference);
      assert.ok(slide, `${episode.title} missing ${verse.reference}`);
      assert.deepEqual(slide.quotes, [verse.text]);
    });
  });
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
      loaded.slice(0, 24).map((document) => document.id),
      seeds.map((seed) => seed.id),
    );
    assert.deepEqual(loaded.slice(24), original);
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
