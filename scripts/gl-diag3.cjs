const http = require('http');
function httpReq(method, path, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Page.navigate', { url: 'https://www.amazon.com/s?k=Mars+Hydro+FC-4800+LED+grow+light' });
  await sleep(9000);
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify({asinCount:document.querySelectorAll('div[data-asin]').length, nz:Array.from(document.querySelectorAll('div[data-asin]')).filter(e=>e.getAttribute('data-asin')).length, txt:document.body.innerText.replace(/\\n+/g,' | ').slice(400,2200)})`, returnByValue: true });
  const v = JSON.stringify(r).slice(0,1200);
  console.log(v);
  ws.close(); process.exit(0);
})();
