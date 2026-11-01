import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSocialClipPackage, socialClipCaptionWithTags } from "../src/social-clip-package";

test("normalizes AI social clip captions, tags, cover, and timed cues", () => {
  const result = normalizeSocialClipPackage({
    captionCues: [
      { start: 0.2, end: 1.4, text: "Jesus is God" },
      { start: "bad", end: 2, text: "ignored" }
    ],
    socialPackage: {
      instagramCaption: "  Scripture makes the claim plainly.  ",
      tiktokCaption: "Watch the titles Isaiah gives the child.",
      hashtags: ["#Apostolic", "JesusName", "#Apostolic", " Bible Study "],
      coverHeadline: "THE PROMISED CHILD",
      coverSubline: "Isaiah 9:6",
      coverUrl: "https://cdn.example.com/clip-cover.jpg"
    }
  });

  assert.equal(result.instagramCaption, "Scripture makes the claim plainly.");
  assert.equal(result.tiktokCaption, "Watch the titles Isaiah gives the child.");
  assert.deepEqual(result.hashtags, ["#Apostolic", "#JesusName", "#BibleStudy"]);
  assert.equal(result.coverHeadline, "THE PROMISED CHILD");
  assert.equal(result.coverUrl, "https://cdn.example.com/clip-cover.jpg");
  assert.deepEqual(result.captionCues, [{ start: 0.2, end: 1.4, text: "Jesus is God" }]);
});

test("combines platform caption and AI hashtags for publishing", () => {
  const value = socialClipCaptionWithTags({
    socialPackage: {
      instagramCaption: "Read the passage in context.",
      tiktokCaption: "Look at the text.",
      hashtags: ["BibleStudy", "#Oneness"]
    }
  }, "tiktok");

  assert.equal(value, "Look at the text.\n\n#BibleStudy #Oneness");
});
