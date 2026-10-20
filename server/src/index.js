import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.VOICE_SALES_DATA_DIR || path.resolve(__dirname, '../data'));
const callsFile = path.join(dataDir, 'calls.json');
const recordingsDir = path.join(dataDir, 'recordings');
const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({ origin(origin, cb) { if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true); return cb(new Error('Origin not allowed by CORS')); } }));
app.use(express.json({ limit: '30mb' }));

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(recordingsDir, { recursive: true });
async function readCalls() { try { return JSON.parse(await fs.readFile(callsFile, 'utf8')); } catch { return []; } }
async function writeCalls(calls) { await fs.writeFile(callsFile, JSON.stringify(calls, null, 2)); }
const statuses = ['Converted', 'Interested', 'Follow-up Required', 'Not Interested', 'Demo Requested', 'No Response'];
const productContext = `You are Aira, a skilled, warm, ethical SaaS sales representative for FlowPilot, a fictional workflow automation SaaS for small and medium businesses. This is a live sales conversation, not a generic FAQ bot.

PRODUCT FACTS (illustrative demo data): FlowPilot centralizes repetitive workflows, approvals, task ownership, and basic team reporting. It can help teams route approval requests, assign task owners, and track work status in one place. It has an illustrative 14-day trial. Sample plans start at $19 per user/month; final pricing depends on plan and billing. Onboarding assistance is available. Do not invent security certifications, named customers, ROI statistics, or integrations. If asked about a specific integration, say it must be confirmed before promising compatibility. Be transparent that these are illustrative product details if directly asked.

SALES CONVERSATION RULES:
- Use the entire recent conversation. Never repeat a greeting after the first turn, and do not repeat the same generic pitch or ask the same question again if the customer already answered it.
- Answer the exact question first. When asked what FlowPilot offers, name 2–3 concrete capabilities and connect them to a practical example; do not respond with only another discovery question.
- Guide the conversation naturally: understand the workflow/pain point, explain a relevant capability, qualify team size or current tools when useful, address concerns honestly, and suggest a short demo or trial when appropriate.
- Ask at most ONE concise follow-up question per turn. Vary the question based on what the customer has already said.
- If the customer's wording looks like a speech-recognition mistake or is genuinely unclear (for example, “exact vote”), do not confidently guess the meaning. Briefly ask whether they meant “an AI bot for your business” or invite them to clarify.
- If the customer only says “hello” or “hello hello”, greet them briefly once and invite them to continue; do not keep restarting the sales introduction. If they repeat “hello”, acknowledge that you can hear them and ask one simple question.
- Handle objections respectfully, without pressure. Never claim a purchase is complete unless the customer explicitly confirms it. Never invent facts or pretend a demo has been booked.
- Keep spoken replies natural and easy to understand, typically 2–4 short sentences (about 25–65 words). Avoid robotic repetition and unnecessary filler. Match the customer's language where possible.`;
async function gemini(prompt, jsonMode = false) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, ...(jsonMode ? { responseMimeType: 'application/json' } : {}) } })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini API returned ${response.status}`);
  return payload?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
}
function localReply(message, history = []) {
  const m = message.toLowerCase();
  const priorAgentText = history.filter(x => x.role === 'assistant').map(x => String(x.text || '').toLowerCase()).join(' ');
  if (/\b(can you hear me|do you hear me|is my voice clear|can you understand me)\b/.test(m)) return 'Yes, I can hear you. Your voice is coming through. What would you like FlowPilot to help your business improve?';
  if (/^\s*(hello|hi|hey)[!. ]*$/.test(m)) {
    if (/what does your team spend|thanks for joining|hi there|hello/.test(priorAgentText)) return 'Hi again, I can hear you. What would you like an AI assistant or workflow tool to help your business do?';
    return 'Hi! I’m Aira from FlowPilot. I can help you explore ways to automate repetitive business workflows. What would you most like to improve?';
  }
  if (/exact vote|ai bot|chat ?bot|voice bot/.test(m)) return 'I can help with business automation. Just to make sure I understood you correctly, are you looking for an AI bot to answer customer questions, or a tool to automate your team’s internal workflows?';
  if (/\b(?:track|tracking|check|monitor|see|view|manage|follow(?:ing)? up on|status of|pending)\b.*\b(?:approv\w*|request\w*)\b|\b(?:approv\w*|request\w*)\b.*\b(?:pending|status|track|tracking)\b|chasing approval|waiting for approval/.test(m)) return 'Yes. FlowPilot can help your team track pending approvals by showing each request’s status, who owns the next action, and which approver it is waiting on. It can also route requests to the right person so fewer items get lost in messages. How are you tracking approvals today—spreadsheets, email, or chat?';
  if (/how can (?:flow\s?pilot|you|this) help|how does (?:flow\s?pilot|this) help|help (?:my|our) business|what can (?:flow\s?pilot|you|your product|this) offer|what does flow\s?pilot offer|what can flow\s?pilot do|what do you offer|what can you offer|what can you do|what does it do|tell me about (?:flow\s?pilot|your product)|features/.test(m)) return 'FlowPilot helps your business reduce the time spent chasing approvals and coordinating repetitive work. It can route approval requests to the right person, assign an owner to each task, and show everyone the current status. For example, an approval request can move through a clear workflow instead of getting lost in messages. Which process causes the most delays for your team?';
  if (/chasing approval|approval request|approval requests|follow(?:ing)? up.*approval/.test(m)) return 'Chasing approvals is exactly the kind of repetitive work FlowPilot is designed to organize. You can route each request to the right approver, track whether it is pending or completed, and make ownership clear so fewer requests get lost in messages. How many people typically need to approve a request?';
  if (/price|cost|pricing|expensive|budget/.test(m)) return 'That is a fair question. FlowPilot’s illustrative plans start at $19 per user per month, with the final price depending on plan and billing. If you tell me roughly how many people would use it, I can help identify what to clarify in a plan comparison.';
  if (/demo|show me|see it|walkthrough/.test(m)) return 'Absolutely. A short demo can walk through a real example, such as routing an approval, assigning an owner, and tracking its status. Which workflow should the demo focus on?';
  if (/security|secure|privacy|data/.test(m)) return 'Security is important. I do not want to claim certifications or controls without confirming them. We can document your requirements and verify the relevant details with the product team. Are there specific standards you need?';
  if (/integrat|slack|salesforce|jira|teams/.test(m)) return 'Integrations depend on the exact tool and plan, so I would verify that before promising compatibility. Which tool is essential to your workflow?';
  if (/not interested|no thanks|not now/.test(m)) return 'I understand, and I appreciate your time. I won’t pressure you. Would you prefer to end here, or should we note a suitable time for a follow-up?';
  if (/trial|try|start/.test(m)) return 'FlowPilot has an illustrative 14-day trial. A sensible first step is to choose one repetitive workflow and test whether automating it helps. Which task would you start with?';
  if (/how are you|who are you/.test(m)) return 'I’m Aira, FlowPilot’s sales assistant. I help teams explore ways to organize approvals, repetitive workflows, task ownership, and basic reporting. What would you like to improve in your business?';
  if (history.length < 2) return 'FlowPilot helps teams route approvals, assign task owners, and track workflow progress in one place. What repetitive task is taking your team the most time today?';
  return 'I want to make sure I recommend something relevant rather than give you a generic pitch. Could you describe one task your team repeats often or a process that gets delayed?';
}
app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', storage: 'json-file' }));
app.get('/api/calls', async (_req, res) => {
  const calls = await readCalls();

  res.json(
    calls
      .filter(c => !c.trashedAt)
      .map(({ recordingPath, recordingPaths, ...c }) => {
        const recordings = recordingPaths?.length
          ? recordingPaths
          : (recordingPath ? [recordingPath] : []);

        return {
          ...c,
          hasRecording: recordings.length > 0,
          recordingCount: recordings.length
        };
      })
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
  );
});
app.get('/api/trash', async (_req, res) => { const calls = await readCalls(); res.json(calls.filter(c => c.trashedAt).map(({ recordingPath, ...c }) => ({ ...c, hasRecording: Boolean(recordingPath) })).sort((a,b) => new Date(b.trashedAt) - new Date(a.trashedAt))); });
app.post('/api/calls/:id/restore', async (req, res) => { const calls = await readCalls(); const call = calls.find(c => c.id === req.params.id); if (!call || !call.trashedAt) return res.status(404).json({ error: 'Trashed call not found' }); delete call.trashedAt; await writeCalls(calls); res.json({ restored: true, id: call.id }); });
app.delete('/api/calls/:id/permanent', async (req, res) => { const calls = await readCalls(); const index = calls.findIndex(c => c.id === req.params.id && c.trashedAt); if (index < 0) return res.status(404).json({ error: 'Trashed call not found' }); const [call] = calls.splice(index, 1); if (call.recordingPath) await fs.rm(call.recordingPath, { force: true }); await writeCalls(calls); res.json({ deleted: true, id: call.id }); });
app.delete('/api/trash', async (_req, res) => { const calls = await readCalls(); const trashed = calls.filter(c => c.trashedAt); await Promise.all(trashed.map(c => c.recordingPath ? fs.rm(c.recordingPath, { force: true }) : Promise.resolve())); await writeCalls(calls.filter(c => !c.trashedAt)); res.json({ emptied: true, count: trashed.length }); });
app.delete('/api/calls/:id', async (req, res) => { const calls = await readCalls(); const call = calls.find(c => c.id === req.params.id && !c.trashedAt); if (!call) return res.status(404).json({ error: 'Call not found' }); call.trashedAt = new Date().toISOString(); await writeCalls(calls); res.json({ trashed: true, id: call.id }); });
app.get('/api/calls/:id', async (req, res) => {
  const call = (await readCalls()).find(c => c.id === req.params.id);

  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }

  const { recordingPath, recordingPaths, ...safe } = call;

  const recordings = recordingPaths?.length
    ? recordingPaths
    : (recordingPath ? [recordingPath] : []);

  return res.json({
    ...safe,
    hasRecording: recordings.length > 0,
    recordingCount: recordings.length
  });
});
app.get('/api/calls/:id/recording', async (req, res) => {
  const call = (await readCalls()).find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  // Support both existing single recordings and the new session recordings.
  const recordings = call.recordingPaths?.length
    ? call.recordingPaths
    : (call.recordingPath ? [call.recordingPath] : []);

  const index = Number.parseInt(req.query.session ?? '0', 10);
  if (!Number.isInteger(index) || index < 0 || index >= recordings.length) {
    return res.status(404).json({ error: 'Recording session not found' });
  }

  const recordingPath = recordings[index];
  try {
    await fs.access(recordingPath);
  } catch {
    return res.status(404).json({ error: 'Recording file is missing from server storage' });
  }

  res.setHeader('Content-Type', 'audio/webm');
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(recordingPath);
});
app.post('/api/assistant/reply', async (req, res) => {
  const { message, history = [], language = 'en-US' } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message is required' });
  // Prefer deterministic answers for clear product intents. This prevents a generic Gemini
  // response from overriding a directly relevant answer for approval tracking, pricing, demos, etc.
  const knownIntent = /\b(?:track|tracking|check|monitor|see|view|manage|follow(?:ing)? up on|status of|pending)\b.*\b(?:approv\w*|request\w*)\b|\b(?:approv\w*|request\w*)\b.*\b(?:pending|status|track|tracking)\b|chasing approval|waiting for approval|how can (?:flow\s?pilot|you|this) help|how does (?:flow\s?pilot|this) help|help (?:my|our) business|what can (?:flow\s?pilot|you|your product|this) offer|what does flow\s?pilot offer|what can flow\s?pilot do|what do you offer|what can you offer|what can you do|what does it do|tell me about (?:flow\s?pilot|your product)|features|\b(?:price|cost|pricing|expensive|budget)\b|\b(?:demo|show me|walkthrough)\b|\b(?:security|secure|privacy|data)\b|\b(?:integrat|slack|salesforce|jira|teams)\w*|\b(?:trial|try)\b/i.test(message);
  if (knownIntent) return res.json({ reply: localReply(message, history), mode: 'local-intent', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  try {
    const context = history.slice(-12).map(x => `${x.role === 'assistant' ? 'Agent' : 'Customer'}: ${String(x.text).slice(0, 1200)}`).join('\n');
    const prompt = `${productContext}\nRespond in the language indicated by locale ${language}. Answer the customer's latest message directly before asking at most one follow-up question. Do not repeat any previous greeting, pitch, or discovery question; use prior turns to advance the conversation. If the latest wording may be garbled speech, ask a short clarification instead of assuming. Keep the reply natural for speech, 2–4 short sentences, about 25–65 words.\nRecent conversation (oldest to newest):\n${context || '(No previous messages)'}\nCustomer's latest message: ${message.trim()}\nWrite only Aira's spoken reply:`;
    const answer = await gemini(prompt);
    res.json({ reply: answer || localReply(message, history), mode: answer ? 'gemini' : 'demo', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
  } catch (err) {
    // Keep the demo conversational, but expose the provider failure instead of disguising it as Aira's reply.
    res.json({ reply: localReply(message, history), mode: 'demo', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', warning: `Gemini request failed: ${err.message}` });
  }
});
app.post('/api/calls', async (req, res) => {
  const body = req.body || {};

  if (!body.consent) {
    return res.status(400).json({
      error: 'Recording consent is required to save a call recording.'
    });
  }

  if (!Array.isArray(body.transcript)) {
    return res.status(400).json({ error: 'transcript must be an array' });
  }

  if (
    typeof body.recordingBase64 === 'string' &&
    body.recordingBase64.length > 26_000_000
  ) {
    return res.status(413).json({
      error: 'Recording is too large for this demo (maximum about 19 MB).'
    });
  }

  const calls = await readCalls();
  const continuedFromCallId =
    typeof body.continuedFromCallId === 'string'
      ? body.continuedFromCallId
      : null;

  // A continuation updates the existing conversation, not a new record.
  const existingCall = continuedFromCallId
    ? calls.find(c => c.id === continuedFromCallId && !c.trashedAt)
    : null;

  if (continuedFromCallId && !existingCall) {
    return res.status(404).json({
      error: 'The conversation to continue was not found in active history.'
    });
  }

  let newRecordingPath = null;

  if (typeof body.recordingBase64 === 'string' && body.recordingBase64.length > 0) {
    const raw = body.recordingBase64.replace(/^data:[^,]*;base64,/, '');
    newRecordingPath = path.join(recordingsDir, `${crypto.randomUUID()}.webm`);
    await fs.writeFile(newRecordingPath, Buffer.from(raw, 'base64'));
  }

  if (existingCall) {
    // Preserve the original start time and existing recordings.
    const recordings = existingCall.recordingPaths?.length
      ? [...existingCall.recordingPaths]
      : (existingCall.recordingPath ? [existingCall.recordingPath] : []);

    if (newRecordingPath) recordings.push(newRecordingPath);

    existingCall.recordingPaths = recordings;
    existingCall.transcript = body.transcript;
    existingCall.endedAt = body.endedAt || new Date().toISOString();
    existingCall.durationSeconds =
      Number(existingCall.durationSeconds || 0) +
      Math.max(0, Number(body.durationSeconds || 0));
    existingCall.language = body.language || existingCall.language || 'en-US';
    existingCall.consent = true;
    existingCall.mode = body.mode || existingCall.mode || 'browser-voice';

    // Keep the legacy field for compatibility with existing data.
    existingCall.recordingPath = recordings[0] || null;

    // Force analysis to run again on the full, updated transcript.
    existingCall.summary = null;
    existingCall.customerNeeds = [];
    existingCall.objections = [];
    existingCall.nextSteps = [];
    existingCall.status = 'Follow-up Required';
    delete existingCall.analyzedAt;

    await writeCalls(calls);

    return res.json({
      id: existingCall.id,
      saved: true,
      continued: true,
      startedAt: existingCall.startedAt,
      endedAt: existingCall.endedAt,
      durationSeconds: existingCall.durationSeconds,
      recordingCount: recordings.length,
      hasRecording: recordings.length > 0
    });
  }

  // A brand-new conversation gets a new record.
  const id = crypto.randomUUID();
  const recordings = newRecordingPath ? [newRecordingPath] : [];

  const call = {
    id,
    startedAt: body.startedAt || new Date().toISOString(),
    endedAt: body.endedAt || new Date().toISOString(),
    durationSeconds: Math.max(0, Number(body.durationSeconds || 0)),
    language: body.language || 'en-US',
    consent: true,
    transcript: body.transcript,
    continuedFromCallId: null,
    summary: null,
    customerNeeds: [],
    objections: [],
    nextSteps: [],
    status: 'Follow-up Required',
    recordingPath: recordings[0] || null,
    recordingPaths: recordings,
    mode: body.mode || 'browser-voice'
  };

  calls.push(call);
  await writeCalls(calls);

  res.status(201).json({
    id,
    saved: true,
    continued: false,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationSeconds: call.durationSeconds,
    recordingCount: recordings.length,
    hasRecording: recordings.length > 0
  });
});
app.post('/api/calls/:id/analyze', async (req, res) => {
  const calls = await readCalls(); const call = calls.find(c => c.id === req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  const transcript = call.transcript.map(x => `${x.role === 'assistant' ? 'Agent' : 'Customer'}: ${x.text}`).join('\n');
  const prompt = `Analyze this SaaS sales conversation. Return ONLY JSON with keys summary (string, 2-4 sentences), customerNeeds (array of strings), objections (array of strings), nextSteps (array of strings), status (exactly one of ${statuses.join(', ')}). Base the outcome on customer statements, not the agent's optimism. Use Converted only if customer explicitly commits/purchases; Demo Requested if a demo is explicitly requested; Not Interested if explicitly declines; No Response if no meaningful customer response; Interested for positive evaluation without commitment; otherwise Follow-up Required. Never invent details.\nTranscript:\n${transcript || '(No transcript captured)'}`;
  try {
    const raw = await gemini(prompt, true);
    let result;
    if (raw) { const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim(); result = JSON.parse(cleaned); }
    else {
      const customerText = call.transcript.filter(x => x.role === 'user').map(x => x.text).join(' ');
      const low = customerText.toLowerCase();
      let status = customerText.trim() && !/^(?:hi|hello|hey|yes|no|okay|ok|hmm|uh huh)[.!\s]*$/i.test(customerText.trim()) ? 'Follow-up Required' : 'No Response';
      if (/demo|walkthrough|show me/.test(low)) status = 'Demo Requested';
      else if (/not interested|no thanks|don't contact|do not contact/.test(low)) status = 'Not Interested';
      else if (/buy|purchase|sign up|subscribe|we'll take it/.test(low)) status = 'Converted';
      else if (/interested|sounds good|useful|like that/.test(low)) status = 'Interested';
      result = { summary: customerText ? `The customer discussed: ${customerText.slice(0, 320)}. The agent introduced FlowPilot and should confirm the fit before making commitments.` : 'No meaningful customer response was captured.', customerNeeds: customerText ? ['Confirm the customer’s workflow and team size'] : [], objections: /price|expensive|budget/.test(low) ? ['Pricing or budget question'] : [], nextSteps: customerText ? ['Confirm requirements', 'Offer a relevant demo or follow-up'] : ['Retry contact if appropriate'], status };
    }
    if (!statuses.includes(result.status)) result.status = 'Follow-up Required';
    call.summary = String(result.summary || 'Summary unavailable'); call.customerNeeds = Array.isArray(result.customerNeeds) ? result.customerNeeds : []; call.objections = Array.isArray(result.objections) ? result.objections : []; call.nextSteps = Array.isArray(result.nextSteps) ? result.nextSteps : []; call.status = result.status; call.analyzedAt = new Date().toISOString();
    await writeCalls(calls); res.json({ summary: call.summary, customerNeeds: call.customerNeeds, objections: call.objections, nextSteps: call.nextSteps, status: call.status, mode: process.env.GEMINI_API_KEY ? 'gemini' : 'demo' });
  } catch (err) {
    const customerText = call.transcript.filter(x => x.role === 'user').map(x => x.text).join(' ');
    const low = customerText.toLowerCase();
    let fallbackStatus = customerText.trim() && !/^(?:hi|hello|hey|yes|no|okay|ok|hmm|uh huh)[.!\s]*$/i.test(customerText.trim()) ? 'Follow-up Required' : 'No Response';
    if (/demo|walkthrough|show me/.test(low)) fallbackStatus = 'Demo Requested';
    else if (/not interested|no thanks|don't contact|do not contact/.test(low)) fallbackStatus = 'Not Interested';
    else if (/buy|purchase|sign up|subscribe|we'll take it/.test(low)) fallbackStatus = 'Converted';
    else if (/interested|sounds good|useful|like that/.test(low)) fallbackStatus = 'Interested';
    call.summary = customerText ? `The customer discussed: ${customerText.slice(0, 320)}. Confirm the fit and any unresolved questions before recommending a purchase.` : 'No meaningful customer response was captured.';
    call.customerNeeds = customerText ? ['Confirm the customer’s workflow and team size'] : [];
    call.objections = /price|expensive|budget/.test(low) ? ['Pricing or budget question'] : [];
    call.nextSteps = customerText ? ['Confirm requirements', 'Offer a relevant demo or follow-up'] : ['Retry contact if appropriate'];
    call.status = fallbackStatus; call.analyzedAt = new Date().toISOString();
    await writeCalls(calls);
    res.json({ summary: call.summary, customerNeeds: call.customerNeeds, objections: call.objections, nextSteps: call.nextSteps, status: call.status, mode: 'fallback', warning: `AI analysis unavailable: ${err.message}` });
  }
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error' }); });
app.listen(PORT, () => console.log(`Voice Sales Agent API listening on http://localhost:${PORT}`));
