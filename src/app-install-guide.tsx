"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ExternalLink, MoreVertical, PlusSquare, Share2, Smartphone } from "lucide-react";
import { trackEvent } from "./analytics";
import { appUrl } from "./urls";

type Platform = "ios" | "android" | "desktop";

const seenKey = "apostolic-guide-app-intro-seen";

function safeDestination(value: string | null) {
  if (!value) return appUrl;
  try {
    const parsed = new URL(value);
    return parsed.origin === new URL(appUrl).origin ? parsed.toString() : appUrl;
  } catch {
    return appUrl;
  }
}

function appHandoffProperties(target: string, handoff: string) {
  const url = new URL(target);
  return {
    target: `${url.pathname}${url.search}`,
    placement: url.searchParams.get("placement"),
    origin: url.searchParams.get("origin"),
    handoff
  };
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export function AppInstallGuide({ destination }: { destination: string | null }) {
  const target = useMemo(() => safeDestination(destination), [destination]);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);
    const seen = window.localStorage.getItem(seenKey) === "1";
    if (seen) {
      trackEvent("app_link_clicked", appHandoffProperties(target, "returning-auto"));
      window.location.replace(target);
      return;
    }
    setReady(true);
  }, [target]);

  function continueToApp() {
    window.localStorage.setItem(seenKey, "1");
    trackEvent("app_link_clicked", appHandoffProperties(target, "install-guide-button"));
    window.location.assign(target);
  }

  if (!ready) {
    return <div className="app-intro-loading" aria-live="polite">Opening Apostolic Guide…</div>;
  }

  const instructions = platform === "ios"
    ? [
        { icon: Share2, title: "Tap Share", text: "In Safari, tap the Share icon at the bottom of the screen." },
        { icon: PlusSquare, title: "Add to Home Screen", text: "Scroll the share sheet and choose Add to Home Screen." },
        { icon: Check, title: "Tap Add", text: "Apostolic Guide will appear on your home screen like an app." }
      ]
    : platform === "android"
      ? [
          { icon: MoreVertical, title: "Open the browser menu", text: "In Chrome, tap the three-dot menu in the top-right corner." },
          { icon: PlusSquare, title: "Install app", text: "Choose Install app or Add to Home screen." },
          { icon: Check, title: "Confirm", text: "Apostolic Guide will open from your home screen in its own window." }
        ]
      : [
          { icon: Smartphone, title: "Open on your phone", text: "The install experience works best from Safari on iPhone or Chrome on Android." },
          { icon: MoreVertical, title: "Use the browser install option", text: "On supported desktop browsers, use the install icon in the address bar." },
          { icon: Check, title: "Launch anytime", text: "Once installed, Apostolic Guide opens like a dedicated app." }
        ];

  return (
    <main className="app-intro-page">
      <section className="app-intro-hero">
        <div className="app-intro-copy">
          <span className="eyebrow eyebrow-light">Before you continue</span>
          <h1>Use Apostolic Guide like an app.</h1>
          <p>Add it to your home screen for faster access, a cleaner full-screen experience, and one-tap Scripture study.</p>
          <div className="app-intro-actions">
            <button className="button button-paper" type="button" onClick={continueToApp}>Continue to App <ArrowRight size={17} /></button>
            <a className="app-intro-direct" href={target}>Open without saving <ExternalLink size={15} /></a>
          </div>
        </div>
        <div className="app-intro-device" aria-hidden="true">
          <div className="app-intro-device-bar"><span /><span /><span /></div>
          <div className="app-intro-device-screen">
            <span>APOSTOLIC GUIDE</span>
            <strong>Search.<br />Study.<br />Know why.</strong>
            <div><span>Scripture</span><span>Topics</span><span>Pathways</span></div>
          </div>
        </div>
      </section>

      <section className="app-intro-steps">
        <div className="app-intro-section-heading">
          <span>INSTALL GUIDE</span>
          <strong>{platform === "ios" ? "iPhone and iPad" : platform === "android" ? "Android" : "Desktop and mobile"}</strong>
        </div>
        <div className="app-intro-step-grid">
          {instructions.map((item, index) => {
            const Icon = item.icon;
            return (
              <article key={item.title}>
                <span className="app-intro-step-number">{String(index + 1).padStart(2, "0")}</span>
                <Icon size={24} />
                <h2>{item.title}</h2>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="app-intro-final">
        <div>
          <span className="eyebrow">Ready to study?</span>
          <h2>Open the app and follow the evidence.</h2>
        </div>
        <button className="button button-crimson" type="button" onClick={continueToApp}>Continue to Apostolic Guide <ArrowRight size={17} /></button>
      </section>
    </main>
  );
}
