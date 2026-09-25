// Batch Amazon SERP scraper via CDP Chrome :9222
// Usage: node gl-serp.cjs <search> <matchRegex> <excludeRegex> [label]
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

async function main() {
  const query = process.argv[2];
  const matchRe = new RegExp(process.argv[3], 'i');
  const excludeRe = process.argv[4] ? new RegExp(process.argv[4], 'i') : null;
  const label = process.argv[5] || query;
  const url = 'https://www.amazon.com/s?k=' + query;

  const list = JSON.parse(await httpReq('GET', '/json/list'));
  let tab = list.find((t) => t.type === 'page' && t.url === 'about:blank');
  if (!tab) {
    tab = JSON.parse(await httpReq('PUT', '/json/new?about:blank'));
  }
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

  // mark this tab so we can find it next time
  await send('Runtime.evaluate', { expression: `document.title='glserp-tab'` });

  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 2500));
  let state = null;
  for (let i = 0; i < 25; i++) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        try {
          const n = Array.from(document.querySelectorAll('div[data-asin]')).filter(el => el.getAttribute('data-asin')).length;
          const err = !!document.querySelector('img[alt*="Dogs of Amazon"]');
          return JSON.stringify({n, err});
        } catch (e) { return JSON.stringify({n:0, err:false}); }
      })()`,
      returnByValue: true,
    });
    const raw = r.result && r.result.value;
    state = raw ? JSON.parse(raw) : { n: 0, err: false };
    if (state.n > 1 || state.err) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!state || state.err) {
    console.log('BLOCKED\t' + label);
    ws.close();
    return;
  }
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const seen = {};
      const out = [];
      document.querySelectorAll('div[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || seen[asin]) return;
        seen[asin] = true;
        const h2 = el.querySelector('h2');
        const title = h2 ? h2.innerText.replace(/\\s+/g,' ').trim() : '';
        if (!title) return;
        let price = '';
        const off = el.querySelector('span.a-price > span.a-offscreen');
        if (off) price = off.innerText.trim();
        if (!price) {
          const whole = el.querySelector('span.a-price-whole');
          const frac = el.querySelector('span.a-price-fraction');
          if (whole) price = '$' + whole.innerText.replace(/[.,]/g,'') + '.' + (frac ? frac.innerText : '00');
        }
        const ratingEl = el.querySelector('span.a-icon-alt');
        const rating = ratingEl ? ratingEl.innerText.trim() : '';
        const sponsored = !!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text');
        out.push({asin, title: title.slice(0,150), price, rating, sponsored});
      });
      return JSON.stringify(out);
    })()`,
    returnByValue: true,
  });
  const results = JSON.parse(r.result.value);

  // Filter: match regex, exclude regex, prefer non-sponsored; sort by position
  const ranked = results.map((x, i) => Object.assign({}, x, { pos: i }));
  const matched = ranked.filter((x) => matchRe.test(x.title) && (!excludeRe || !excludeRe.test(x.title)));
  const brandish = ranked.filter((x) => !matched.includes(x) && x.title.length > 3);

  console.log('LABEL\t' + label);
  console.log('QUERY\t' + query);
  if (matched.length === 0) {
    console.log('NOMATCH');
    console.log('TOP\t' + JSON.stringify(brandish.slice(0, 5)));
  } else {
    for (const m of matched.slice(0, 6)) {
      console.log('HIT\t' + JSON.stringify({ pos: m.pos, asin: m.asin, price: m.price, rating: m.rating, sponsored: m.sponsored, title: m.title.slice(0, 120) }));
    }
    if (matched.length > 6) console.log('MOREMATCHES\t' + (matched.length - 6));
  }
  ws.close();
}
main().catch((e) => { console.error('FATAL', e.message, '\n', e.stack); process.exit(1); });