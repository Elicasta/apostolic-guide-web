import test from "node:test";
import assert from "node:assert/strict";
import {videoSourceProbeSchema} from "../src/video-producer-source-probe";

const known={
 durationSec:294.8483,width:1920,height:1080,colorPrimaries:"bt2020",
 colorTransfer:"arib-std-b67",colorSpace:"bt2020nc",colorRange:"tv",
 pixelFormat:"yuv420p10le",bitDepth:10,rotationDegrees:0,
 averageFps:29.97,nominalFps:30,vfrHint:"undetermined",hdrMode:"hlg"
} as const;
test("accepts measured HLG source metadata, but unknown stays unknown",()=>{
 assert.equal(videoSourceProbeSchema.parse(known).hdrMode,"hlg");
 assert.equal(videoSourceProbeSchema.parse({...known,colorTransfer:"unknown",hdrMode:"unknown"}).hdrMode,"unknown");
});
test("rejects malformed, undocumented or forged HDR probes",()=>{
 assert.equal(videoSourceProbeSchema.safeParse({...known,hdrMode:"hdr"}).success,false);
 assert.equal(videoSourceProbeSchema.safeParse({...known,bitDepth:-1}).success,false);
 assert.equal(videoSourceProbeSchema.safeParse({...known,secret:"do not store"}).success,false);
 assert.equal(videoSourceProbeSchema.safeParse({...known,colorTransfer:"x".repeat(200)}).success,false);
});
