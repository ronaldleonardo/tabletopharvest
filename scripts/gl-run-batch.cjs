// Batch SERP scrape for GL batch 11-15 via CDP Chrome :9222 (fixed extraction)
const http = require('http');
function httpReq(method, path, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', reject); req.end();
  });
}
const PRODUCTS = [
  { id: 'growers-choice-roi-e720', q: 'Growers+Choice+ROI-E720+LED+grow+light', m: 'roi-?e720|roi e720|e720.*growers|growers.*e720' },
  { id: 'phlizon-cree-cob', q: 'Phlizon+CREE+COB+2000W+LED+grow+light', m: 'phlizon.*(cree|cob)|cree.*phlizon' },
  { id: 'unit-farm-uf-2000', q: 'Unit+Farm+UF-2000+LED+grow+light', m: 'unit.?farm.*uf-?2000|uf-?2000.*unit' },
  { id: 'maxsisun-pb-2000', q: 'Maxsisun+PB-2000+LED+grow+light', m: 'maxsisun.*pb-?2000|pb-?2000.*maxsisun' },
  { id: 'vivosun-vs1000', q: 'Vivosun+VS1000+LED+grow+light', m: 'vivosun.*vs-?1000|vs-?1000.*vivosun', x: 'vs1000e|aerolab|aerosh[Ee]d' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  let tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Runtime.evaluate', { expression: "document.title='glserp-tab'" });
  const scrape = async (q, matchRe, excludeRe) => {
    const url = 'https://www.amazon.com/s?k=' + q;
    await send('Page.navigate', { url });
    await sleep(6000);
    await send('Runtime.evaluate', { expression: `document.cookie='i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000'; document.cookie='lc-main=en_US; domain=.amazon.com; path=/; max-age=31536000';` });
    await send('Page.reload', {}); await sleep(6000);
    let state = null;
    for (let i = 0; i < 20; i++) {
      const r = await send('Runtime.evaluate', { expression: `(() => { try { const all=document.querySelectorAll('div[data-asin]').length; const err=!!document.querySelector('img[alt*="Dogs of Amazon"]'); return JSON.stringify({all,err}); } catch(e){ return JSON.stringify({all:0,err:false}); } })()`, returnByValue: true });
      const raw = r && r.result && r.result.value; state = raw ? JSON.parse(raw) : { all: 0, err: false };
      if (state.err) break; if (state.all > 2) break; await sleep(1500);
    }
    console.error('DBG[' + q + '] state=' + JSON.stringify(state));
    if (!state || state.err || state.all === 0) return { id: q, blocked: true };
    const r2 = await send('Runtime.evaluate', { expression: `(() => { const seen={}; const out=[]; document.querySelectorAll('div[data-asin]').forEach(el=>{ const asin=el.getAttribute('data-asin'); if(!asin||seen[asin])return; seen[asin]=true; let title=''; const h2=el.querySelector('h2'); if(h2)title=(h2.getAttribute('aria-label')||h2.textContent||'').replace(/\\s+/g,' ').trim(); let price=''; const off=el.querySelector('span.a-price > span.a-offscreen'); if(off)price=off.innerText.trim(); if(!price){ const w=el.querySelector('span.a-price-whole'); const f=el.querySelector('span.a-price-fraction'); if(w)price='$'+w.innerText.replace(/[.,]/g,'')+'.'+(f?f.innerText:'00'); } const sponsored=!!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text'); if(title.length>=6||price)out.push({asin,title:title.slice(0,150),price,sponsored}); }); return JSON.stringify(out); })()`, returnByValue: true });
    let results = []; const raw2 = r2 && r2.result && r2.result.value; if (raw2) { try { results = JSON.parse(raw2); } catch (e) {} }
    const matched = results.map((x, i) => Object.assign({}, x, { pos: i })).filter((x) => matchRe.test(x.title) && (!excludeRe || !excludeRe.test(x.title)) && !x.sponsored);
    const brandish = results.map((x, i) => Object.assign({}, x, { pos: i })).filter((x) => !matched.includes(x) && x.title.length > 8);
    return { id: q, blocked: false, total: results.length, matched: matched.slice(0, 5), brandish: brandish.slice(0, 5) };
  };
  for (const p of PRODUCTS) {
    const res = await scrape(p.q, new RegExp(p.m, 'i'), p.x ? new RegExp(p.x, 'i') : null);
    if (res.blocked) console.log('BLOCKED\t' + p.id);
    else if (res.matched.length === 0) console.log('NOMATCH\t' + p.id + '\ttotal=' + (res.total||0) + '\t' + JSON.stringify(res.brandish.map(b => ({ asin: b.asin, pr: b.price, tt: b.title.slice(0, 70), sp: b.sponsored }))));
    else for (const m of res.matched) console.log('HIT\t' + p.id + '\t' + JSON.stringify({ asin: m.asin, price: m.price, pos: m.pos, title: m.title.slice(0, 95) }));
    await sleep(2000);
  }
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e)); process.exit(1); });