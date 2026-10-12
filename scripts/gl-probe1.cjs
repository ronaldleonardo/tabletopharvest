// Probe: replicate batch flow for one query, dump state
const http = require('http');
function httpReq(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: 20000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const url = 'https://www.amazon.com/s?k=' + process.argv[2];
  await send('Page.navigate', { url }); await sleep(6000);
  await send('Runtime.evaluate', { expression: `document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000';` });
  await send('Page.reload', {}); await sleep(6000);
  for (let i = 0; i < 3; i++) {
    const r = await send('Runtime.evaluate', { expression: `(() => { try { const all=document.querySelectorAll('div[data-asin]').length; const err=!!document.querySelector('img[alt*="Dogs of Amazon"]'); return JSON.stringify({all,err}); } catch(e){ return 'EXC:'+e.message; } })()`, returnByValue: true });
    console.log('iter', i, 'resp:', JSON.stringify(r.result).slice(0, 300));
    await sleep(1500);
  }
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR', String(e)); process.exit(1); });