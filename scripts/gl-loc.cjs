// Set Amazon delivery location to US ZIP 10001 so prices render in USD
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
  await send('Page.navigate', { url: 'https://www.amazon.com/s?k=test' });
  await new Promise((r) => setTimeout(r, 6000));
  console.log('STEP1', await evalJs(`(() => {
    const el = document.querySelector('#glow-ingress-block');
    if (!el) return 'no-glow';
    el.click();
    return 'clicked';
  })()`));
  await new Promise((r) => setTimeout(r, 2200));
  console.log('STEP2', await evalJs(`(() => {
    const inp = document.querySelector('#GLUXZipUpdateInput');
    if (!inp) return 'no-zip-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '10001');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled zip=10001';
  })()`));
  await new Promise((r) => setTimeout(r, 500));
  console.log('STEP3', await evalJs(`(() => {
    const btn = document.querySelector('#GLUXZipUpdate');
    if (!btn) return 'no-update-btn';
    btn.click();
    return 'zip-update-clicked';
  })()`));
  await new Promise((r) => setTimeout(r, 3500));
  // handle post-update modal: confirm new location or country dropdown
  console.log('STEP4', await evalJs(`(() => {
    const btns = ['#GLUXConfirmClose', '#GLUXConfirmAddress', '#GLUXCountryListDropdown', '#GLUXCountryInput'];
    const hits = btns.map(s => ({s, el: !!document.querySelector(s)}));
    const c = document.querySelector('#GLUXConfirmClose');
    if (c) { c.click(); return 'confirmed-close: ' + JSON.stringify(hits); }
    return 'no-confirm: ' + JSON.stringify(hits);
  })()`));
  await new Promise((r) => setTimeout(r, 2500));
  // re-read the badge
  const glow = await evalJs(`(() => {
    const b = document.querySelector('#glow-ingress-line2');
    return b ? b.innerText.trim() : 'no-badge';
  })()`);
  const price = await evalJs(`(() => {
    const off = document.querySelector('span.a-price > span.a-offscreen');
    return off ? off.innerText : 'no-price';
  })()`);
  console.log('GLOW:', glow);
  console.log('FIRSTPRICE:', price);
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));