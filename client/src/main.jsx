import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AudioLines, Bot, Check, ChevronDown, CircleHelp, Clock3, Headphones, History, LayoutDashboard, MessageSquareText, Mic, MicOff, Phone, PhoneOff, Play, Plus, Send, Settings2, ShieldCheck, Sparkles, UserRound, Volume2, X, Trash2, RotateCcw, Archive } from 'lucide-react';
import './styles.css';

const API = (import.meta.env.VITE_API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const STATUS_COLORS = { Converted: 'green', Interested: 'blue', 'Follow-up Required': 'amber', 'Not Interested': 'gray', 'Demo Requested': 'purple', 'No Response': 'gray' };
const fmtDuration = n => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
const fmtDate = s => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function App() {
  const [view, setView] = useState('live');
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [resumeCall, setResumeCall] = useState(null);
  const resumeCallRef = useRef(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [apiState, setApiState] = useState('checking');
  const [status, setStatus] = useState('Ready to start');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [consent, setConsent] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const draftManuallyEditedRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [recordingState, setRecordingState] = useState('idle');
  const [lastError, setLastError] = useState('');
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashedCalls, setTrashedCalls] = useState([]);
  const recognitionRef = useRef(null);
  const listeningRequestedRef = useRef(false);
  const finalizeRecognitionRef = useRef(false);
  const recognizedTextRef = useRef('');
  const recognitionDisplayRef = useRef('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const transcriptRef = useRef([]);
  const startedAtRef = useRef(null);
  const bottomRef = useRef(null);
  const timerRef = useRef(null);

  const refreshCalls = useCallback(async () => {
    try { const r = await fetch(`${API}/api/calls`); if (!r.ok) throw new Error(); setCalls(await r.json()); setApiState('online'); }
    catch { setApiState('offline'); }
  }, []);
  const refreshTrash = useCallback(async () => { try { const r = await fetch(`${API}/api/trash`); if (r.ok) setTrashedCalls(await r.json()); } catch {} }, []);
  useEffect(() => { fetch(`${API}/api/health`).then(r => r.json()).then(d => { setAiConfigured(d.aiConfigured); setApiState('online'); }).catch(() => setApiState('offline')); refreshCalls(); refreshTrash(); }, [refreshCalls, refreshTrash]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript, isThinking]);
  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(''), 3600); return () => clearTimeout(id); } }, [toast]);
  useEffect(() => () => { activeRef.current = false; try { recognitionRef.current?.stop(); recorderRef.current?.stop(); } catch {} streamRef.current?.getTracks().forEach(t => t.stop()); clearInterval(timerRef.current); }, []);

  const addMessage = (role, text) => {
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text, at: new Date().toISOString() };
    transcriptRef.current = [...transcriptRef.current, item]; setTranscript(transcriptRef.current); return item;
  };
  const speak = text => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language; utterance.rate = 1.02; utterance.pitch = 1.02;
    utterance.onstart = () => { if (activeRef.current) setStatus('Speaking'); };
    utterance.onend = () => { if (activeRef.current) setStatus('Call active · press the mic to speak'); };
    window.speechSynthesis.speak(utterance);
  };
  const requestReply = async text => {
    processingRef.current = true;
    setIsThinking(true); setStatus('Thinking');
    try {
      // The latest customer message is sent separately below; do not duplicate it in history.
      const history = transcriptRef.current.slice(0, -1).map(x => ({ role: x.role, text: x.text }));
      const response = await fetch(`${API}/api/assistant/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history, language }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.fallbackReply || data.error || 'Could not generate a reply');
      addMessage('assistant', data.reply); if (data.mode === 'demo') setAiConfigured(false); if (data.warning) setLastError(data.warning); speak(data.reply);
    } catch (e) {
      const fallback = e.message || 'I had trouble reaching the AI service. Please try again.'; addMessage('assistant', fallback); speak(fallback); setLastError('AI response issue: ' + e.message);
    } finally { processingRef.current = false; setIsThinking(false); }
  };
  const handleCustomerText = text => {
    const clean = text.trim(); if (!clean || !activeRef.current) return;
    if (transcriptRef.current.at(-1)?.role === 'user' && transcriptRef.current.at(-1)?.text === clean) return;
    listeningRequestedRef.current = false; finalizeRecognitionRef.current = false; recognizedTextRef.current = ''; recognitionDisplayRef.current = ''; draftManuallyEditedRef.current = false;
    addMessage('user', clean); draftRef.current = ''; setDraft(''); setIsListening(false); processingRef.current = true; try { recognitionRef.current?.stop(); } catch {} requestReply(clean);
  };
  const setupRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setStatus('Voice recognition unavailable'); setLastError('Speech recognition is not supported in this browser. Try Chrome or Edge, or use the text input below.'); return null; }
    const recognition = new SpeechRecognition();
    recognition.lang = language;
    // Keep listening through short pauses. The user ends their turn by clicking the mic again.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const spoken = result?.[0]?.transcript?.trim();
        if (!spoken) continue;
        if (result.isFinal) {
          recognizedTextRef.current = `${recognizedTextRef.current} ${spoken}`.trim();
        } else {
          interim += `${spoken} `;
        }
      }
      recognitionDisplayRef.current = `${recognizedTextRef.current} ${interim}`.trim();
      // Once the user edits the transcript, do not overwrite their correction with
      // later interim/final recognition events. The edited composer is sent on stop.
      if (!draftManuallyEditedRef.current) {
        draftRef.current = recognitionDisplayRef.current;
        setDraft(recognitionDisplayRef.current);
      }
    };
    recognition.onerror = event => {
      if (event.error === 'no-speech') {
        // A quiet pause should not submit a partial sentence. End this listening attempt cleanly.
        listeningRequestedRef.current = false;
        finalizeRecognitionRef.current = false;
        setIsListening(false);
        setStatus('No speech detected · press the mic to try again');
      } else if (event.error !== 'aborted' && activeRef.current) {
        listeningRequestedRef.current = false;
        finalizeRecognitionRef.current = false;
        setIsListening(false);
        setLastError(`Microphone recognition: ${event.error}. You can continue with the text box.`);
        setStatus('Call active · text input available');
      }
    };
    recognition.onend = () => {
      if (!activeRef.current) return;
      if (finalizeRecognitionRef.current) {
        finalizeRecognitionRef.current = false;
        listeningRequestedRef.current = false;
        // Send the current composer text, not the raw recognizer output.
        // This preserves any spelling corrections the user made before stopping recognition.
        const messageToSend = (draftRef.current || recognizedTextRef.current || recognitionDisplayRef.current).trim();
        setIsListening(false);
        if (messageToSend) {
          setStatus('Sending your edited message…');
          handleCustomerText(messageToSend);
        } else {
          draftRef.current = '';
          setDraft('');
          setStatus('No speech detected · press the mic to try again');
        }
        return;
      }
      if (listeningRequestedRef.current && !processingRef.current) {
        // Chrome/Edge may close a recognition session after a pause. Resume without sending the turn.
        window.setTimeout(() => {
          if (!activeRef.current || !listeningRequestedRef.current || processingRef.current) return;
          try { recognition.start(); } catch {}
        }, 250);
        return;
      }
      setIsListening(false);
      if (!processingRef.current && !window.speechSynthesis?.speaking) setStatus('Call active · press the mic to speak');
    };
    recognitionRef.current = recognition; return recognition;
  };
  const startCall = async () => {
    setLastError('');
    const previousCall = resumeCallRef.current;
    if (!consent) { setLastError('Please give recording consent before starting.'); return; }
    if (apiState !== 'online') { setLastError('The backend is not reachable. Start the server first.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType: mime }); recorder.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); }; recorderRef.current = recorder; recorder.start(1000); setRecordingState('recording');
      const now = new Date().toISOString(); startedAtRef.current = now; setStartedAt(now); setDuration(0);
      transcriptRef.current = previousCall ? (previousCall.transcript || []).map((m, i) => ({ id: m.id || `resume-${previousCall.id}-${i}`, role: m.role, text: m.text, at: m.at || previousCall.startedAt })) : [];
      setTranscript(transcriptRef.current); setIsCallActive(true); activeRef.current = true; setIsListening(false); setStatus(previousCall ? 'Continuing previous conversation' : 'Call active · press the mic to speak');
      setResumeCall(null); resumeCallRef.current = previousCall;
      timerRef.current = setInterval(() => { if (startedAtRef.current) setDuration(Math.floor((Date.now() - new Date(startedAtRef.current).getTime()) / 1000)); }, 1000);
      const greeting = 'Hi there! I’m Aira from FlowPilot. Thanks for taking a moment with me. I’d love to learn how your team manages repetitive workflows and see whether we can help. What does your team spend too much time on today?';
      if (!previousCall) addMessage('assistant', greeting);
      const recognition = setupRecognition();
      if ('speechSynthesis' in window && !previousCall) {
        const u = new SpeechSynthesisUtterance(greeting); u.lang = language;
        u.onend = () => { if (activeRef.current && recognition) setStatus('Call active · press the mic to speak'); };
        window.speechSynthesis.speak(u);
      }
    } catch (e) { setLastError(e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser settings and retry.' : `Could not start the call: ${e.message}`); setStatus('Ready to start'); }
  };
  const endCall = async () => {
    if (!activeRef.current) return;
    activeRef.current = false; listeningRequestedRef.current = false; finalizeRecognitionRef.current = false; setIsCallActive(false); setIsThinking(false); setIsListening(false); setStatus('Saving call'); clearInterval(timerRef.current);
    try { recognitionRef.current?.stop(); } catch {} window.speechSynthesis?.cancel();
    const rec = recorderRef.current;
    const blob = await new Promise(resolve => {
      if (rec && rec.state !== 'inactive') { rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })); try { rec.stop(); } catch { resolve(new Blob(chunksRef.current, { type: 'audio/webm' })); } }
      else resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: 'audio/webm' }) : null);
    });
    streamRef.current?.getTracks().forEach(t => t.stop()); setRecordingState('saved');
    const reader = blob ? new FileReader() : null;
    const recordingBase64 = reader && blob.size > 0 ? await new Promise(resolve => { reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); }) : null;
    const endedAt = new Date().toISOString();
    try {
      const continuedFromCallId = resumeCallRef.current?.id || null;
      const saved = await fetch(`${API}/api/calls`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent, startedAt: startedAtRef.current, endedAt, durationSeconds: duration, language, transcript: transcriptRef.current.map(({ role, text, at }) => ({ role, text, at })), recordingBase64, continuedFromCallId, mode: 'browser-voice' }) });
      const callData = await saved.json(); if (!saved.ok) throw new Error(callData.error || 'Could not save call');
      const analysis = await fetch(`${API}/api/calls/${callData.id}/analyze`, { method: 'POST' }); const analysisData = await analysis.json();
      if (!analysis.ok) throw new Error(analysisData.error || 'Call saved but analysis failed');
      setSelectedCall({
  id: callData.id,
  ...analysisData,
  transcript: transcriptRef.current,
  startedAt: callData.startedAt || startedAtRef.current,
  endedAt: callData.endedAt || endedAt,
  durationSeconds: callData.durationSeconds ?? duration,
  recordingCount: callData.recordingCount ?? (recordingBase64 ? 1 : 0),
  hasRecording: Boolean(callData.hasRecording)
});
      setToast(
  resumeCallRef.current
    ? 'Conversation updated successfully.'
    : 'Call saved and analyzed successfully.'
); setStatus('Call complete'); resumeCallRef.current = null; await refreshCalls(); setView('history');
    } catch (e) { setLastError(`Call ended, but saving/analysis failed: ${e.message}`); setStatus('Save failed'); }
  };
  const sendText = e => { e.preventDefault(); if (!isCallActive || !draftRef.current.trim() || isThinking) return; window.speechSynthesis?.cancel(); listeningRequestedRef.current = false; finalizeRecognitionRef.current = false; setIsListening(false); try { recognitionRef.current?.stop(); } catch {} handleCustomerText(draftRef.current); };
  const toggleVoiceInput = () => {
    if (!isCallActive || isThinking) return;
    setLastError('');
    const recognition = recognitionRef.current;
    if (!recognition) { setLastError('Voice recognition is not supported in this browser. Try Chrome or Edge, or type your response instead.'); return; }
    if (isListening) {
      // Stop listening only when the customer confirms they have finished their whole turn.
      listeningRequestedRef.current = false;
      finalizeRecognitionRef.current = true;
      setIsListening(false);
      setStatus('Finishing your message…');
      try { recognition.stop(); } catch { finalizeRecognitionRef.current = false; const messageToSend = (draftRef.current || recognizedTextRef.current || recognitionDisplayRef.current).trim(); if (messageToSend) handleCustomerText(messageToSend); }
      return;
    }
    try {
      window.speechSynthesis?.cancel();
      recognizedTextRef.current = ''; recognitionDisplayRef.current = ''; finalizeRecognitionRef.current = false;
      draftManuallyEditedRef.current = false; draftRef.current = ''; setDraft(''); listeningRequestedRef.current = true; recognition.lang = language; recognition.start();
      setIsListening(true); setStatus('Listening · click the mic when you finish speaking');
    }
    catch (e) { setIsListening(false); setLastError(`Could not start voice recognition: ${e.message}. Try clicking the mic again or use the text box.`); }
  };
  const moveCallToTrash = async call => { try { const r = await fetch(`${API}/api/calls/${call.id}`, { method: 'DELETE' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not move call to recycle bin'); setSelectedCall(null); await refreshCalls(); await refreshTrash(); setToast('Call moved to Recycle bin.'); } catch (e) { setToast(e.message); } };
  const restoreCall = async call => { try { const r = await fetch(`${API}/api/calls/${call.id}/restore`, { method: 'POST' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not restore call'); await refreshCalls(); await refreshTrash(); setToast('Call restored to history.'); } catch (e) { setToast(e.message); } };
  const permanentlyDeleteCall = async call => { if (!window.confirm('Permanently delete this call and its recording? This cannot be undone.')) return; try { const r = await fetch(`${API}/api/calls/${call.id}/permanent`, { method: 'DELETE' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not permanently delete call'); await refreshTrash(); await refreshCalls(); setToast('Call and recording permanently deleted.'); } catch (e) { setToast(e.message); } };
  const emptyTrash = async () => { if (!trashedCalls.length || !window.confirm(`Permanently delete ${trashedCalls.length} trashed call(s) and their recordings? This cannot be undone.`)) return; try { const r = await fetch(`${API}/api/trash`, { method: 'DELETE' }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not empty recycle bin'); await refreshTrash(); await refreshCalls(); setToast(`Recycle bin emptied · ${d.count} call(s) deleted.`); } catch (e) { setToast(e.message); } };
  const openCall = async call => { try { const r = await fetch(`${API}/api/calls/${call.id}`); const d = await r.json(); if (!r.ok) throw new Error(d.error); setSelectedCall({ ...d, hasRecording: d.hasRecording }); setView('history'); } catch (e) { setToast(e.message); } };
  

const startNewCall = () => {
  if (activeRef.current) {
    setToast('End the current call before starting a new one.');
    return;
  }

  // Prevent startCall() from restoring an old conversation.
  resumeCallRef.current = null;
  setResumeCall(null);

  // Clear transcript state and its source of truth.
  transcriptRef.current = [];
  setTranscript([]);

  // Clear all previous call details.
  draftRef.current = '';
  setDraft('');
  setSelectedCall(null);
  setDuration(0);
  setStartedAt(null);
  startedAtRef.current = null;
  setLastError('');
  setIsThinking(false);
  setIsListening(false);
  setRecordingState('idle');
  setStatus('Ready to start');

  listeningRequestedRef.current = false;
  finalizeRecognitionRef.current = false;
  recognizedTextRef.current = '';
  recognitionDisplayRef.current = '';
  draftManuallyEditedRef.current = false;
  processingRef.current = false;

  clearInterval(timerRef.current);
  window.speechSynthesis?.cancel();

  setView('live');
};


  const cancelContinuation = () => { resumeCallRef.current = null; setResumeCall(null); transcriptRef.current = []; setTranscript([]); setToast('Continuation cancelled. Start a new call whenever you are ready.'); };
  const continueConversation = call => {
    if (!call?.transcript?.length) { setToast('This call has no transcript to continue.'); return; }
    resumeCallRef.current = call; setResumeCall(call); transcriptRef.current = (call.transcript || []).map((m, i) => ({ id: m.id || `resume-${call.id}-${i}`, role: m.role, text: m.text, at: m.at || call.startedAt }));
    setTranscript(transcriptRef.current); setDraft(''); draftRef.current = ''; setLastError(''); setSelectedCall(null); setView('live');
    setToast('Previous conversation loaded. Give consent if needed, then choose Continue conversation.');
  };
  const stats = { total: calls.length, interested: calls.filter(c => ['Interested','Demo Requested'].includes(c.status)).length, converted: calls.filter(c => c.status === 'Converted').length };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={23}/></div><div><strong>voiceflow<span>.</span></strong><small>SALES INTELLIGENCE</small></div></div>
      <div className="workspace-label">WORKSPACE</div>

<button
  className={`nav-item ${view === 'live' ? 'active' : ''}`}
  onClick={startNewCall}
>
  <LayoutDashboard size={18}/> Live sales agent
</button>
      <button className={`nav-item ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}><History size={18}/> Call history <span className="nav-count">{calls.length}</span></button>
      <button className="nav-item" onClick={() => { setTrashOpen(true); refreshTrash(); }}><Trash2 size={18}/> Recycle bin <span className="nav-count">{trashedCalls.length}</span></button>
      <div className="side-divider"/>
      <div className="workspace-label">YOUR AI AGENT</div>
      <div className="agent-mini"><div className="avatar agent-avatar"><Bot size={19}/></div><div className="agent-mini-copy"><strong>Aira</strong><span>FlowPilot · SaaS Sales</span></div><span className="online-dot"/></div>
      <div className="sidebar-spacer"/>
      <div className="sidebar-note"><div className="note-icon"><ShieldCheck size={17}/></div><div><strong>Consent-first calling</strong><p>Recordings are saved only after you confirm consent.</p></div></div>
      <div className="profile-wrap"><button className="profile" type="button" onClick={() => setWorkspaceMenuOpen(v => !v)} aria-expanded={workspaceMenuOpen}><div className="profile-avatar">AD</div><div><strong>Sales workspace</strong><span>Demo environment</span></div><ChevronDown size={15}/></button>{workspaceMenuOpen && <div className="workspace-menu"><strong>Sales workspace</strong><span>Demo environment · single workspace</span><button type="button" onClick={() => { setWorkspaceMenuOpen(false); setSettingsOpen(true); }}>Workspace settings</button><button type="button" onClick={() => { setWorkspaceMenuOpen(false); setTrashOpen(true); refreshTrash(); }}><Trash2 size={14}/> Recycle bin ({trashedCalls.length})</button></div>}</div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><button type="button" className="breadcrumb-link" onClick={startNewCall}>Workspace</button> <span>/</span> <b>{view === 'live' ? 'Live sales agent' : 'Call history'}</b></div><div className="top-actions"><div className={`system-pill ${apiState}`}><span className="tiny-dot"/>{apiState === 'online' ? 'System operational' : apiState === 'checking' ? 'Connecting…' : 'Backend offline'}</div><button className="icon-button" type="button" title="Settings" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings2 size={18}/></button></div></header>
      {view === 'live' ? <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> AI-POWERED SALES</div><h1>Live sales agent</h1><p>Have a real conversation. Let Aira qualify the lead, handle objections, and find the next step.</p></div><div className="heading-right"><div className="agent-status"><span className={`pulse ${isCallActive ? 'live' : ''}`}/>{isCallActive ? 'Agent active' : 'Agent ready'}</div></div></div>
        <div className="stats-grid"><Stat icon={<Phone size={17}/>} label="Total conversations" value={stats.total} helper="Saved calls"/><Stat icon={<Sparkles size={17}/>} label="Interested leads" value={stats.interested} helper="Interested or demo requested"/><Stat icon={<Check size={17}/>} label="Converted" value={stats.converted} helper="Confirmed commitments"/><Stat icon={<Activity size={17}/>} label="AI status" value={aiConfigured ? 'Configured' : 'Demo mode'} helper={aiConfigured ? 'Gemini API key present' : 'Add Gemini API key'} compact/></div>
        <div className="live-grid">
          <section className="panel call-panel">
            <div className="panel-head"><div><div className="panel-title"><span className="live-indicator"/>Live conversation</div><p>Browser voice session · FlowPilot SaaS</p></div><div className={`call-state ${isCallActive ? 'is-live' : ''}`}>{isCallActive ? '● LIVE' : '○ STANDBY'}</div></div>
            <div className="call-identity"><div className="avatar big-agent"><Bot size={26}/><span className="avatar-sparkle"><Sparkles size={12}/></span></div><div className="identity-copy"><h2>Aira <span className="verified"><Check size={10}/></span></h2><p>AI Sales Representative <span>·</span> FlowPilot</p><div className="identity-tags"><span><span className="tiny-dot green-dot"/> Voice enabled</span><span><ShieldCheck size={12}/> Consent required</span></div></div><div className="duration-box"><span>CALL DURATION</span><strong>{fmtDuration(duration)}</strong></div></div>
            <div className="wave-area"><div className={`wave-orb ${isCallActive ? 'active' : ''}`}><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><div className="orb-core">{isCallActive ? <AudioLines size={30}/> : <Mic size={29}/>}</div></div><div className="wave-label">{isThinking ? 'Aira is thinking…' : isListening ? 'Listening · speak now' : isCallActive ? status : 'Ready when you are'}</div><div className="wave-sub">{isCallActive ? (isListening ? 'Keep talking through short pauses · click the mic when your sentence is complete' : 'Press the microphone button before each response') : 'Start a call to begin a live conversation'}</div><div className={`wave-bars ${isCallActive ? 'moving' : ''}`}>{Array.from({length: 37}, (_,i) => <span key={i} style={{'--i': i}}/>)}</div></div>
            <div className="consent-row"><label className={`consent-check ${isCallActive ? 'disabled' : ''}`}><input type="checkbox" checked={consent} disabled={isCallActive} onChange={e => setConsent(e.target.checked)}/><span className="fake-check"><Check size={12}/></span><span>I confirm that the customer has consented to this call being recorded.</span></label><div className="language-select"><span>Language</span><select value={language} disabled={isCallActive} onChange={e => setLanguage(e.target.value)}><option value="en-US">English (US)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="te-IN">Telugu</option></select></div></div>
            <div className="call-controls">{!isCallActive ? <><button className="start-button" onClick={startCall}>{resumeCall ? <RotateCcw size={17}/> : <Phone size={17} fill="currentColor"/>} {resumeCall ? 'Continue conversation' : 'Start call'}</button>{resumeCall && <button className="outline-button" type="button" onClick={cancelContinuation}>Cancel continuation</button>}</> : <button className="end-button" onClick={endCall}><PhoneOff size={17}/> End call</button>}<div className="control-hint"><span className={`tiny-dot ${isCallActive ? 'green-dot' : ''}`}/>{isCallActive ? (isListening ? 'Voice recognition active' : 'Press the mic to speak') : 'Microphone access required'}</div></div>
            {lastError && <div className="error-banner"><CircleHelp size={16}/><span>{lastError}</span><button onClick={() => setLastError('')}><X size={14}/></button></div>}
            <div className="call-footnote"><ShieldCheck size={14}/> Recording is stored when the call ends. You can play it back from Call History.</div>
          </section>
          <section className="panel transcript-panel"><div className="panel-head transcript-head"><div><div className="panel-title"><MessageSquareText size={17}/> Live transcript</div><p>Conversation appears here in real time</p></div><span className="message-count">{transcript.length} messages</span></div>
            <div className="transcript-scroll">{transcript.length === 0 ? <div className="empty-transcript"><div className="empty-icon"><MessageSquareText size={24}/></div><strong>Your conversation starts here</strong><p>Start a call to see customer speech and Aira’s responses appear as text.</p><div className="example-prompt"><span>TRY ASKING</span>“How can FlowPilot help my team?”</div></div> : transcript.map(msg => <div className={`message ${msg.role === 'assistant' ? 'agent-message' : 'customer-message'}`} key={msg.id}><div className={`message-avatar ${msg.role === 'assistant' ? 'mini-ai' : 'mini-user'}`}>{msg.role === 'assistant' ? <Bot size={15}/> : <UserRound size={15}/>}</div><div className="message-body"><div className="message-meta"><strong>{msg.role === 'assistant' ? 'Aira' : 'Customer'}</strong><span>{new Date(msg.at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span></div><div className="message-bubble">{msg.text}</div></div></div>)}{isThinking && <div className="thinking-row"><div className="message-avatar mini-ai"><Bot size={15}/></div><div className="thinking-bubble"><span/><span/><span/></div><small>Aira is thinking</small></div>}<div ref={bottomRef}/></div>
            <form className={`message-composer ${!isCallActive ? 'locked' : ''}`} onSubmit={sendText}><div className="composer-top"><span>{isCallActive ? <><span className="tiny-dot green-dot"/> Call active</> : 'Start a call to message the agent'}</span><span className="composer-shortcut"><Mic size={12}/> Press mic before speaking</span></div><div className="composer-input"><input value={draft} disabled={!isCallActive || isThinking} onChange={e => { draftManuallyEditedRef.current = true; draftRef.current = e.target.value; setDraft(e.target.value); }} placeholder={isCallActive ? 'Type a customer response…' : 'Message input is inactive'}/><button type="button" className={`voice-input-button ${isListening ? 'listening' : ''}`} onClick={toggleVoiceInput} disabled={!isCallActive || isThinking} aria-label={isListening ? 'Stop voice recognition' : 'Speak to Aira'} title={isListening ? 'Stop listening' : 'Click to speak; click again when finished'}><Mic size={16}/></button><button type="submit" disabled={!isCallActive || isThinking || isListening || !draft.trim()} aria-label="Send message"><Send size={16}/></button></div></form>
          </section>
        </div>
        <div className="bottom-tip"><div className="tip-icon"><Sparkles size={16}/></div><div><strong>Make the most of your sales call</strong><span>Ask about team size, current workflows, budget, integrations, or request a demo to test lead qualification.</span></div><button onClick={() => { draftRef.current = 'Can you tell me about your pricing and trial?'; setDraft('Can you tell me about your pricing and trial?'); if (!isCallActive) setToast('Start a call, then send this suggested question from the transcript box.'); }}><Plus size={14}/> Suggest a question</button></div>
      </div> : <div className="page-content history-page">
        
<div className="page-heading">
  <div>
    <div className="eyebrow">
      <History size={14} /> SALES ACTIVITY
    </div>
    <h1>Call history</h1>
    <p>
      Review recordings, transcripts, AI summaries, and the next best action for every conversation.
    </p>
  </div>
  <button className="outline-button" onClick={startNewCall}>
    <Plus size={16} /> New call
  </button>
</div>

        <div className="history-summary"><div><span>Total calls</span><strong>{calls.length}</strong></div><div><span>Interested leads</span><strong>{stats.interested}</strong></div><div><span>Converted</span><strong>{stats.converted}</strong></div><div className="summary-last"><span>Storage</span><strong><span className="tiny-dot green-dot"/> Persistent demo storage</strong></div></div>
        <div className="history-layout"><section className="panel history-list-panel"><div className="panel-head"><div><div className="panel-title">All conversations</div><p>Newest calls first</p></div><span className="message-count">{calls.length} total</span></div>{calls.length === 0 ? <div className="history-empty"><div className="empty-icon"><Headphones size={24}/></div><strong>No calls yet</strong><p>Your completed calls and AI analysis will appear here.</p><button className="start-button small" onClick={() => setView('live')}><Phone size={15}/> Start first call</button></div> : <div className="history-list">{calls.map(call => <button key={call.id} className={`history-row ${selectedCall?.id === call.id ? 'selected' : ''}`} onClick={() => openCall(call)}><div className="history-row-icon"><Headphones size={18}/></div><div className="history-row-copy"><strong>FlowPilot discovery call</strong><span>{fmtDate(call.startedAt)} · {fmtDuration(call.durationSeconds || 0)}</span><small>{call.transcript?.filter(m => m.role === 'user').length || 0} customer responses</small></div><div className={`status-badge ${STATUS_COLORS[call.status] || 'gray'}`}>{call.status}</div></button>)}</div>}</section>
          <section className="panel call-detail-panel">{selectedCall ? <><div className="panel-head"><div><div className="panel-title">Call intelligence</div><p>{fmtDate(selectedCall.startedAt)}</p></div><div className="detail-head-actions"><div className={`status-badge ${STATUS_COLORS[selectedCall.status] || 'gray'}`}>{selectedCall.status}</div><button className="outline-button" type="button" onClick={() => continueConversation(selectedCall)}><RotateCcw size={14}/> Continue conversation</button><button className="danger-outline-button" type="button" onClick={() => moveCallToTrash(selectedCall)}><Trash2 size={14}/> Move to recycle bin</button></div></div><div className="detail-content"><div className="summary-block"><div className="detail-label"><Sparkles size={14}/> AI SUMMARY</div><p>{selectedCall.summary || 'Summary is not available.'}</p></div>
{(selectedCall.recordingCount || (selectedCall.hasRecording ? 1 : 0)) > 0 && (
  <div className="recording-player">
    <div className="recording-icon">
      <Volume2 size={18} />
    </div>

    <div className="recording-copy">
      <strong>Conversation recordings</strong>
      <span>
        {(selectedCall.recordingCount || 1) === 1
          ? '1 recorded session'
          : `${selectedCall.recordingCount} recorded sessions`}
      </span>

      {Array.from(
        { length: selectedCall.recordingCount || 1 },
        (_, index) => (
          <div key={`${selectedCall.id}-recording-${index}`}>
            <p>Session {index + 1}</p>
            <audio
              controls
              preload="none"
              src={`${API}/api/calls/${selectedCall.id}/recording?session=${index}`}
            />
          </div>
        )
      )}
    </div>
  </div>
)}

            <DetailList title="Customer needs" items={selectedCall.customerNeeds}/><DetailList title="Objections & concerns" items={selectedCall.objections}/><DetailList title="Recommended next steps" items={selectedCall.nextSteps}/>
            <div className="detail-label transcript-label"><MessageSquareText size={14}/> FULL TRANSCRIPT</div><div className="detail-transcript">{(selectedCall.transcript || []).map((m,i) => <div key={m.id || i} className="detail-line"><strong>{m.role === 'assistant' ? 'Aira' : 'Customer'}</strong><p>{m.text}</p></div>)}</div></div></> : <div className="history-empty detail-placeholder"><div className="empty-icon"><Activity size={24}/></div><strong>Select a conversation</strong><p>Choose a call on the left to inspect the AI summary, outcome, recording, and full transcript.</p></div>}</section></div>
      </div>}
      <footer className="footer"><span>© 2026 Voiceflow Sales Intelligence <i>·</i> Internship assignment prototype</span><span><span className="tiny-dot green-dot"/> Privacy-first demo <i>·</i> v1.0.0</span></footer>
    </main>
    {settingsOpen && <div className="settings-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-dialog-head"><div><span className="eyebrow"><Settings2 size={13}/> WORKSPACE CONTROLS</span><h2 id="settings-title">Settings</h2><p>Connection and voice-session configuration.</p></div><button className="icon-button" type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18}/></button></div>
        <div className="settings-status-row"><span><span className={`tiny-dot ${apiState === 'online' ? 'green-dot' : ''}`}/> Backend connection</span><strong>{apiState === 'online' ? 'Connected' : apiState === 'checking' ? 'Checking…' : 'Offline'}</strong></div>
        <div className="settings-status-row"><span><Activity size={15}/> AI provider</span><strong>{aiConfigured ? 'Gemini configured' : 'Demo mode'}</strong></div>
        <div className="settings-field"><label htmlFor="settings-language">Speech recognition and voice language</label><select id="settings-language" value={language} disabled={isCallActive} onChange={e => setLanguage(e.target.value)}><option value="en-US">English (US)</option><option value="en-IN">English (India)</option><option value="hi-IN">Hindi</option><option value="te-IN">Telugu</option></select><small>{isCallActive ? 'End the current call before changing language.' : 'This setting applies to browser speech recognition and Aira’s spoken replies.'}</small></div>
        <div className="settings-dialog-actions"><button className="outline-button" type="button" onClick={async () => { setApiState('checking'); try { const r = await fetch(`${API}/api/health`); const d = await r.json(); if (!r.ok) throw new Error(); setAiConfigured(Boolean(d.aiConfigured)); setApiState('online'); setToast(`Connection checked · ${d.aiConfigured ? 'Gemini configured' : 'Demo mode'}`); } catch { setApiState('offline'); setToast('Could not reach backend at ' + API); } }}> <Activity size={15}/> Test connection</button><button className="start-button small" type="button" onClick={() => setSettingsOpen(false)}>Done</button></div>
      </section>
    </div>}
    {trashOpen && <div className="settings-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setTrashOpen(false); }}><section className="settings-dialog trash-dialog" role="dialog" aria-modal="true" aria-labelledby="trash-title"><div className="settings-dialog-head"><div><span className="eyebrow"><Trash2 size={13}/> DELETED CALLS</span><h2 id="trash-title">Recycle bin</h2><p>Restore calls to history or permanently delete records and audio.</p></div><button className="icon-button" type="button" aria-label="Close recycle bin" onClick={() => setTrashOpen(false)}><X size={18}/></button></div><div className="trash-toolbar"><span>{trashedCalls.length} deleted call(s)</span><button className="danger-outline-button" type="button" disabled={!trashedCalls.length} onClick={emptyTrash}><Archive size={14}/> Empty recycle bin</button></div>{trashedCalls.length ? <div className="trash-list">{trashedCalls.map(call => <div className="trash-row" key={call.id}><div><strong>FlowPilot discovery call</strong><span>{fmtDate(call.startedAt)} · {fmtDuration(call.durationSeconds || 0)}</span><small>{call.hasRecording ? 'Recording included' : 'No recording saved'}</small></div><div className="trash-actions"><button type="button" className="outline-button" onClick={() => restoreCall(call)}><RotateCcw size={14}/> Restore</button><button type="button" className="danger-icon-button" title="Delete permanently" aria-label="Delete permanently" onClick={() => permanentlyDeleteCall(call)}><Trash2 size={15}/></button></div></div>)}</div> : <div className="history-empty"><div className="empty-icon"><Trash2 size={22}/></div><strong>Recycle bin is empty</strong><p>Calls moved here can be restored until permanently deleted.</p></div>}</section></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}
function Stat({icon,label,value,helper,compact}) { return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><div className={`stat-value ${compact ? 'compact' : ''}`}>{value}</div><div className="stat-helper">{helper}</div></div>; }
function DetailList({title,items=[]}) { return <div className="detail-list-block"><div className="detail-label">{title.toUpperCase()}</div>{items.length ? <ul>{items.map((x,i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">None identified</p>}</div>; }

createRoot(document.getElementById('root')).render(<App/>);
