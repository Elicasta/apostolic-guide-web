"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { CalendarDays, Film, Image as ImageIcon, MessageCircle, Send, Settings } from "lucide-react";
import { useState } from "react";
import { ChannelPublishing } from "@/channel-publishing";
import { ContentCalendarStudio } from "@/content-calendar-studio";
import { CreativePublishingClient } from "@/creative-publishing-client";
import { ThreadsPublishingClient } from "@/threads-publishing-client";

type ChannelProps = ComponentProps<typeof ChannelPublishing>;
type LegacyView = "creative" | "video" | "threads" | "calendar";
type Stage = "publish" | "calendar";
type Source = "creative" | "video" | "threads";

export function UnifiedPublishingWorkspace({
  initialProjectId,
  initialView = "creative",
  channel
}: {
  initialProjectId?: string | null;
  initialView?: LegacyView;
  channel: ChannelProps;
}) {
  const [stage, setStage] = useState<Stage>(initialView === "calendar" ? "calendar" : "publish");
  const [source, setSource] = useState<Source>(initialView === "video" ? "video" : initialView === "threads" ? "threads" : "creative");
  const threadsCredential = channel.credentials.find((credential) => credential.platform === "threads");

  const sourceCopy = source === "creative"
    ? { title: "Creative Project", detail: "Single · Carousel · Story" }
    : source === "video"
      ? { title: "Video or Clip", detail: "YouTube · Reel · TikTok-ready clip" }
      : { title: "Thread", detail: "Single · Weekly batch · Prayer response" };

  return <section className="master-publishing-shell">
    <div className="master-publishing-head">
      <div>
        <span>Distribution · Master Publishing</span>
        <h1>Publish what is ready.</h1>
        <p>One outbound desk for finished Studio work. Choose the item, destination, and timing. Calendar and history stay available without turning every media type into its own publishing app.</p>
      </div>
      <div className="master-publishing-utilities">
        <Link href="/admin/setup#social-publishing"><Settings size={15}/><span>Connections</span></Link>
        <div className="master-publishing-mark"><Send size={18}/><strong>Publisher</strong></div>
      </div>
    </div>

    <div className="master-publishing-switch" role="tablist" aria-label="Publishing workflow">
      <button type="button" role="tab" aria-selected={stage === "publish"} className={stage === "publish" ? "is-active" : ""} onClick={() => setStage("publish")}>
        <Send size={17}/><span><strong>Publish</strong><small>Select · Destination · Timing</small></span>
      </button>
      <button type="button" role="tab" aria-selected={stage === "calendar"} className={stage === "calendar" ? "is-active" : ""} onClick={() => setStage("calendar")}>
        <CalendarDays size={17}/><span><strong>Calendar</strong><small>Queue · Schedule · Published</small></span>
      </button>
    </div>

    {stage === "publish" ? <div className="master-publishing-source-bar">
      <div>
        <span className="master-source-kicker">What are you sending?</span>
        <strong>{sourceCopy.title}</strong>
        <small>{sourceCopy.detail}</small>
      </div>
      <label>
        <span>Content source</span>
        <div className="master-source-select">
          {source === "creative" ? <ImageIcon size={16}/> : source === "video" ? <Film size={16}/> : <MessageCircle size={16}/>} 
          <select value={source} onChange={(event) => setSource(event.target.value as Source)}>
            <option value="creative">Creative Projects</option>
            <option value="video">Video + Clips</option>
            <option value="threads">Threads</option>
          </select>
        </div>
      </label>
    </div> : null}

    <div className={`master-publishing-panel is-${stage} source-${source}`}>
      {stage === "publish" && source === "creative" ? <CreativePublishingClient initialProjectId={initialProjectId}/> : null}
      {stage === "publish" && source === "video" ? <ChannelPublishing {...channel}/> : null}
      {stage === "publish" && source === "threads" ? <ThreadsPublishingClient connected={Boolean(threadsCredential?.accountAuthorized)} canPublish={channel.canPublish}/> : null}
      {stage === "calendar" ? <ContentCalendarStudio/> : null}
    </div>
  </section>;
}
