# Sankar Group — AI Voice Sales Agent

A full-stack, consent-based browser voice sales bot built for the internship assignment. It supports live speech recognition (Chrome/Edge recommended), spoken AI responses, a live transcript, call duration/status, browser audio recording, AI-generated call summaries and sales outcome classification, and persistent call history.

## Features
- Real microphone conversation using the browser Web Speech API and speech synthesis.
- Explicit recording consent before the call can begin.
- Actual WebM audio recording uploaded when the call ends; recordings can be played from call history.
- Gemini-powered sales replies, summary, customer needs, objections, next steps and one of the six required sales statuses.
- JSON-file persistence for call history (simple to deploy; for production, replace with a managed database/object storage).
- Manual text fallback if speech recognition is unsupported or permission is denied.
- API key remains server-side.

## Requirements
- Node.js 20+ (Node 22 LTS recommended).
- Google AI Studio Gemini API key: https://aistudio.google.com/app/apikey
- Chrome or Edge recommended for speech recognition. Recognition availability depends on browser and may use a remote recognition service. Use HTTPS in production.

## Run locally
1. Install Node.js.
2. From this folder run `npm install` and `npm --prefix server install` and `npm --prefix client install`.
3. Copy `server/.env.example` to `server/.env` and set `GEMINI_API_KEY`.
4. Run `npm run dev`.
5. Open the Vite URL shown (usually http://localhost:5173).

The default model is `gemini-2.5-flash`; change `GEMINI_MODEL` in `server/.env` if your AI Studio project exposes a different model. Free-tier availability and request limits vary by model, region, account, and time; check the live rate limits in AI Studio. Never put the key in the client.

## Test the flow
1. Open the app in Chrome/Edge and allow microphone access.
2. Check the recording consent checkbox.
3. Click Start Call. The agent greets the customer.
4. Say a use case, ask about price/security/integrations, or raise an objection.
5. Wait for the AI answer; it is added to the transcript and spoken aloud.
6. Click End Call. The app uploads the recording and asks Gemini to summarize/classify the call.
7. Open Call History to view the transcript, summary, status and play the recording.
8. Test without an API key: the app responds in local demo mode and still exercises the workflow, but this is not the real AI mode to show in the interview.

## Smoke test
With the backend running, open a second terminal and run `npm --prefix server run smoke-test` (or `node server/src/smoke-test.js`). It checks health and saved-call history endpoints. This does not replace a manual microphone/recording test in a real browser.

## API
- `GET /api/health` — service and AI configuration status
- `GET /api/calls` — saved call history
- `GET /api/calls/:id` — full call
- `GET /api/calls/:id/recording` — audio playback
- `POST /api/assistant/reply` — generate sales reply
- `POST /api/calls` — save completed call and recording
- `POST /api/calls/:id/analyze` — summarize and classify

## Deploy
### Backend (Render or another Node host)
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables `GEMINI_API_KEY`, `GEMINI_MODEL`, `CLIENT_ORIGIN` (your deployed frontend URL).
- Note: local JSON and recordings are ephemeral on hosts without a persistent disk. Attach a persistent disk for a demo, or replace JSON storage with a managed database/object store before production.

### Frontend (Vercel or another static host)
- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_BASE` to the deployed backend URL, e.g. `https://your-service.onrender.com`.
- Deploy the frontend on HTTPS; browser microphone access requires a secure context (localhost is allowed locally).

## Privacy and production notes
- Recording is disabled until the user explicitly consents. The UI identifies the session as recorded and provides a way to play back the saved audio.
- This prototype is not a telephony system and does not call phone numbers. It is a browser-to-browser voice demonstration.
- Browser speech recognition may process speech through the browser vendor's service. Disclose this to testers. Avoid recording sensitive personal information.
- Add authentication, authorization, retention/deletion controls, managed storage, rate limiting, and legal/privacy review before public production use.


## Sales conversation quality update

The sales prompt now instructs Aira to avoid repeated greetings and generic pitches, answer product questions with concrete examples, clarify likely speech-recognition errors, and guide the conversation toward discovery/demo without pressure. The local fallback includes targeted replies for greetings, unclear “AI bot” phrasing, feature questions, pricing, demos, and common objections.

## Recording playback troubleshooting (v5)

The server strips the complete `data:...;base64,` prefix before decoding recordings, including MediaRecorder MIME types that include codec parameters (such as `audio/webm;codecs=opus`). The recording endpoint checks that the saved file exists and serves it as `audio/webm`. The UI only flags a recording as available when a non-empty blob was captured.

Note: the current browser MediaRecorder captures the microphone input. Browser `speechSynthesis` playback is not guaranteed to be included in the saved audio file. The transcript retains both sides of the conversation.

## Conversation and voice-recognition update (v6)

- Voice recognition now collects interim/final speech and keeps the microphone session open through short pauses; click the microphone again when the complete sentence is finished to submit it.
- If Chrome/Edge ends a recognition session after a pause, the client attempts to resume listening without submitting a partial turn.
- The local sales fallback answers “How can FlowPilot help?” with concrete capabilities and recognizes approval-chasing pain points.
- If Gemini fails, the app uses a targeted local fallback but also surfaces the Gemini provider error in the UI instead of silently presenting the generic fallback as an AI answer. Check the server `.env`, API key, model, quota, and the visible error message.

This is still browser-based speech recognition; browser support and network conditions can affect accuracy. Test in Chrome or Edge, speak naturally, and click the mic to finish each turn.


## Final validation before submission (v13)
- From Call History, choose **Continue conversation** to resume a saved transcript. The next session includes the previous messages as AI context and is saved as a separate call linked to the previous call. The new audio recording covers only the resumed session; the transcript and analysis include the full carried-forward conversation.
- Run `npm test` (or `npm --prefix server test`) to exercise health, consent enforcement, call creation, summary/status generation, history, continued-conversation linkage, recycle-bin restore, and permanent deletion against an isolated temporary data directory. This test does not touch your real `server/data`.
- Run `npm --prefix client run build` to validate the production frontend bundle.
- Run `node --check server/src/index.js` to validate backend JavaScript syntax.
- Perform the browser acceptance test in Chrome/Edge: consent → start → speak → correct transcript while recognition is active → stop microphone to send edited text → hear Aira → end call → verify summary/status/transcript → play recording → move to Recycle Bin → restore → permanently delete a disposable call.
- The speech-recognition correction field is now protected from later recognition events once manually edited, so the user's correction should be the submitted message.
- `VOICE_SALES_DATA_DIR` can point to a persistent writable directory. Without persistent disk or managed storage, JSON records and audio may be lost when a hosting provider restarts/redeploys the service.
- Public deployment is not production-safe for real customer data until authentication/authorization, rate limits, retention policy, and privacy/legal review are added. Use synthetic demo conversations for the internship video.
- The browser `MediaRecorder` records microphone input. It does not reliably include the browser's speech-synthesis audio, so do not claim full two-sided call audio unless the deployed browser flow has been verified to capture both sides.
