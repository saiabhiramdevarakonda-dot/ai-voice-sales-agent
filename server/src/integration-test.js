// Isolated integration test for the Voice Sales Agent API.
// Runs against a temporary JSON store and never touches the developer's real call history.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await mkdtemp(path.join(os.tmpdir(), 'voice-sales-agent-test-'));
const port = 3317 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '', VOICE_SALES_DATA_DIR: tempDir, CLIENT_ORIGIN: '*' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk.toString(); });
child.stderr.on('data', chunk => { logs += chunk.toString(); });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited early: ${logs}`);
    try { const r = await fetch(`${base}/api/health`); if (r.ok) return await r.json(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not start: ${logs}`);
}
async function json(route, options = {}) {
  const r = await fetch(`${base}${route}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  let data = {};
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.message}`); }
};
try {
  const health = await waitForServer();
  await check('health endpoint reports service and demo mode', async () => {
    assert(health.ok === true, 'health.ok should be true');
    assert(health.aiConfigured === false, 'test server should run without an API key');
  });
  await check('call history starts empty', async () => {
    const r = await json('/api/calls');
    assert(r.status === 200 && Array.isArray(r.data) && r.data.length === 0, 'expected empty call list');
  });
  let id;
  await check('recording consent is required', async () => {
    const r = await json('/api/calls', { method: 'POST', body: JSON.stringify({ consent: false, transcript: [] }) });
    assert(r.status === 400, `expected 400, got ${r.status}`);
  });
  await check('save call and analyze summary/status', async () => {
    const r = await json('/api/calls', { method: 'POST', body: JSON.stringify({
      consent: true, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      durationSeconds: 12, language: 'en-US',
      transcript: [
        { role: 'assistant', text: 'Hi, I am Aira from FlowPilot.' },
        { role: 'user', text: 'Can you show me a demo of pending approval tracking?' }
      ],
      recordingBase64: null
    }) });
    assert(r.status === 201 && r.data.saved, `save failed: ${JSON.stringify(r.data)}`);
    id = r.data.id;
    const analysis = await json(`/api/calls/${id}/analyze`, { method: 'POST' });
    assert(analysis.status === 200, `analysis failed: ${JSON.stringify(analysis.data)}`);
    assert(typeof analysis.data.summary === 'string' && analysis.data.summary.length > 0, 'summary missing');
    assert(['Converted','Interested','Follow-up Required','Not Interested','Demo Requested','No Response'].includes(analysis.data.status), 'invalid sales status');
    assert(analysis.data.status === 'Demo Requested', `expected Demo Requested, got ${analysis.data.status}`);
  });
  await check('saved call appears in history and can be fetched', async () => {
    const list = await json('/api/calls');
    assert(list.status === 200 && list.data.some(c => c.id === id), 'call missing from history');
    const one = await json(`/api/calls/${id}`);
    assert(one.status === 200 && Array.isArray(one.data.transcript), 'call detail/transcript missing');
    assert(one.data.continuedFromCallId === null, 'new call should not have a continuation link');
  });
  await check('move call to recycle bin and restore', async () => {
    let r = await json(`/api/calls/${id}`, { method: 'DELETE' });
    assert(r.status === 200, `trash failed: ${JSON.stringify(r.data)}`);
    r = await json('/api/calls');
    assert(!r.data.some(c => c.id === id), 'trashed call still in active history');
    r = await json('/api/trash');
    assert(r.status === 200 && r.data.some(c => c.id === id), 'call missing from recycle bin');
    r = await json(`/api/calls/${id}/restore`, { method: 'POST', body: '{}' });
    assert(r.status === 200, `restore failed: ${JSON.stringify(r.data)}`);
  });
  await check('permanent deletion removes record from active history and trash', async () => {
    await json(`/api/calls/${id}`, { method: 'DELETE' });
    const del = await json(`/api/calls/${id}/permanent`, { method: 'DELETE' });
    assert(del.status === 200, `permanent deletion failed: ${JSON.stringify(del.data)}`);
    const active = await json('/api/calls');
    const trash = await json('/api/trash');
    assert(!active.data.some(c => c.id === id) && !trash.data.some(c => c.id === id), 'record still exists after permanent deletion');
  });
} catch (error) {
  failures++;
  console.error(`FATAL: ${error.message}`);
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 250));
  try { child.kill('SIGKILL'); } catch {}
  await rm(tempDir, { recursive: true, force: true });
}
console.log(`\nAPI integration tests: ${failures ? `${failures} failure(s)` : 'all passed'}`);
if (failures) process.exitCode = 1;
