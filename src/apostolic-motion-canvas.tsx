"use client";

import {
  activeApostolicMotionScene,
  apostolicMotionSceneProgress,
  type ApostolicMotionPlan,
  type ApostolicMotionScene,
  type ApostolicMotionVisual
} from "./apostolic-motion-engine";
import type { PathwayVideoFormat } from "./pathway-video";

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function eased(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function reveal(progress: number, delay = 0, span = 0.55) {
  return eased((progress - delay) / Math.max(0.05, span));
}

function lineStyle(length: number, progress: number, delay = 0) {
  const amount = reveal(progress, delay, 0.48);
  return {
    strokeDasharray: length,
    strokeDashoffset: length * (1 - amount),
    opacity: Math.max(0.12, amount)
  };
}

function FadeGroup({ progress, delay = 0, children }: { progress: number; delay?: number; children: React.ReactNode }) {
  const amount = reveal(progress, delay, 0.4);
  return <g style={{ opacity: amount, transform: `translateY(${(1 - amount) * 14}px)`, transformOrigin: "center", transition: "opacity 80ms linear" }}>{children}</g>;
}

function Ring({ cx, cy, r, progress, delay = 0, accent = false }: { cx: number; cy: number; r: number; progress: number; delay?: number; accent?: boolean }) {
  const circumference = Math.PI * 2 * r;
  return <circle
    cx={cx}
    cy={cy}
    r={r}
    fill="none"
    className={accent ? "motion-stroke motion-stroke-red" : "motion-stroke"}
    strokeWidth={accent ? 6 : 4}
    style={lineStyle(circumference, progress, delay)}
  />;
}

function DrawLine({ x1, y1, x2, y2, progress, delay = 0, accent = false, width = 4 }: { x1: number; y1: number; x2: number; y2: number; progress: number; delay?: number; accent?: boolean; width?: number }) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  return <line
    x1={x1}
    y1={y1}
    x2={x2}
    y2={y2}
    className={accent ? "motion-stroke motion-stroke-red" : "motion-stroke"}
    strokeWidth={width}
    strokeLinecap="round"
    style={lineStyle(length, progress, delay)}
  />;
}

function ScriptureScroll({ progress }: { progress: number }) {
  return <>
    <FadeGroup progress={progress}><rect x="248" y="104" width="500" height="346" rx="24" className="motion-fill-panel"/></FadeGroup>
    <DrawLine x1={300} y1={176} x2={690} y2={176} progress={progress} delay={0.08}/>
    <DrawLine x1={300} y1={225} x2={650} y2={225} progress={progress} delay={0.14}/>
    <DrawLine x1={300} y1={274} x2={688} y2={274} progress={progress} delay={0.2}/>
    <DrawLine x1={300} y1={323} x2={600} y2={323} progress={progress} delay={0.26}/>
    <DrawLine x1={300} y1={372} x2={665} y2={372} progress={progress} delay={0.32}/>
    <Ring cx={728} cy={420} r={34} progress={progress} delay={0.38} accent/>
  </>;
}

