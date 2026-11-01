"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { CalendarDays, Film, Image as ImageIcon, MessageCircle, Send, Settings, UploadCloud } from "lucide-react";
import { useState } from "react";
import { ChannelPublishing } from "@/channel-publishing";
import { ContentCalendarStudio } from "@/content-calendar-studio";
import { CreativePublishingClient } from "@/creative-publishing-client";
import { CustomMediaPublishingClient } from "@/custom-media-publishing-client";
import { ThreadsPublishingClient } from "@/threads-publishing-client";

type ChannelProps = ComponentProps<typeof ChannelPublishing>;
type LegacyView = "creative" | "video" | "threads" | "custom" | "calendar";
type Stage = "publish" | "calendar";
type Source = "creative" | "video" | "threads" | "custom";

export function UnifiedPublishingWorkspace({
  initialProjectId,
  initialThreadId,
  initialView = "creative",
  channel
}: {
  initialProjectId?: string | null;
  initialThreadId?: string | null;
  initialView?: LegacyView;
  channel: ChannelProps;
}) {
  const [stage, setStage] = useState<Stage>(initialView === "calendar" ? "calendar" : "publish");
  const [source, setSource] = useState<Source>(initialView === "video" ? "video" : initialView === "threads" ? "threads" : initialView === "custom" ? "custom" : "creative");
  const threadsCredential = channel.credentials.find((credential) => credential.platform === "threads");

  const sourceCopy = source === "creative"
    ? { title: "Creative Project", detail: "Single · Carousel · Story" }
    : source === "video"
      ? { title: "Video or Clip", detail: "YouTube · Reel · TikTok-ready clip" }
      : source === "custom"
        ? { title: "Custom Media", detail: "Upload · Sol metadata · Instagram · YouTube" }
        : { title: "Thread", detail: "Single · Weekly batch · Prayer response" };

  const SourceIcon = source === "creative" ? ImageIcon : source === "video" ? Film : source === "custom" ? UploadCloud : MessageCircle;

  return <section className="master-publishing-shell">
    <div className="master-publishing-head">
      <div>
        <span>Distribution · Master Publishing</span>
        <h1>Publish what is ready.</h1>
        <p>One outbound desk for finished Studio work and custom media. Choose the source, destination, and timing. Pathway assignment and calendar history stay attached to the post.</p>
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
          <SourceIcon size={16}/>
          <select value={source} onChange={(event) => setSource(event.target.value as Source)}>
            <option value="custom">Custom Media Upload</option>
            <option value="creative">Creative Projects</option>
            <option value="video">Video + Clips</option>
            <option value="threads">Threads</option>
          </select>
        </div>
      </label>
    </div> : null}

    <div className={`master-publishing-panel is-${stage} source-${source}`}>
      {stage === "publish" && source === "custom" ? <CustomMediaPublishingClient/> : null}
      {stage === "publish" && source === "creative" ? <CreativePublishingClient initialProjectId={initialProjectId}/> : null}
      {stage === "publish" && source === "video" ? <ChannelPublishing {...channel}/> : null}
      {stage === "publish" && source === "threads" ? <ThreadsPublishingClient connected={Boolean(threadsCredential?.accountAuthorized)} canPublish={channel.canPublish} initialSelectedId={initialThreadId}/> : null}
      {stage === "calendar" ? <ContentCalendarStudio/> : null}
    </div>
  </section>;
}
