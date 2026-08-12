import assert from "node:assert/strict";
import test from "node:test";
import { buildPathwayAudioScriptCheckPrompt, parsePathwayAudioScriptCheckResult } from "../src/pathway-audio-script-checker";

test("script checker prompt enforces Apostolic theology and canonical source fidelity", () => {
  const prompt = buildPathwayAudioScriptCheckPrompt("SOURCE: Deuteronomy 6:4", "Welcome to Apostolic Guide. God is one.");
  assert.match(prompt, /Apostolic Oneness/);
  assert.match(prompt, /one indivisible God/);
  assert.match(prompt, /God the Son/);
  assert.match(prompt, /eternal Son/);
  assert.match(prompt, /invented verse wording/);
  assert.match(prompt, /outside proof texts/);
  assert.match(prompt, /platform-neutral/);
  assert.match(prompt, /CANONICAL PATHWAY SOURCE/);
  assert.match(prompt, /SOURCE: Deuteronomy 6:4/);
  assert.match(prompt, /Welcome to Apostolic Guide\. God is one\./);
  assert.match(prompt, /Return ONLY valid JSON/);
});

test("script checker parses a valid structured pass", () => {
  const result = parsePathwayAudioScriptCheckResult(JSON.stringify({
    verdict: "passed",
    summary: "The script is faithful to the Pathway and Oneness frame.",
    checks: [
      { id: "theology", status: "pass", message: "Consistent." },
      { id: "scripture", status: "pass", message: "Quotes are supplied." },
      { id: "source", status: "pass", message: "No outside claims." },
      { id: "delivery", status: "pass", message: "Platform neutral." },
      { id: "format", status: "pass", message: "Narration only." }
    ],
    issues: []
  }));
  assert.equal(result?.verdict, "passed");
  assert.equal(result?.issues.length, 0);
});

test("script checker accepts fenced JSON and preserves actionable review issues", () => {
  const result = parsePathwayAudioScriptCheckResult(`\`\`\`json
${JSON.stringify({
    verdict: "needs_review",
    summary: "One theological phrase needs correction.",
    checks: [{ id: "theology", status: "fail", message: "Uses eternal-Son person language." }],
    issues: [{ severity: "error", category: "theology", quote: "God the Son", message: "This affirms prohibited person-language.", suggestion: "State the deity revealed in the Son without calling the Son a separate eternal divine person." }]
  })}
\`\`\``);
  assert.equal(result?.verdict, "needs_review");
  assert.equal(result?.issues[0]?.category, "theology");
  assert.match(result?.issues[0]?.suggestion ?? "", /separate eternal divine person/);
});

test("script checker rejects malformed results", () => {
  assert.equal(parsePathwayAudioScriptCheckResult("not json"), null);
  assert.equal(parsePathwayAudioScriptCheckResult(JSON.stringify({ verdict: "maybe" })), null);
});
