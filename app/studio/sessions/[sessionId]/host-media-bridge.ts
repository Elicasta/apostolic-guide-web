export type HostBridgeStatus = "idle" | "signaling" | "connected" | "failed";

export async function connectHostMediaBridge(sessionId: string, stream: MediaStream, onStatus: (status: HostBridgeStatus) => void) {
  onStatus("signaling");
  const peer = new RTCPeerConnection();
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    const offerSdp = peer.localDescription?.sdp;
    if (!offerSdp) throw new Error("Unable to create host media offer");

    const offerResponse = await fetch(`/api/studio/sessions/${sessionId}/host-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerSdp })
    });
    if (!offerResponse.ok) throw new Error((await offerResponse.json().catch(() => ({}))).error ?? "Unable to publish host media offer");
    const offerPayload = await offerResponse.json();
    const signalVersion = Number(offerPayload.signal?.signal_version ?? 0);

    const answer = await waitForAnswer(sessionId, signalVersion);
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") onStatus("connected");
      if (["failed", "closed"].includes(peer.connectionState)) onStatus("failed");
    };
    if (peer.connectionState === "connected") onStatus("connected");
    return peer;
  } catch (error) {
    peer.close();
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

async function waitForAnswer(sessionId: string, signalVersion: number) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`/api/studio/sessions/${sessionId}/host-media`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      if (Number(payload.signal?.signal_version ?? -1) === signalVersion && payload.signal?.answer_sdp) return String(payload.signal.answer_sdp);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("OBS output did not answer the host media connection.");
}
