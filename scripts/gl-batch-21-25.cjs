// Batch 21-25 GL price check via CDP Chrome :9222 — SERP + detail buybox.
const http = require('http');
function httpReq(method, path, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const PRODUCTS = [
  { id: 'ac-infinity-ionframe-evo3', q: 'AC+Infinity+IONFRAME+EVO3+LED+grow+light', m: 'ionframe\\s*evo\\s*3|evo3' },
  { id: 'ac-infinity-ionframe-evo8', q: 'AC+Infinity+IONFRAME+EVO8+LED+grow+light', m: 'ionframe\\s*evo\\s*8|evo8' },
  { id: 'mars-hydro-fc-4800', q: 'Mars+Hydro+FC-4800+LED+grow+light', m: 'fc-?4800' },
  { id: 'hlg-300l-rspec', q: 'HLG+300L+RSpec+LED+grow+light', m: '300l|hlg' },
  { id: 'migro-aray-4', q: 'Migro+Aray+4+LED+grow+light', m: 'aray' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Page.enable', {});
  await send('Page.navigate', { url: 'https://www.amazon.com/' });
  await sleep(4000);
  await send('Runtime.evaluate', { expression: "document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000'; document.cookie='lc-main=en_US; domain=.amazon.com; path=/; max-age=31536000';" });
  await send('Page.reload', {}); await sleep(4000);

  const DETAIL_EXPR = `(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : ''; };
    let price = g('#corePriceDisplay_desktop_feature_div span.a-price > span.a-offscreen') ||
                g('#corePrice_feature_div span.a-price > span.a-offscreen') ||
                g('#priceblock_ourprice') || g('#priceblock_dealprice') || g('span.a-price > span.a-offscreen');
    const title = g('#productTitle');
    const oos = /Currently unavailable|out of stock|We don't know when/i.test(document.body.innerText);
    const asinEl = document.querySelector('input#ASIN') || document.querySelector('[name=ASIN]');
    const asin = asinEl ? asinEl.value : (location.pathname.match(/\\/dp\\/([A-Z0-9]{10})/)||[])[1] || '';
    const loc = g('#glow-ingress-line2');
    return JSON.stringify({title: title.slice(0,120), price, asin, oos, loc});
  })()`;

  const out = [];
  for (const p of PRODUCTS) {
    const row = { id: p.id };
    // SERP
    await send('Page.navigate', { url: 'https://www.amazon.com/s?k=' + p.q });
    await sleep(6000);
    let st = { n: 0, err: false };
    for (let i = 0; i < 12; i++) {
      const r = await send('Runtime.evaluate', { expression: `(() => { try { const n=Array.from(document.querySelectorAll('div[data-asin]')).filter(e=>e.getAttribute('data-asin')).length; const err=!!document.querySelector('img[alt*="Dogs of Amazon"]')||/api-services-support@amazon.com|Enter the characters/i.test(document.body.innerText); return JSON.stringify({n,err}); } catch(e){ return JSON.stringify({n:0,err:false}); } })()`, returnByValue: true });
      try { st = JSON.parse(r.result.value); } catch (e) {}
      if (st.err || st.n > 2) break;
      await sleep(1500);
    }
    row.serpState = st;
    if (st.err || st.n === 0) { row.blocked = true; out.push(row); continue; }
    const r2 = await send('Runtime.evaluate', { expression: `(() => { const seen={}; const out=[]; document.querySelectorAll('div[data-asin]').forEach(el=>{ const asin=el.getAttribute('data-asin'); if(!asin||seen[asin])return; seen[asin]=true; let title=''; const h2=el.querySelector('h2'); if(h2)title=(h2.getAttribute('aria-label')||h2.innerText||'').replace(/\\s+/g,' ').trim(); let price=''; const off=el.querySelector('span.a-price > span.a-offscreen'); if(off)price=off.innerText.trim(); const sponsored=!!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text'); if(title.length>=6)out.push({asin,title:title.slice(0,150),price,sponsored}); }); return JSON.stringify(out); })()`, returnByValue: true });
    let results = []; try { results = JSON.parse(r2.result.value); } catch (e) {}
    const mre = new RegExp(p.m, 'i');
    row.total = results.length;
    row.cands = results.map((x, i) => Object.assign({}, x, { pos: i })).filter(x => mre.test(x.title)).slice(0, 4);
    row.brandish = results.slice(0, 3).map(b => ({ asin: b.asin, pr: b.price, tt: b.title.slice(0, 70) }));
    // Detail on first non-sponsored candidate
    const pick = row.cands.find(c => !c.sponsored) || row.cands[0];
    if (pick && pick.asin) {
      await send('Page.navigate', { url: 'https://www.amazon.com/dp/' + pick.asin });
      await sleep(5000);
      const r3 = await send('Runtime.evaluate', { expression: DETAIL_EXPR, returnByValue: true });
      try { row.detail = JSON.parse(r3.result.value); } catch (e) { row.detail = null; }
    }
    out.push(row);
    await sleep(2000);
  }
  console.log(JSON.stringify(out, null, 1));
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e)); process.exit(1); });
