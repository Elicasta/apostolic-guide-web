# Apostolic Guide Remote Venue Mode

A low-latency, two-way teaching connection between an Apostolic Guide Studio producer (Miami) and a physical remote congregation (first pilot: Ogembo, Kenya). This is not YouTube playback.

## Prerequisites

1. Apply `supabase/migrations/202610220001_studio_remote_venues.sql` before using the venue invitation form.
2. Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the server deployment. Do not expose the API secret to the browser.
3. Use HTTPS (or localhost) for browser camera/microphone permissions.
4. Bring a laptop and a camera/microphone or audio interface to each location, plus stable internet.
5. Have the Miami OBS Browser Source actively open on the *original* output URL. The OBS output receiver mirrors host audio/video into LiveKit. The remote venue connects to this mirror and reproduces the same Studio graphics and current scene locally.

## Miami operator

1. Studio → Episodes → select or create an episode and run.
2. Guests → check **Remote church venue**, enter a venue name and choose **Create venue link**. Share only the returned private `/venue/<token>` link with the local operator. Never send the OBS output token.
3. **Start session**. Open the original `/output/<sessionId>?token=<OBS-token>` as an OBS browser source.
4. Open the session **Console**, connect Miami camera/mic, wait for **LIVE TO OUTPUT**.
5. Use **Remote venues** section to confirm the remote publisher status and optionally **MONITOR RETURN AUDIO (HEADPHONES)**. Monitoring is off by default.
6. Run scenes and Scripture cues. The venue receives the program composition, not a disconnected raw camera feed.
7. **Rotate venue link** to replace the invitation or **Revoke venue link** to end access. Invitation revocation takes effect on the venue's next credential check. End the event and disconnect provider rooms after an unexpected access incident.

## Remote venue operator

1. Open the private venue invitation on a HTTPS browser.
2. Connect a projector or TV, local PA speakers and the interpreter microphone.
3. Ensure local PA playback is NOT fed into the audio interface input going back to Miami (mix-minus). Use headphones in initial tests.
4. Check the mix-minus/headphones confirmation, select inputs and click **Connect camera + microphone**. Allow device access.
5. Click **Open incoming program**, then **Fullscreen for projector** after the feed appears. The receiving screen shows the composed Studio presentation. Only the Miami producer decides when the local return camera appears in the broadcast.
6. **Mute incoming audio** isolates the display audio for a controlled test. Check the **Interpreter mic** level indicator to confirm the local microphone is actually sending a signal. Use **Mute mic** and **Stop camera** to isolate a problem without leaving the room. Use **Disconnect** and reconnect to change input devices or recover from a drop. A new Miami session requires reconnecting the return feed and reopening the receiving screen.
7. The displayed API RTT is an HTTP diagnostic, not measured media jitter or true speech latency.

## Security and feed behavior

- Normal guest invitations do not authorize venue output. Venue grants are scoped to one episode and expire in 7 days. Old links become invalid on rotation or revocation.
- The read-only venue output uses its own LiveKit participant identity. Joining cannot replace the official OBS output.
- The venue output may subscribe to Miami media, but receives no publisher credential for the host mirror.
- Venue camera/interpreter returns use the standard guest publishing path. The producer determines on-air scene state.
- The venue receiver suppresses locally sourced guest audio to avoid hearing its own microphone. Miami host audio remains audible unless the local operator mutes it.
- The program remains tied to the existing Studio state, with no independent guest-side scene control.

## Two-computer acceptance test

| Test | Expected outcome |
|---|---|
| Ordinary guest invite opens `/venue/` | Denied |
| Revoked, expired or wrong-episode venue token | Denied |
| Remote output and OBS connected together | Neither connection evicts the other |
| Miami: host, Scripture, split and holding scenes | Local screen follows automatically |
| Kenya interpreter speaks | Producer hears return on headphones; OBS receives guest stream |
| Miami preaches while interpreter mic is open | No echo after PA mix-minus is configured |
| Local device permission denied | Actionable error; recovery remains possible |
| Network disconnect and refresh | Explicit reconnection restores camera/mic; program recovers |
| Invitation link rotated while open | Previous browser loses program access |
| Long teaching session | 60-minute live test completed with audio, latency and disconnect notes |

## Rollout

The feature is additive and isolated to the remote venue screens, invitation validation, output receiving and Studio producer monitoring. Keep PR in draft until tests, migrations, a Vercel preview and a real multi-device test pass. The venue receiving browser must not share a LiveKit output identity with OBS or any other venue display. On failure, return to the current OBS/YouTube workflow without touching regular guest invitations.
