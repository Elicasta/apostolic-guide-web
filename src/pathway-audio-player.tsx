"use client";

import { Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/analytics";
import styles from "@/pathway-audio.module.css";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function PathwayAudioPlayer({ slug, title, audioUrl }: { slug: string; title: string; audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPositionRef = useRef(0);
  const listenedRef = useRef(0);
  const lastReportedRef = useRef(0);
  const startedRef = useRef(false);
  const milestonesRef = useRef(new Set<number>());
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const storageKey = useMemo(() => `ag_pathway_audio:${slug}`, [slug]);

  const reportProgress = (reason: string) => {
    if (listenedRef.current <= lastReportedRef.current) return;
    const delta = Math.max(0, listenedRef.current - lastReportedRef.current);
    lastReportedRef.current = listenedRef.current;
    trackEvent("audio_progress", {
      pathwaySlug: slug,
      positionSeconds: Math.round(audioRef.current?.currentTime ?? position),
      durationSeconds: Math.round(duration || audioRef.current?.duration || 0),
      listenedSeconds: Math.round(listenedRef.current),
      deltaListenedSeconds: Math.round(delta),
      reason
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null") as { position?: number; listened?: number } | null;
      if (stored?.position && Number.isFinite(stored.position)) {
        audio.currentTime = Math.max(0, stored.position);
        setPosition(audio.currentTime);
        lastPositionRef.current = audio.currentTime;
      }
      if (stored?.listened && Number.isFinite(stored.listened)) {
        const restoredListening = Math.max(0, stored.listened);
        listenedRef.current = restoredListening;
        lastReportedRef.current = restoredListening;
      }
    } catch {}

    const onLoaded = () => {
      setDuration(audio.duration || 0);
      if (audio.currentTime > 0 && audio.currentTime < audio.duration - 5) setPosition(audio.currentTime);
    };
    const onPlay = () => {
      setPlaying(true);
      if (!startedRef.current) {
        startedRef.current = true;
        trackEvent("audio_started", {
          pathwaySlug: slug,
          positionSeconds: Math.round(audio.currentTime),
          resumed: audio.currentTime > 5
        });
      }
    };
    const onPause = () => {
      setPlaying(false);
      reportProgress("pause");
    };
    const onTime = () => {
      const current = audio.currentTime;
      const delta = current - lastPositionRef.current;
      if (!audio.seeking && !audio.paused && delta > 0 && delta <= 2.25) listenedRef.current += delta;
      lastPositionRef.current = current;
      setPosition(current);

      try { localStorage.setItem(storageKey, JSON.stringify({ position: current, listened: listenedRef.current, updatedAt: Date.now() })); } catch {}

      const total = audio.duration || 0;
      if (total > 0) {
        const ratio = current / total;
        for (const milestone of [25, 50, 75]) {
          if (ratio >= milestone / 100 && !milestonesRef.current.has(milestone)) {
            milestonesRef.current.add(milestone);
            trackEvent("audio_progress", {
              pathwaySlug: slug,
              milestone,
              positionSeconds: Math.round(current),
              durationSeconds: Math.round(total),
              listenedSeconds: Math.round(listenedRef.current),
              deltaListenedSeconds: 0,
              reason: "milestone"
            });
          }
        }
      }

      if (listenedRef.current - lastReportedRef.current >= 30) reportProgress("heartbeat");
    };
    const onEnded = () => {
      setPlaying(false);
      reportProgress("ended");
      trackEvent("audio_completed", {
        pathwaySlug: slug,
        durationSeconds: Math.round(audio.duration || 0),
        listenedSeconds: Math.round(listenedRef.current)
      });
      try { localStorage.removeItem(storageKey); } catch {}
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      reportProgress("unmount");
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, slug, storageKey]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  };

  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds));
    lastPositionRef.current = audio.currentTime;
    setPosition(audio.currentTime);
  };

  const setPlaybackSpeed = () => {
    const next = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return <div className={styles.player}>
    <audio ref={audioRef} src={audioUrl} preload="metadata" />
    <div className={styles.top}>
      <button type="button" className={styles.play} onClick={toggle} aria-label={playing ? "Pause pathway audio" : "Play pathway audio"}>{playing ? <Pause size={20}/> : <Play size={20}/>}</button>
      <div className={styles.copy}><small>Listen to this pathway · AI narration</small><strong>{title}</strong></div>
    </div>
    <div className={styles.progressRow}>
      <span className={styles.time}>{formatTime(position)}</span>
      <input className={styles.range} aria-label="Audio position" type="range" min={0} max={Math.max(duration, 1)} step={1} value={Math.min(position, Math.max(duration, 1))} onChange={(event) => {
        const next = Number(event.target.value);
        if (audioRef.current) audioRef.current.currentTime = next;
        lastPositionRef.current = next;
        setPosition(next);
      }}/>
      <span className={styles.time}>{formatTime(duration)}</span>
    </div>
    <div className={styles.controls}>
      <button className={styles.control} type="button" onClick={() => seekBy(-15)} aria-label="Back 15 seconds"><RotateCcw size={15}/></button>
      <button className={styles.control} type="button" onClick={() => seekBy(15)} aria-label="Forward 15 seconds"><RotateCw size={15}/></button>
      <button className={styles.speed} type="button" onClick={setPlaybackSpeed}>{speed}×</button>
    </div>
    {position > 5 && duration > position + 5 ? <div className={styles.resume}>Progress is saved on this device.</div> : null}
  </div>;
}
