// Evaluate an expression in an existing page tab. Usage: node gl-eval.cjs "<js expr>"
const http = require('http');
function httpReq(method, path, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const expr = process.argv[2] || 'document.title';
(async () => {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  const tab = list.find(t => t.type === 'page' && t.url.includes('amazon.com'));
  if (!tab) { console.error('no amazon page tab'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(JSON.stringify(r.result || r, null, 1).slice(0, 4000));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