function MotionIllustration({ visual, progress }: { visual: ApostolicMotionVisual; progress: number }) {
  if (visual === "opening-question") return <>
    <Ring cx={500} cy={280} r={190} progress={progress}/>
    <Ring cx={500} cy={280} r={142} progress={progress} delay={0.08} accent/>
    <FadeGroup progress={progress} delay={0.14}><text x="500" y="328" textAnchor="middle" className="motion-svg-hero">?</text></FadeGroup>
    <DrawLine x1={366} y1={450} x2={634} y2={450} progress={progress} delay={0.3} accent width={6}/>
  </>;

  if (visual === "brand-reveal") return <>
    <Ring cx={500} cy={280} r={170} progress={progress}/>
    <DrawLine x1={330} y1={280} x2={670} y2={280} progress={progress} delay={0.12} accent/>
    <FadeGroup progress={progress} delay={0.2}><text x="500" y="260" textAnchor="middle" className="motion-svg-small">SCRIPTURE</text><text x="500" y="326" textAnchor="middle" className="motion-svg-label">CLEARLY SEEN</text></FadeGroup>
  </>;

  if (visual === "shema") return <>
    <Ring cx={500} cy={280} r={190} progress={progress}/>
    <Ring cx={500} cy={280} r={112} progress={progress} delay={0.08} accent/>
    <FadeGroup progress={progress} delay={0.18}><text x="500" y="306" textAnchor="middle" className="motion-svg-hero motion-svg-hero-small">ONE</text></FadeGroup>
    <DrawLine x1={286} y1={280} x2={352} y2={280} progress={progress} delay={0.28}/>
    <DrawLine x1={648} y1={280} x2={714} y2={280} progress={progress} delay={0.32}/>
  </>;

  if (visual === "no-rival") return <>
    <Ring cx={500} cy={280} r={120} progress={progress} accent/>
    <FadeGroup progress={progress} delay={0.12}><text x="500" y="296" textAnchor="middle" className="motion-svg-label">ONE GOD</text></FadeGroup>
    {[[270,160],[730,160],[270,400],[730,400]].map(([cx,cy], index) => <g key={`${cx}-${cy}`}>
      <Ring cx={cx} cy={cy} r={52} progress={progress} delay={0.18 + index * 0.04}/>
      <DrawLine x1={cx - 42} y1={cy + 42} x2={cx + 42} y2={cy - 42} progress={progress} delay={0.28 + index * 0.04} accent width={7}/>
    </g>)}
  </>;

  if (visual === "jesus-shema") return <>
    <Ring cx={500} cy={236} r={126} progress={progress}/>
    <Ring cx={500} cy={236} r={92} progress={progress} delay={0.07} accent/>
    <Ring cx={500} cy={205} r={34} progress={progress} delay={0.16}/>
    <DrawLine x1={500} y1={240} x2={500} y2={354} progress={progress} delay={0.21} width={7}/>
    <DrawLine x1={500} y1={274} x2={420} y2={326} progress={progress} delay={0.26} width={6}/>
    <DrawLine x1={500} y1={274} x2={586} y2={308} progress={progress} delay={0.3} width={6}/>
    <FadeGroup progress={progress} delay={0.38}><text x="500" y="452" textAnchor="middle" className="motion-svg-label">ONE LORD</text></FadeGroup>
  </>;

  if (visual === "true-god") return <>
    <Ring cx={500} cy={280} r={175} progress={progress}/>
    <Ring cx={500} cy={280} r={112} progress={progress} delay={0.1} accent/>
    {Array.from({ length: 10 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 10;
      const x1 = 500 + Math.cos(angle) * 205;
      const y1 = 280 + Math.sin(angle) * 205;
      const x2 = 500 + Math.cos(angle) * 240;
      const y2 = 280 + Math.sin(angle) * 240;
      return <DrawLine key={index} x1={x1} y1={y1} x2={x2} y2={y2} progress={progress} delay={0.18 + index * 0.015} width={4}/>;
    })}
    <FadeGroup progress={progress} delay={0.28}><text x="500" y="292" textAnchor="middle" className="motion-svg-label">TRUE GOD</text></FadeGroup>
  </>;

  if (visual === "apostolic-witness") return <>
    <FadeGroup progress={progress}><path d="M220 150 Q360 120 500 190 L500 430 Q360 365 220 395 Z" className="motion-fill-panel"/><path d="M780 150 Q640 120 500 190 L500 430 Q640 365 780 395 Z" className="motion-fill-panel"/></FadeGroup>
    <DrawLine x1={500} y1={190} x2={500} y2={430} progress={progress} delay={0.08} accent width={6}/>
    <DrawLine x1={280} y1={220} x2={445} y2={240} progress={progress} delay={0.16}/>
    <DrawLine x1={555} y1={240} x2={720} y2={220} progress={progress} delay={0.2}/>
    <DrawLine x1={290} y1={278} x2={445} y2={294} progress={progress} delay={0.24}/>
    <DrawLine x1={555} y1={294} x2={710} y2={278} progress={progress} delay={0.28}/>
    <FadeGroup progress={progress} delay={0.35}><text x="500" y="494" textAnchor="middle" className="motion-svg-label">APOSTOLIC WITNESS</text></FadeGroup>
  </>;

  if (visual === "one-mediator") return <>
    <Ring cx={500} cy={126} r={70} progress={progress} accent/>
    <FadeGroup progress={progress} delay={0.12}><text x="500" y="138" textAnchor="middle" className="motion-svg-small">GOD</text></FadeGroup>
    <DrawLine x1={500} y1={196} x2={500} y2={360} progress={progress} delay={0.14} width={7}/>
    <Ring cx={500} cy={402} r={42} progress={progress} delay={0.24}/>
    <FadeGroup progress={progress} delay={0.32}><text x="500" y="414" textAnchor="middle" className="motion-svg-small">ONE</text></FadeGroup>
  </>;

  if (visual === "belief") return <>
    <Ring cx={500} cy={280} r={150} progress={progress} accent/>
    <FadeGroup progress={progress} delay={0.1}><text x="500" y="298" textAnchor="middle" className="motion-svg-hero motion-svg-hero-small">ONE</text></FadeGroup>
    {[0,1,2].map((index) => <Ring key={index} cx={500} cy={280} r={202 + index * 45} progress={progress} delay={0.18 + index * 0.08}/>)}
  </>;

  if (visual === "creator") return <>
    <Ring cx={500} cy={296} r={150} progress={progress}/>
    <path d="M370 292 Q430 236 500 278 Q570 320 630 270 M382 340 Q458 302 530 344 Q582 374 620 352" className="motion-stroke motion-path" style={lineStyle(520, progress, 0.16)}/>
    {[[280,150],[720,132],[790,330],[226,356],[630,82],[390,92]].map(([cx,cy], index) => <circle key={index} cx={cx} cy={cy} r={7 + (index % 2) * 3} className="motion-fill-red" style={{ opacity: reveal(progress, 0.22 + index * 0.04, 0.3) }}/>) }
    <FadeGroup progress={progress} delay={0.34}><text x="500" y="492" textAnchor="middle" className="motion-svg-label">CREATION</text></FadeGroup>
  </>;

  if (visual === "word-flesh") return <>
    <FadeGroup progress={progress}><rect x="142" y="205" width="252" height="142" rx="24" className="motion-fill-panel"/><text x="268" y="292" textAnchor="middle" className="motion-svg-label">WORD</text></FadeGroup>
    <DrawLine x1={408} y1={276} x2={590} y2={276} progress={progress} delay={0.12} accent width={7}/>
    <FadeGroup progress={progress} delay={0.24}><path d="M590 276 l-34 -25 v50 z" className="motion-fill-red"/></FadeGroup>
    <FadeGroup progress={progress} delay={0.28}><circle cx="708" cy="220" r="38" fill="none" className="motion-stroke" strokeWidth="5"/><path d="M708 264 L708 390 M708 300 L642 346 M708 300 L774 346" className="motion-stroke motion-path"/><text x="708" y="458" textAnchor="middle" className="motion-svg-label">FLESH</text></FadeGroup>
  </>;

  if (visual === "invisible-visible") return <>
    <Ring cx={342} cy={280} r={116} progress={progress}/><Ring cx={342} cy={280} r={72} progress={progress} delay={0.08} accent/>
    <DrawLine x1={470} y1={280} x2={592} y2={280} progress={progress} delay={0.18} accent width={7}/>
    <FadeGroup progress={progress} delay={0.28}><circle cx="690" cy="214" r="36" fill="none" className="motion-stroke" strokeWidth="5"/><path d="M690 254 L690 382 M690 300 L632 344 M690 300 L748 344" className="motion-stroke motion-path"/></FadeGroup>
  </>;

  if (visual === "water-name") return <>
    {[0,1,2].map((index) => <path key={index} d={`M190 ${250 + index * 58} Q300 ${205 + index * 58} 410 ${250 + index * 58} T630 ${250 + index * 58} T850 ${250 + index * 58}`} className={index === 1 ? "motion-stroke motion-stroke-red motion-path" : "motion-stroke motion-path"} style={lineStyle(760, progress, 0.08 + index * 0.08)}/>) }
    <FadeGroup progress={progress} delay={0.32}><text x="520" y="458" textAnchor="middle" className="motion-svg-label">JESUS' NAME</text></FadeGroup>
  </>;

  if (visual === "spirit-fire") return <>
    <FadeGroup progress={progress}><path d="M500 94 C590 198 610 256 570 324 C548 360 524 374 500 392 C468 364 430 344 414 304 C384 228 452 178 500 94 Z" className="motion-fill-red-soft"/><path d="M500 194 C544 244 550 284 528 318 C518 334 508 342 500 350 C484 332 468 318 466 294 C462 258 482 224 500 194 Z" className="motion-fill-ink-soft"/></FadeGroup>
    {[[-180,-70],[-210,20],[180,-70],[210,20]].map(([dx,dy], index) => <DrawLine key={index} x1={500 + dx} y1={280 + dy} x2={500 + dx * .55} y2={280 + dy * .55} progress={progress} delay={0.18 + index * 0.05}/>) }
  </>;

  if (visual === "authority") return <>
    <FadeGroup progress={progress}><path d="M318 354 L360 190 L640 190 L682 354 Z" className="motion-fill-panel"/><rect x="300" y="354" width="400" height="66" rx="14" className="motion-fill-panel"/></FadeGroup>
    <Ring cx={500} cy={152} r={58} progress={progress} delay={0.08} accent/>
    <DrawLine x1={380} y1={420} x2={620} y2={420} progress={progress} delay={0.2} accent width={7}/>
  </>;

  if (visual === "gospel-pattern") return <>
    {[[250,"DEATH"],[500,"BURIAL"],[750,"RISEN"]].map(([cx,label], index) => <g key={String(label)}>
      <Ring cx={Number(cx)} cy={280} r={72} progress={progress} delay={index * .1} accent={index === 2}/>
      <FadeGroup progress={progress} delay={0.16 + index * .1}><text x={Number(cx)} y="292" textAnchor="middle" className="motion-svg-small">{String(label)}</text></FadeGroup>
      {index < 2 ? <DrawLine x1={Number(cx) + 78} y1={280} x2={Number(cx) + 172} y2={280} progress={progress} delay={0.22 + index * .1}/> : null}
    </g>)}
  </>;

  if (visual === "recap-map") return <>
    <DrawLine x1={170} y1={280} x2={830} y2={280} progress={progress} accent width={5}/>
    {["LAW","PROPHETS","JESUS","APOSTLES","CHURCH"].map((label, index) => {
      const cx = 170 + index * 165;
      return <g key={label}><Ring cx={cx} cy={280} r={34} progress={progress} delay={0.08 + index * .06} accent={index === 2}/><FadeGroup progress={progress} delay={0.16 + index * .06}><text x={cx} y="356" textAnchor="middle" className="motion-svg-tiny">{label}</text></FadeGroup></g>;
    })}
  </>;

  if (visual === "cta") return <>
    <FadeGroup progress={progress}><rect x="220" y="142" width="560" height="274" rx="34" className="motion-fill-panel"/></FadeGroup>
    <DrawLine x1={310} y1={230} x2={690} y2={230} progress={progress} delay={0.12} accent width={7}/>
    <FadeGroup progress={progress} delay={0.22}><text x="500" y="320" textAnchor="middle" className="motion-svg-label">APOSTOLICGUIDE.COM</text></FadeGroup>
  </>;

  return <ScriptureScroll progress={progress}/>;
}

