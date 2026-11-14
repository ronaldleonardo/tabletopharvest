// Batch 21-25 GL price check — attaches to an EXISTING amazon page tab via CDP :9222.
const http = require('http');
function httpReq(method, path, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const PRODUCTS = [
  { id: 'ac-infinity-ionframe-evo3', q: 'AC+Infinity+IONFRAME+EVO3+LED+grow+light', m: 'ionframe.{0,12}evo.?3|evo.?3' },
  { id: 'ac-infinity-ionframe-evo8', q: 'AC+Infinity+IONFRAME+EVO8+LED+grow+light', m: 'ionframe.{0,12}evo.?8|evo.?8' },
  { id: 'mars-hydro-fc-4800', q: 'Mars+Hydro+FC-4800+LED+grow+light', m: 'fc.?4800|fc.?e4800' },
  { id: 'hlg-300l-rspec', q: 'HLG+300L+RSpec+LED+grow+light', m: '300l|hlg' },
  { id: 'migro-aray-4', q: 'Migro+Aray+4+LED+grow+light', m: 'aray' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  const tab = list.find(t => t.type === 'page' && t.url.includes('amazon.com'));
  if (!tab) { console.error('FATAL no amazon page tab'); process.exit(1); }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { _err: String(r.result.exceptionDetails.text || '') };
    const v = r.result && r.result.result && r.result.result.value;
    try { return JSON.parse(v); } catch (e) { return { _raw: v }; }
  };
  const SERP = `(() => { const seen={}; const out=[]; document.querySelectorAll('div[data-asin]').forEach(el=>{ const asin=el.getAttribute('data-asin'); if(!asin||seen[asin])return; seen[asin]=true; let title=''; const h2=el.querySelector('h2'); if(h2)title=(h2.getAttribute('aria-label')||h2.innerText||'').replace(/\\s+/g,' ').trim(); if(!title){ const h=el.querySelector('h2 a span, a.a-link-normal span'); if(h)title=h.innerText.replace(/\\s+/g,' ').trim(); } let price=''; const off=el.querySelector('span.a-price > span.a-offscreen'); if(off)price=off.innerText.trim(); if(!price){ const w=el.querySelector('span.a-price-whole'); if(w)price='$'+w.innerText.replace(/[.,]/g,''); } const sponsored=!!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text'); if(title.length>=8)out.push({asin,title:title.slice(0,160),price,sponsored}); }); return JSON.stringify({n:out.length, all:document.querySelectorAll('div[data-asin]').length, err:/Dogs of Amazon|Enter the characters/i.test(document.body.innerText), results:out.slice(0,60)}); })()`;
  const DETAIL = `(() => {
    const g=(s)=>{const e=document.querySelector(s);return e?e.innerText.trim():'';};
    let price=g('#corePriceDisplay_desktop_feature_div span.a-price > span.a-offscreen')||g('#corePrice_feature_div span.a-price > span.a-offscreen')||g('#priceblock_ourprice')||g('#priceblock_dealprice');
    if(!price){const o=document.querySelector('span.a-price > span.a-offscreen'); if(o)price=o.innerText.trim();}
    const title=g('#productTitle');
    const oos=/Currently unavailable|out of stock|We don't know when/i.test(document.body.innerText);
    const asin=(location.pathname.match(/\\/dp\\/([A-Z0-9]{10})/)||[])[1]||'';
    const loc=g('#glow-ingress-line2');
    return JSON.stringify({title:title.slice(0,130),price,asin,oos,loc,body:document.body.innerText.replace(/\\n+/g,' | ').slice(0,200)});
  })()`;
  const out = [];
  for (const p of PRODUCTS) {
    const row = { id: p.id };
    await send('Page.navigate', { url: 'https://www.amazon.com/s?k=' + p.q });
    let serp = null;
    for (let i = 0; i < 14; i++) {
      await sleep(2000);
      serp = await evalJS(SERP);
      if (serp && !serp._err && (serp.err || serp.all > 2)) break;
    }
    row.serp = { n: serp && serp.n, all: serp && serp.all, err: serp && serp.err };
    if (!serp || serp.err || !serp.all) { row.blocked = true; out.push(row); continue; }
    const mre = new RegExp(p.m, 'i');
    const cands = (serp.results || []).filter(x => mre.test(x.title)).slice(0, 5);
    row.cands = cands;
    row.others = (serp.results || []).filter(x => !mre.test(x.title)).slice(0, 3).map(b => ({ asin: b.asin, pr: b.price, tt: b.title.slice(0, 70) }));
    const pick = cands.find(c => !c.sponsored) || cands[0];
    if (pick) {
      await send('Page.navigate', { url: 'https://www.amazon.com/dp/' + pick.asin });
      let det = null;
      for (let i = 0; i < 8; i++) {
        await sleep(2000);
        det = await evalJS(DETAIL);
        if (det && det.price && !det._err) break;
      }
      row.detail = det;
    }
    out.push(row);
    await sleep(1500);
  }
  console.log(JSON.stringify(out, null, 1));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', String(e)); process.exit(1); });
