// Inspect one Amazon SERP card DOM structure to fix title extraction
const http = require('http');
function httpReq(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.end();
  });
}
(async () => {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  let tab = list.find((t) => t.type === 'page' && t.title === 'glserp-tab');
  if (!tab) tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++msgId;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result && r.result.value !== undefined ? r.result.value : JSON.stringify(r.result);
  };
  await send('Runtime.evaluate', { expression: "document.title='glserp-tab'" });
  await send('Page.navigate', { url: 'https://www.amazon.com/s?k=Spider+Farmer+SF-1000+LED+grow+light' });
  await new Promise((r) => setTimeout(r, 7000));
  const dump = await evalJs(`(() => {
    const cards = Array.from(document.querySelectorAll('div[data-asin]')).filter(e => e.getAttribute('data-asin'));
    const out = [];
    for (let i = 0; i < Math.min(4, cards.length); i++) {
      const el = cards[i];
      const h2 = el.querySelector('h2');
      out.push({
        i,
        asin: el.getAttribute('data-asin'),
        cls: el.className.slice(0, 40),
        h2text: h2 ? h2.textContent.replace(/\\s+/g,' ').trim().slice(0,120) : 'no-h2',
        h2html: h2 ? h2.outerHTML.slice(0, 300) : 'no-h2',
        price: (el.querySelector('span.a-price > span.a-offscreen') || {}).innerText || ''
      });
    }
    return JSON.stringify(out);
  })()`);
  console.log('DUMP', dump);
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));