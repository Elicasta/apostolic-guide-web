import test from "node:test";
import assert from "node:assert/strict";
import {alternateVideoProducerCalendar,calendarDayOffset,defaultVideoProducerSchedule,parseVideoProducerLocalDateTime,validateFutureVideoProducerSchedule} from "../src/video-producer-schedule";

test("6 PM in November converts to New York standard time and in July to daylight time",()=>{
 assert.equal(parseVideoProducerLocalDateTime("2026-11-11","18:00").toISOString(),"2026-11-11T23:00:00.000Z");
 assert.equal(parseVideoProducerLocalDateTime("2026-07-11","18:00").toISOString(),"2026-07-11T22:00:00.000Z");
});
test("defaults to next 6 PM instead of scheduling in the past",()=>{
 assert.deepEqual(defaultVideoProducerSchedule(new Date("2026-11-11T21:00:00Z")),{
  localDate:"2026-11-11",localTime:"18:00",publishAt:"2026-11-11T23:00:00.000Z"
 });
 assert.equal(defaultVideoProducerSchedule(new Date("2026-11-11T23:00:00Z")).localDate,"2026-11-12");
});
test("rejects invalid dates, nonexistent DST times and near past publishes",()=>{
 assert.throws(()=>parseVideoProducerLocalDateTime("2026-02-30"),/invalid/);
 assert.throws(()=>parseVideoProducerLocalDateTime("2026-03-08","02:30"),/does not exist/);
 assert.throws(()=>validateFutureVideoProducerSchedule(new Date("2026-11-11T23:00:00Z"),new Date("2026-11-11T23:00:00Z")),/future/);
});
test("alternates episodes and Shorts, one calendar item per day",()=>{
 const items=[{id:"a",title:"First",mode:"podcast" as const},{id:"b",title:"Second",mode:"podcast" as const},{id:"c",title:"First short",mode:"reels" as const},{id:"d",title:"Second short",mode:"reels" as const}];
 assert.deepEqual(alternateVideoProducerCalendar(items).map(x=>x.id),["a","c","b","d"]);
 assert.equal(calendarDayOffset("2026-11-11",3),"2026-11-14");
 assert.throws(()=>alternateVideoProducerCalendar([items[0],items[0]]),/twice/);
});
