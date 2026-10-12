// Debug: dump what Amazon SERP actually renders
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
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  let tab = list.find((t) => t.type === 'page' && t.title === 'gldbg');
  if (!tab) tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.evaluate', { expression: "document.title='gldbg'" });
  const url = 'https://www.amazon.com/s?k=' + process.argv[2] || 'Vivosun+VS1000+LED+grow+light';
  await send('Page.navigate', { url }); await sleep(5000);
  await send('Runtime.evaluate', { expression: `document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000';` });
  await send('Page.reload', {}); await sleep(5000);
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify({title: document.title, url: location.href, text: document.body.innerText.slice(0,1500), ndataasin: document.querySelectorAll('div[data-asin]').length, dogs: !!document.querySelector('img[alt*=\"Dogs\"]'), captcha: !!document.querySelector('#captcha')})` , returnByValue: true });
  console.log("RAW:", JSON.stringify(r).slice(0,1600));
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('ERR', String(e)); process.exit(1); });