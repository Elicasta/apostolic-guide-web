import test from "node:test";
import assert from "node:assert/strict";
import {githubWorkerDiagnostic} from "../src/video-producer-github-health";

test("401 identifies the token as invalid, not a missing workflow",()=>{
 const diagnostic=githubWorkerDiagnostic(401,"dispatcher","Elicasta/apostolic-guide-web");
 assert.match(diagnostic,/VIDEO_STUDIO_GITHUB_TOKEN/);
 assert.match(diagnostic,/401 Bad credentials/);
 assert.doesNotMatch(diagnostic,/Install the workflow/);
});
test("dispatch requires Contents write; secret inspection requires Secrets read",()=>{
 assert.match(githubWorkerDiagnostic(403,"dispatch","Elicasta/apostolic-guide-web"),/Contents: write/);
 const secrets=githubWorkerDiagnostic(403,"secrets","Elicasta/apostolic-guide-web");
 assert.match(secrets,/Secrets: read/);
 assert.match(secrets,/VIDEO_PRODUCER_OPENAI_API_KEY/);
});
