// Dump ALL real product cards for a SERP
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
  const q = process.argv[2] || 'Mars+Hydro+TS-1000+LED+grow+light';
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
  const url = 'https://www.amazon.com/s?k=' + q;
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 4000));
  await send('Runtime.evaluate', {
    expression: `document.cookie = 'i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000'; document.cookie = 'lc-main=en_US; domain=.amazon.com; path=/; max-age=31536000';`,
  });
  await send('Page.reload', {});
  await new Promise((r) => setTimeout(r, 5000));
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const seen = {};
      const out = [];
      document.querySelectorAll('div[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || seen[asin]) return;
        const h2 = el.querySelector('h2');
        if (!h2) return;
        const real = h2.className.indexOf('a-text-normal') !== -1 || h2.hasAttribute('aria-label');
        if (!real) return;
        seen[asin] = true;
        const title = (h2.getAttribute('aria-label') || h2.textContent || '').replace(/\\s+/g,' ').trim();
        if (title.length < 8) return;
        let price = '';
        const off = el.querySelector('span.a-price > span.a-offscreen');
        if (off) price = off.innerText.trim();
        if (!price) {
          const whole = el.querySelector('span.a-price-whole');
          const frac = el.querySelector('span.a-price-fraction');
          if (whole) price = '$' + whole.innerText.replace(/[.,]/g,'') + '.' + (frac ? frac.innerText : '00');
        }
        const sponsored = !!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text');
        out.push(asin + '|' + (sponsored ? 'SP' : 'OR') + '|' + (price || '-') + '|' + title.slice(0, 90));
      });
      return out.join('\\n');
    })()`,
    returnByValue: true,
  });
  console.log('--- dump for: ' + q);
  console.log(r && r.result && r.result.value ? r.result.value : JSON.stringify(r));
  ws.close();
})().catch((e) => console.error('ERR', String(e && e.stack ? e.stack : e)));