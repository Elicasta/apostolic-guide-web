import test from "node:test";
import assert from "node:assert/strict";
import { isActiveVenueGrant } from "../src/studio/venue-access";

const base={inviteEpisodeId:"episode-1",guestEpisodeId:"episode-1",requestedEpisodeId:"episode-1",status:"active",expiresAt:"2026-12-01T00:00:00.000Z",isRemoteVenue:true};
test("explicit venue invite grants its own episode program until expiry",()=>{
 assert.equal(isActiveVenueGrant(base,Date.parse("2026-11-01T00:00:00Z")),true);
 assert.equal(isActiveVenueGrant(base,Date.parse("2026-12-01T00:00:00Z")),false);
});
test("ordinary guest invitation, revoked or expired link cannot read output",()=>{
 const t=Date.parse("2026-11-01T00:00:00Z");
 assert.equal(isActiveVenueGrant({...base,isRemoteVenue:false},t),false);
 assert.equal(isActiveVenueGrant({...base,status:"revoked"},t),false);
 assert.equal(isActiveVenueGrant({...base,expiresAt:"not a date"},t),false);
});
test("cross-episode access fails even with an active venue invite",()=>{
 const t=Date.parse("2026-11-01T00:00:00Z");
 assert.equal(isActiveVenueGrant({...base,requestedEpisodeId:"episode-2"},t),false);
 assert.equal(isActiveVenueGrant({...base,guestEpisodeId:"episode-2"},t),false);
});
