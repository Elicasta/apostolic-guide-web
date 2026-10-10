# Teleprompter Voice Follow: Safari preview

## What is in the preview

- The iPad reader and iPhone remote both expose **Start voice follow**. Use only one mic at a time.
- Safari's prefixed `webkitSpeechRecognition` listens while the page is in the foreground. The recognized transcript (not raw audio) is fed into the local deterministic Voice Follow engine.
- Script matching sends the section + spoken word position over the existing Supabase teleprompter session channel. The iPad positions the recognized line near the camera axis.
- Recognition stalls and quiet periods **hold the last position**. Off-script finalized segments are captured for review. Two matched finalized segments reacquire the script. Manual Next/Previous, scrolling, or navigation overrides Voice Follow.
- Raw audio is not uploaded by Apostolic Guide. Safari's speech recognition service may process microphone audio externally as part of the browser's own implementation.
- The phone may fetch its script from the authenticated cloud document API or use local seeded scripts. If it cannot load a custom script, use the iPad microphone instead.
- Improvisation notes are saved **locally to the device running the microphone** and can be exported as Markdown. This release does not yet provide cloud note synchronization or final speech-to-text archive accuracy.

## Testing on actual Apple devices

1. Open the Vercel PR preview in **Safari**, sign in to Apostolic Guide Studio, then open `/teleprompter` on the iPad.
2. Tap **Remote** and scan the displayed QR code using the iPhone Camera app. Sign in if asked.
3. On the iPhone remote, tap **Start voice follow**, accept microphone permission, and keep Safari visible. The iPad displays the current section and scrolls as recognized phrases advance. The iPad microphone is an alternative.
4. Speak three or more consecutive words from the visible script. Pause; the position should hold. Speak a non-script sentence with a Scripture reference and resume the script. Check the exported improvisation Markdown.
5. Tap **Next** or turn on timed Auto Scroll while Voice Follow is active; mic following should stop. Start Voice Follow again to resume from the currently selected section.
6. Check the edge cases: repeated phrases, script skipped forward, long silence, permission denial, Safari network interruption, switching apps, and losing connection.
7. On the library page confirm browser documents survive cloud connection failure, local recovery copies appear on conflicts, Markdown exports, and 409 revision conflicts prevent stale overwrites.

## Current limitations

- Safari / Web Speech API behavior varies across iOS builds. Interim transcripts may arrive infrequently; recognition can stop when Safari moves to the background.
- No recordings are stored, and this preview does not verify a complete teaching transcript.
- Remote mic requires access to the full chosen script. Only seeded scripts are guaranteed locally without a functioning cloud API.
- Browser speech recognition is not guaranteed offline or private to the device.
- The new Supabase documents migration is applied to the staging project, **not to production**. Preview cloud storage is not considered verified until environment wiring and authenticated cross-device testing pass.
- OpenAI realtime transcription would be a later opt-in feature and requires a separately secured API session.

## Pricing checked October 9, 2026

| Model | Published estimate per minute | 10h |
| --- | ---: | ---: |
| Safari Web Speech | $0 OpenAI API charge | $0 |
| GPT-Realtime-Whisper | $0.017 | $10.20 |
| GPT-Live-Transcribe | $0.017 | $10.20 |
| GPT-Transcribe | $0.0045 | $2.70 |
| GPT-4o Mini Transcribe | $0.003 | $1.80 |

See https://developers.openai.com/api/docs/pricing for current rates. Charges for other services, storage, or optional processing are not included.

## Release gate

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`; inspect GitHub/Vercel checks. Use a real iPhone/iPad Safari test before merging. No production migrations or publishing on this feature branch.
