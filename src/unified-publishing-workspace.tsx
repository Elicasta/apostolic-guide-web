"use client";

import { Film, Image as ImageIcon, Send } from "lucide-react";
import { useState } from "react";
import { ChannelPublishing } from "@/channel-publishing";
import { CreativePublishingClient } from "@/creative-publishing-client";

type ChannelProps = React.ComponentProps<typeof ChannelPublishing>;
type View = "creative" | "video";

export function UnifiedPublishingWorkspace({
  initialProjectId,
  initialView = "creative",
  channel
}: {
  initialProjectId?: string | null;
  initialView?: View;
  channel: ChannelProps;
}) {
  const [view, setView] = useState<View>(initialView);

  return <section className="master-publishing-shell">
    <div className="master-publishing-head">
      <div>
        <span>Distribution · Master Publishing</span>
        <h1>One place to send everything out.</h1>
        <p>Creative Projects, YouTube videos, Reels, short-form clips, schedules, failures, and publishing history live behind one outbound desk.</p>
      </div>
      <div className="master-publishing-mark"><Send size={20}/><strong>Publish</strong></div>
    </div>

    <div className="master-publishing-switch" role="tablist" aria-label="Publishing source type">
      <button type="button" role="tab" aria-selected={view === "creative"} className={view === "creative" ? "is-active" : ""} onClick={() => setView("creative")}>
        <ImageIcon size={17}/><span><strong>Social Creatives</strong><small>Single · Carousel · Story</small></span>
      </button>
      <button type="button" role="tab" aria-selected={view === "video"} className={view === "video" ? "is-active" : ""} onClick={() => setView("video")}>
        <Film size={17}/><span><strong>Video + Clips</strong><small>YouTube · Reels · TikTok</small></span>
      </button>
    </div>

    <div className={`master-publishing-panel is-${view}`}>
      {view === "creative"
        ? <CreativePublishingClient initialProjectId={initialProjectId}/>
        : <ChannelPublishing {...channel}/>} 
    </div>
  </section>;
}
