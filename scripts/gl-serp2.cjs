// SERP scrape built on the proven debug flow. Writes NDJSON to /root/.hermes/gl-serp-out.ndjson
const http = require('http');
const fs = require('fs');
function httpReq(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: 25000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('timeout'))); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRODUCTS = [
  { id: 'growers-choice-roi-e720', q: 'Growers+Choice+ROI-E720+LED+grow+light' },
  { id: 'phlizon-cree-cob', q: 'Phlizon+CREE+COB+2000W+LED+grow+light' },
  { id: 'unit-farm-uf-2000', q: 'Unit+Farm+UF-2000+LED+grow+light' },
  { id: 'maxsisun-pb-2000', q: 'Maxsisun+PB-2000+LED+grow+light' },
  { id: 'vivosun-vs1000', q: 'Vivosun+VS1000+LED+grow+light' },
];

const EXTRACT = `(() => {
  const seen = {}; const out = [];
  document.querySelectorAll('div[data-asin]').forEach(el => {
    const asin = el.getAttribute('data-asin');
    if (!asin || seen[asin]) return; seen[asin] = true;
    let title = ''; const h2 = el.querySelector('h2');
    if (h2) title = (h2.getAttribute('aria-label') || h2.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!title) { const span = el.querySelector('span.a-text-normal'); if (span) title = span.textContent.replace(/\\s+/g, ' ').trim(); }
    let price = '';
    const off = el.querySelector('span.a-price > span.a-offscreen');
    if (off) price = off.innerText.trim();
    if (!price) { const w = el.querySelector('span.a-price-whole'); const f = el.querySelector('span.a-price-fraction'); if (w) price = '$' + w.innerText.replace(/[.,]/g, '') + '.' + (f ? f.innerText : '00'); }
    const sponsored = !!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text');
    const fulltext = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    if (title.length >= 6 || price) out.push({ asin, title: title.slice(0, 180), text: fulltext, price, sponsored });
  });
  return JSON.stringify({ count: out.length, url: location.href, title: document.title, items: out });
})()`;

async function main() {
  const out = fs.createWriteStream('/root/.hermes/gl-serp-out.ndjson');
  for (const p of PRODUCTS) {
    const tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
    await new Promise((r) => (ws.onopen = r));
    const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    const url = 'https://www.amazon.com/s?k=' + p.q;
    await send('Page.navigate', { url }); await sleep(6500);
    await send('Runtime.evaluate', { expression: `document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000';` });
    await send('Page.reload', {}); await sleep(6500);
    let payload = null;
    for (let i = 0; i < 8; i++) {
      const r = await send('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
      const raw = r && r.result && r.result.value;
      if (raw) { try { const j = JSON.parse(raw); if (j.count > 0) { payload = j; break; } payload = j; } catch (e) {} }
      await sleep(2000);
    }
    out.write(JSON.stringify({ id: p.id, query: p.q, payload }) + '\n');
    console.error('DONE ' + p.id + ' count=' + (payload ? payload.count : 'null'));
    ws.close();
    await sleep(1500);
  }
  out.end();
  await sleep(500);
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e && e.stack || e)); process.exit(1); });