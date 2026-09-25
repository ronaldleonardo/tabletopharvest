// Inspect the glow popover controls to switch country to US
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
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
    if (r && r.exceptionDetails) return 'EXC ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text);
    return r && r.result && r.result.value !== undefined ? r.result.value : JSON.stringify(r);
  };
  await evalJs(`document.title='glserp-tab'`);
  await send('Page.navigate', { url: 'https://www.amazon.com/s?k=test' });
  await new Promise((r) => setTimeout(r, 5000));
  await evalJs(`(() => { const el = document.querySelector('#glow-ingress-block'); if (el) el.click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 2200));
  const pop = await evalJs(`(() => {
    const modal = document.querySelector('#glow-modal-content, #glow-modal-popover-content');
    const txt = modal ? modal.innerText.slice(0, 500) : 'NO-MODAL';
    const links = modal ? Array.from(modal.querySelectorAll('a, button, [data-action], select, input')).map(a => ({
      t: (a.innerText || a.value || '').trim().slice(0, 45),
      a: a.getAttribute('data-action') || '',
      id: a.id || '',
      cls: (a.className || '').slice(0, 40)
    })).slice(0, 20) : [];
    return JSON.stringify({ txt, links });
  })()`);
  console.log(pop);
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));