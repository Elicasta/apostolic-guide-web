import assert from "node:assert/strict";
import test from "node:test";
import { buildPathwayJourneys, type JourneyEvent } from "../src/pathway-journeys";
const now = "2026-10-20T12:00:00Z";
function evt(name:string,session:string,path:string,properties:Record<string,unknown>={},host:string|null=null):JourneyEvent {
  return {event_name:name,session_id:session,occurred_at:now,page_path:path,properties,referrer_host:host};
}
test("landing sources, direct pathway starts and navigation methods are aggregated by session",()=>{
  const events=[
    evt("page_viewed","a","/"),
  ];
  // replace the shorthand fixture to keep the analytics contract explicit
  events.splice(0,events.length,evt("page_viewed","a","/"),evt("pathway_entry_clicked","a","/",{pathwaySlug:"god-is-one",placement:"home-hero"}),
    evt("page_viewed","a","/pathways/god-is-one"),evt("pathway_started","a","/pathways/god-is-one"),
    evt("pathway_step_viewed","a","/pathways/god-is-one",{stepNumber:1,pathwaySlug:"god-is-one"}),
    evt("pathway_step_navigated","a","/pathways/god-is-one",{pathwaySlug:"god-is-one",method:"arrow",fromStep:1,toStep:2}),
    evt("pathway_step_completed","a","/pathways/god-is-one",{stepNumber:2,pathwaySlug:"god-is-one"}),
    evt("page_viewed","b","/pathways/god-is-one",{},"www.google.com"),
    evt("pathway_started","b","/pathways/god-is-one"),evt("pathway_step_viewed","b","/pathways/god-is-one",{stepNumber:1,pathwaySlug:"god-is-one"}),
    evt("pathway_step_navigated","b","/pathways/god-is-one",{pathwaySlug:"god-is-one",method:"swipe",toStep:2}),
    evt("page_viewed","internal","/pathways/god-is-one",{},"studio.apostolicguide.com"));
  const snap=buildPathwayJourneys(events);
  assert.equal(snap.totals.landingSessions,2);
  assert.equal(snap.totals.pathwayLandings,1);
  assert.equal(snap.totals.navigationActions,2);
  assert.equal(snap.landingPages.find(p=>p.path==="/pathways/god-is-one")?.google,1);
  const path=snap.pathwayRows[0];
  assert.equal(path.readers,2);
  assert.equal(path.arrows,1);
  assert.equal(path.swipes,1);
  assert.deepEqual(path.lastObserved,[{step:1,sessions:1},{step:2,sessions:1}]);
  assert.equal(snap.entryClicks[0].placement,"home-hero");
});
test("historical steps remain measurable without inventing old arrow navigation",()=>{
  const snap=buildPathwayJourneys([evt("page_viewed","old","/pathways/jesus-is-god"),
    evt("pathway_started","old","/pathways/jesus-is-god"),
    evt("pathway_step_completed","old","/pathways/jesus-is-god",{stepIndex:0}),
    evt("pathway_completed","old","/pathways/jesus-is-god",{completionMethod:"audio"})]);
  assert.equal(snap.totals.navigationActions,0);
  assert.equal(snap.pathwayRows[0].readers,1);
  assert.equal(snap.pathwayRows[0].completed,0);
});