function CameraScale({ scene, progress }: { scene: ApostolicMotionScene; progress: number }) {
  const amount = eased(progress);
  const scale = scene.camera === "push" ? 1 + amount * 0.035 : scene.camera === "pull" ? 1.035 - amount * 0.035 : 1;
  const x = scene.camera === "pan-left" ? 12 - amount * 24 : scene.camera === "pan-right" ? -12 + amount * 24 : 0;
  return <style>{`:root{--motion-camera-scale:${scale};--motion-camera-x:${x}px}`}</style>;
}

export function ApostolicMotionCanvas({
  plan,
  currentTime,
  format = "youtube"
}: {
  plan: ApostolicMotionPlan;
  currentTime: number;
  format?: PathwayVideoFormat;
}) {
  const active = activeApostolicMotionScene(plan, currentTime) ?? plan.scenes[0] ?? null;
  const activeIndex = active ? Math.max(0, plan.scenes.findIndex((scene) => scene.id === active.id)) : 0;
  const progress = apostolicMotionSceneProgress(active, currentTime);
  const sceneCount = Math.max(1, plan.scenes.length);
  const tileWidth = 100 / sceneCount;
  const cameraScale = active?.camera === "push"
    ? 1 + eased(progress) * 0.028
    : active?.camera === "pull"
      ? 1.028 - eased(progress) * 0.028
      : 1;
  const cameraOffset = active?.camera === "pan-left"
    ? 10 - eased(progress) * 20
    : active?.camera === "pan-right"
      ? -10 + eased(progress) * 20
      : 0;

  return <div className={`apostolic-motion-canvas is-${format}`} data-motion-visual={active?.visual ?? "none"}>
    <div className="motion-canvas-ambient motion-canvas-ambient-red"/>
    <div className="motion-canvas-ambient motion-canvas-ambient-blue"/>
    <div className="motion-canvas-grid"/>
    <div
      className="motion-canvas-world"
      style={{
        width: `${sceneCount * 100}%`,
        transform: `translate3d(calc(-${activeIndex * tileWidth}% + ${cameraOffset}px),0,0) scale(${cameraScale})`
      }}
    >
      <div className="motion-world-thread"/>
      {plan.scenes.map((scene, index) => {
        const isActive = scene.id === active?.id;
        const localProgress = isActive ? progress : index < activeIndex ? 1 : 0;
        return <section
          key={scene.id}
          className={`motion-world-scene is-${scene.visual} ${isActive ? "is-active" : index < activeIndex ? "is-past" : "is-future"}`}
          style={{ width: `${tileWidth}%` }}
        >
          <div className="motion-scene-copy" style={{ opacity: isActive ? 1 : .2 }}>
            <span>{scene.eyebrow || scene.reference || "APOSTOLIC GUIDE"}</span>
            <strong>{scene.headline || plan.title}</strong>
            {scene.body ? <p>{scene.body}</p> : null}
          </div>
          <div className="motion-scene-art" aria-hidden="true">
            <svg viewBox="0 0 1000 560" role="presentation">
              <MotionIllustration visual={scene.visual} progress={localProgress}/>
            </svg>
          </div>
        </section>;
      })}
    </div>
    <img className="motion-canvas-wordmark" src="/brand/apostolic-guide-wordmark-reversed.png" alt=""/>
    <div className="motion-canvas-meta"><span>MOTION ENGINE 0.1</span><strong>{plan.title.toUpperCase()} · PATHWAY</strong></div>
    <div className="motion-canvas-footer">
      <div><span>{String(activeIndex + 1).padStart(2, "0")} / {String(sceneCount).padStart(2, "0")}</span><strong>{active?.reference || active?.headline || plan.title}</strong></div>
      <span>{active?.visual.replaceAll("-", " ").toUpperCase()}</span>
    </div>
    <div className="motion-canvas-progress"><i style={{ width: `${plan.duration ? clamp(currentTime / plan.duration) * 100 : 0}%` }}/></div>
    {active ? <CameraScale scene={active} progress={progress}/> : null}
  </div>;
}
