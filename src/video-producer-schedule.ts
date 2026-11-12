/** Timezone-safe scheduling. Data, not cron, controls the YouTube publishing moment. */
export const VIDEO_PRODUCER_TIMEZONE = "America/New_York";
const DAY_MS = 86400000;
const format = new Intl.DateTimeFormat("en-CA", {
  timeZone:VIDEO_PRODUCER_TIMEZONE, year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
function localParts(instant:Date) {
  const parts=Object.fromEntries(format.formatToParts(instant).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),
    hour:Number(parts.hour),minute:Number(parts.minute)};
}
export function parseVideoProducerLocalDateTime(day:string,time="18:00"):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Select a valid New York calendar date and 24 hour publish time.");
  const [y,m,d]=day.split("-").map(Number),[h,min]=time.split(":").map(Number);
  const naive=Date.UTC(y,m-1,d,h,min);
  if(!Number.isFinite(naive)||new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==day)
    throw new Error("Calendar date is invalid.");
  let candidate=naive;
  for(let i=0;i<5;i++){
    const p=localParts(new Date(candidate));
    const wall=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);
    const difference=naive-wall;
    candidate+=difference;
    if(!difference)break;
  }
  const p=localParts(new Date(candidate));
  if([p.year,p.month,p.day,p.hour,p.minute].join(",")!==[y,m,d,h,min].join(","))
    throw new Error("That local publish time does not exist due to a daylight saving clock change.");
  return new Date(candidate);
}
export function defaultVideoProducerSchedule(now=new Date()):{localDate:string;localTime:string;publishAt:string}{
  const p=localParts(now);
  const midnight=Date.UTC(p.year,p.month-1,p.day);
  for(let offset=0;offset<=365;offset++){
    const date=new Date(midnight+offset*DAY_MS).toISOString().slice(0,10);
    const scheduled=parseVideoProducerLocalDateTime(date,"18:00");
    if(scheduled.getTime()>now.getTime()+10*60*1000)
      return {localDate:date,localTime:"18:00",publishAt:scheduled.toISOString()};
  }
  throw new Error("No next publishing date could be determined.");
}
export type VideoProducerCalendarCandidate={id:string;mode:"podcast"|"reels";title:string};
export function alternateVideoProducerCalendar(candidates:VideoProducerCalendarCandidate[]):VideoProducerCalendarCandidate[]{
  const ids=new Set<string>();
  for(const entry of candidates){
    if(ids.has(entry.id))throw new Error("A project cannot appear twice in a schedule.");
    ids.add(entry.id);
  }
  const long=candidates.filter(p=>p.mode==="podcast");
  const shorts=candidates.filter(p=>p.mode==="reels");
  const ordered:VideoProducerCalendarCandidate[]=[];
  let next:"podcast"|"reels"="podcast";
  while(long.length||shorts.length){
    const preferred=next==="podcast"?long:shorts;
    const fallback=next==="podcast"?shorts:long;
    ordered.push((preferred.length?preferred:fallback).shift()!);
    next=next==="podcast"?"reels":"podcast";
  }
  return ordered;
}
export function calendarDayOffset(date:string,offset:number){
  if(!Number.isInteger(offset)||offset<0||offset>365)throw new Error("Invalid calendar offset.");
  return new Date(Date.parse(date+"T00:00:00Z")+offset*DAY_MS).toISOString().slice(0,10);
}
export function validateFutureVideoProducerSchedule(publishAt:Date,now=new Date()){
  const diff=publishAt.getTime()-now.getTime();
  if(diff<10*60*1000)throw new Error("Schedule must be at least ten minutes into the future.");
  if(diff>366*DAY_MS)throw new Error("Schedule must be within one year.");
}
