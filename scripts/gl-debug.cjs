// Debug: inspect Amazon glow (deliver-to) UI
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
  await send('Page.navigate', { url: 'https://www.amazon.com/s?k=Mars+Hydro+TS-1000+LED+grow+light' });
  await new Promise((r) => setTimeout(r, 6000));
  // find the deliver-to element
  const glowInfo = await evalJs(`(() => {
    const cands = ['#glow-ingress-block', '#nav-global-location-popover-link', 'a[data-csa-c-content-id="glow-ingress-block"]', '#nav-global-location-data-modal-action'];
    const found = cands.map(s => ({s, el: !!document.querySelector(s), cls: document.querySelector(s) ? document.querySelector(s).className.slice(0,60) : ''}));
    const el = document.querySelector('[id*="glow"][class*="ingress"], #nav-global-location-data-modal-action');
    return JSON.stringify({found, badge: document.querySelector('#glow-ingress-line2') ? document.querySelector('#glow-ingress-line2').innerText : ''});
  })()`);
  console.log('GLOWINFO', glowInfo);
  // click attempt via multiple selectors
  const clickRes = await evalJs(`(() => {
    const sels = ['#glow-ingress-block', '#nav-global-location-data-modal-action', 'a[data-csa-c-content-id="glow-ingress-block"]'];
    for (const s of sels) { const el = document.querySelector(s); if (el) { el.click(); return 'clicked ' + s; } }
    return 'nothing-to-click';
  })()`);
  console.log('CLICK', clickRes);
  await new Promise((r) => setTimeout(r, 2200));
  const pop = await evalJs(`(() => {
    const zip = document.querySelector('#GLUXZipUpdateInput');
    const btn = document.querySelector('#GLUXZipUpdate');
    const modal = document.querySelector('#glow-modal-popover-content, [id*="GLUX"][class*="modal"], .glow-subheader');
    return JSON.stringify({zip: !!zip, btn: !!btn, modalText: modal ? modal.innerText.slice(0,150) : '', anyGLUX: document.querySelectorAll('[id^="GLUX"]').length});
  })()`);
  console.log('POP', pop);
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));