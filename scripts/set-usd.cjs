// Set USD currency cookies on the existing Amazon tab.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  let tab = list.find((t) => t.type === 'page' && t.url.includes('amazon'));
  if (!tab) {
    console.log('NO AMAZON TAB; opening new');
    tab = JSON.parse(await httpReq('PUT', '/json/new?https://www.amazon.com/'));
    await sleep(4000);
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.evaluate', { expression: "document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000; Secure; SameSite=Lax'" });
  await send('Runtime.evaluate', { expression: "document.cookie='lc-main=en_US; domain=.amazon.com; path=/; max-age=31536000; Secure; SameSite=Lax'" });
  const r = await send('Runtime.evaluate', { expression: "document.cookie", returnByValue: true });
  console.log('COOKIES:', r.result.value);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e)); process.exit(1); });
