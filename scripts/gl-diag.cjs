// Diagnostic: dump current page state of the glserp tab
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
  const url = process.argv[2] || 'https://www.amazon.com/s?k=Mars+Hydro+TS-1000+LED+grow+light';
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
  await send('Runtime.evaluate', { expression: "document.title='glserp-tab'" });
  console.log('NAV', url);
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 7000));
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const asins = Array.from(document.querySelectorAll('div[data-asin]')).filter(el => el.getAttribute('data-asin')).length;
      const dogs = !!document.querySelector('img[alt*="Dogs of Amazon"]');
      const captcha = /captcha|robot check|enter the characters/i.test(document.title + ' ' + (document.body ? document.body.innerText.slice(0,2000) : ''));
      return JSON.stringify({
        title: document.title.slice(0, 100),
        asins,
        dogs,
        captcha,
        bodyLen: document.body ? document.body.innerText.length : 0,
        url: location.href.slice(0, 120),
        snippet: document.body ? document.body.innerText.slice(0, 250) : ''
      });
    })()`,
    returnByValue: true,
  });
  console.log(r.result && r.result.value ? r.result.value : JSON.stringify(r));
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));