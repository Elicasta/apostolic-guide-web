import{publishGuestStream,type LiveKitConnection}from"@/studio/livekit-client";
export type OutputHostBridgeStatus = "waiting" | "connecting" | "connected" | "failed";

export async function connectOutputHostMedia(
  sessionId: string,
  token: string,
  onStream: (stream: MediaStream) => void,
  onStatus: (status: OutputHostBridgeStatus) => void
) {
  onStatus("waiting");
  const signal = await waitForOffer(sessionId, token);
  onStatus("connecting");

  const peer = new RTCPeerConnection();
  const remoteStream = new MediaStream();
  let mirror:LiveKitConnection|null=null,mirrorTimer:ReturnType<typeof setTimeout>|null=null,mirrorStarted=false;
  async function startMonitorMirror(){if(mirrorStarted||!remoteStream.getVideoTracks().length)return;mirrorStarted=true;try{const response=await fetch(`/api/studio/output/${sessionId}/remote-media?token=${encodeURIComponent(token)}`,{cache:"no-store"});if(!response.ok)return;const payload=await response.json();if(!payload.hostPreviewPublisher)return;mirror=await publishGuestStream(payload.hostPreviewPublisher,remoteStream);}catch{mirrorStarted=false;}}
  peer.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      if (!remoteStream.getTracks().some((item) => item.id === track.id)) remoteStream.addTrack(track);
    });
    if (!event.streams[0] && !remoteStream.getTracks().some((item) => item.id === event.track.id)) remoteStream.addTrack(event.track);
    onStream(remoteStream);
    if(mirrorTimer)clearTimeout(mirrorTimer);mirrorTimer=setTimeout(()=>void startMonitorMirror(),250);
  };

  try {
    await peer.setRemoteDescription({ type: "offer", sdp: String(signal.offer_sdp) });
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGathering(peer);
    const answerSdp = peer.localDescription?.sdp;
    if (!answerSdp) throw new Error("Unable to create output media answer");

    const response = await fetch(`/api/studio/output/${sessionId}/host-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answerSdp, signalVersion: Number(signal.signal_version) })
    });
    if (!response.ok) throw new Error("Unable to save output media answer");

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") onStatus("connected");
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)){onStatus("failed");mirror?.disconnect();mirror=null;}
    };
    return peer;
  } catch (error) {
    if(mirrorTimer)clearTimeout(mirrorTimer);mirror?.disconnect();peer.close();
    onStatus("failed");
    throw error;
  }
}

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const listener = () => {
      if (peer.iceGatheringState !== "complete") return;
      peer.removeEventListener("icegatheringstatechange", listener);
      resolve();
    };
    peer.addEventListener("icegatheringstatechange", listener);
  });
}

async function waitForOffer(sessionId: string, token: string) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch(`/api/studio/output/${sessionId}/host-media?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (payload.signal?.offer_sdp && Number(payload.signal?.signal_version ?? 0) > 0) return payload.signal;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Host media offer unavailable.");
}
