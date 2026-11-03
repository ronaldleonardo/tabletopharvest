const http = require('http');
function httpReq(method, path, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
async function main() {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  console.log('TABS:', JSON.stringify(list.map(t => ({ title: t.title, url: t.url.slice(0, 120) }))));
  const tab = list.find(t => t.type === 'page');
  if (!tab) { console.log('no page'); process.exit(0); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const r = await send('Runtime.evaluate', { expression: "JSON.stringify({href:location.href, title:document.title, ck:document.cookie.slice(0,200), body:document.body?document.body.innerText.slice(0,300):'nobody'})", returnByValue: true });
  console.log('STATE:', r.result && r.result.value);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e)); process.exit(1); });
