"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
export function PublishingRouteIntent(){
  const params=useSearchParams(); const platform=params.get("platform");
  useEffect(()=>{ if(!platform)return; let attempts=0; const timer=window.setInterval(()=>{attempts+=1; const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>(".platform-tabs button")); const target=buttons.find((button)=>button.textContent?.toLowerCase().includes(platform.toLowerCase())); if(target){target.click();window.clearInterval(timer)} if(attempts>20)window.clearInterval(timer)},150); return()=>window.clearInterval(timer)},[platform]);
  return null;
}
