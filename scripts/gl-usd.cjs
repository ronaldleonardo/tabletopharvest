// Force USD: set cookies + country dropdown flow
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
  await new Promise((r) => setTimeout(r, 5000));
  // attempt 1: force USD via cookies on amazon.com domain
  console.log('COOKIES', await evalJs(`(() => {
    const c = ['i18n-prefs=USD', 'lc-main=en_US'];
    for (const kv of c) document.cookie = kv + '; domain=.amazon.com; path=/; max-age=31536000';
    return document.cookie.slice(0, 120);
  })()`));
  await send('Page.reload', {});
  await new Promise((r) => setTimeout(r, 5000));
  console.log('PRICE1', await evalJs(`(() => {
    const off = document.querySelector('span.a-price > span.a-offscreen');
    return off ? off.innerText : 'no-price';
  })()`));

  // attempt 2: country dropdown flow in glow popover
  await evalJs(`(() => {
    const el = document.querySelector('#glow-ingress-block');
    if (el) el.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 2000));
  console.log('DD', await evalJs(`(() => {
    const inp = document.querySelector('#GLUXZipUpdateInput');
    if (!inp) return 'no-zip-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '10001');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return 'zip-set';
  })()`));
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`(() => {
    const b = document.querySelector('#GLUXZipUpdate');
    if (b) b.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 2500));
  console.log('DROP', await evalJs(`(() => {
    const dd = document.querySelector('#GLUXCountryListDropdown');
    const opt = dd ? dd.querySelector('option[value="US"]') : null;
    if (dd && opt) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(dd, 'US');
      dd.dispatchEvent(new Event('change', { bubbles: true }));
      return 'country-set-US';
    }
    return dd ? 'dropdown-no-US-option' : 'no-dropdown';
  })()`));
  await new Promise((r) => setTimeout(r, 600));
  console.log('APPLY', await evalJs(`(() => {
    const b = document.querySelector('#GLUXZipUpdate') || document.querySelector('#GLUXCountryUpdate') || document.querySelector('#GLUXUpdateButton');
    if (b) { b.click(); return 'applied'; }
    return 'no-apply-btn';
  })()`));
  await new Promise((r) => setTimeout(r, 3500));
  console.log('GLOW', await evalJs(`(() => {
    const b = document.querySelector('#glow-ingress-line2');
    return b ? b.innerText.trim() : 'no-badge';
  })()`));
  console.log('PRICE2', await evalJs(`(() => {
    const off = document.querySelector('span.a-price > span.a-offscreen');
    return off ? off.innerText : 'no-price';
  })()`));
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));