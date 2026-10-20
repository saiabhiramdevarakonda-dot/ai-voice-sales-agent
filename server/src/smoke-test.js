// Lightweight smoke test: run with `node src/smoke-test.js` after server dependencies are installed.
const base = process.env.API_BASE || 'http://localhost:3001';
const checks = [
  ['health endpoint', '/api/health', d => d.ok === true],
  ['call history endpoint', '/api/calls', d => Array.isArray(d)],
];
let failed = false;
for (const [name, route, assert] of checks) {
  try {
    const res = await fetch(`${base}${route}`);
    const data = await res.json();
    if (!res.ok || !assert(data)) throw new Error(`HTTP ${res.status}: unexpected response`);
    console.log(`PASS ${name}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}: ${err.message}`);
  }
}
if (failed) process.exitCode = 1;
