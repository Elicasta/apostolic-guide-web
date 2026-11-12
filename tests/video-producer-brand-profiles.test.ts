import test from "node:test";
import assert from "node:assert/strict";
import {
  videoProducerBrandProfileSchema,isSelectableVideoProducerBrand,
  requiresVideoProducerPathway,requiresVideoProducerDoctrineGate,
  videoProducerBrandAudioTarget,validateVideoProducerChannel
} from "../src/video-producer-brand-profiles";

const make=(slug:string,options:{pathwayRequired?:boolean;doctrineGate?:"required"|"optional";handle?:string|null;destination?:"youtube"|"ag_publisher";lufs?:number;peak?:number}={})=>
  videoProducerBrandProfileSchema.parse({
    slug,name:slug==="in-the-now"?"In the Now":"Apostolic Guide",active:true,
    config:{
      theme:{ink:"#0E1E2D",accent:"#6A0000",paper:"#FFF9F2",fonts:["Poppins","Playfair Display","Bebas Neue"]},
      logo:{wordmark:"In the Now",assetPath:null},
      bumpers:{introSeconds:3,outroSeconds:4,outroSafeBottom:0.25},
      pathwayRequired:options.pathwayRequired??false,doctrineGate:options.doctrineGate??"optional",
      destination:{type:options.destination??"youtube",youtubeHandle:options.handle===undefined?"@iamelicastaneda":options.handle},
      audio:{integratedLufs:options.lufs??-14,truePeakDbtp:options.peak??-1.5,lra:7,rnnoiseMix:0},
      captions:{font:"Poppins",fill:"#FFF9F2",highlight:"#6A0000"}
    }
  });

test("personal projects do not require a pathway or doctrinal approval",()=>{
 const profile=make("in-the-now");
 assert.equal(isSelectableVideoProducerBrand(profile),true);
 assert.equal(requiresVideoProducerPathway(profile,"podcast"),false);
 assert.equal(requiresVideoProducerDoctrineGate(profile),false);
 assert.deepEqual(videoProducerBrandAudioTarget(profile),{integrated:-14,truePeak:-1.5,lra:7});
 assert.equal(validateVideoProducerChannel(profile,"@iamelicastaneda"),true);
 assert.equal(validateVideoProducerChannel(profile,"@cornerstone"),false);
});
test("Apostolic Guide continues requiring pathways and doctrine gate",()=>{
 const profile=make("apostolic-guide",{pathwayRequired:true,doctrineGate:"required",destination:"ag_publisher",handle:null,lufs:-16,peak:-1});
 assert.equal(isSelectableVideoProducerBrand(profile),true);
 assert.equal(requiresVideoProducerPathway(profile,"podcast"),true);
 assert.equal(requiresVideoProducerDoctrineGate(profile),true);
 assert.equal(validateVideoProducerChannel(profile,"ag_publisher"),true);
 assert.equal(videoProducerBrandAudioTarget(profile).integrated,-16);
});
test("Cornerstone cannot be selected even if inserted by an external caller",()=>{
 const profile=make("in-the-now");
 assert.equal(isSelectableVideoProducerBrand({...profile,slug:"cornerstone"}),false);
 assert.equal(isSelectableVideoProducerBrand({...profile,config:{...profile.config,destination:{type:"youtube",youtubeHandle:"@cornerstone"}}}),false);
 assert.equal(isSelectableVideoProducerBrand({...profile,name:"Cornerstone Production"}),false);
 assert.equal(isSelectableVideoProducerBrand({...profile,active:false}),false);
 assert.equal(isSelectableVideoProducerBrand(make("in-the-now",{handle:"@someotherchannel"})),false);
});

test("admin edits cannot require a pathway for personal or disable AG doctrine checks",()=>{
 const personal=make("in-the-now");
 assert.equal(isSelectableVideoProducerBrand({...personal,config:{...personal.config,pathwayRequired:true}}),false);
 assert.equal(isSelectableVideoProducerBrand({...personal,config:{...personal.config,doctrineGate:"required"}}),false);
 assert.equal(isSelectableVideoProducerBrand({...personal,config:{...personal.config,audio:{...personal.config.audio,integratedLufs:-16}}}),false);
 const ag=make("apostolic-guide",{pathwayRequired:true,doctrineGate:"required",destination:"ag_publisher",handle:null,lufs:-16,peak:-1});
 assert.equal(isSelectableVideoProducerBrand({...ag,config:{...ag.config,pathwayRequired:false}}),false);
 assert.equal(isSelectableVideoProducerBrand({...ag,config:{...ag.config,doctrineGate:"optional"}}),false);
});
