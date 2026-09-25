// Batch Amazon SERP price scraper for Grow Light DB (30 products)
// Drives headless Chromium on :9222 via CDP. Prices forced to USD via i18n-prefs cookie.
const http = require('http');

function httpReq(method, path, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(d));
    });
    req.on('timeout', () => { req.destroy(new Error('http timeout')); });
    req.on('error', reject);
    req.end();
  });
}

const PRODUCTS = [
  { id: 'spider-farmer-sf-1000', q: 'Spider+Farmer+SF-1000+LED+grow+light', m: 'spider.?farmer.*sf-?1000|sf-?1000.*spider', x: '2 ?pack|4 ?pack|1000d' },
  { id: 'mars-hydro-ts-1000', q: 'Mars+Hydro+TS-1000+LED+grow+light', m: 'mars.?hydro.*ts-?1000|ts-?1000.*mars', x: '2 ?pack|tent|kit|combo|smart|evo' },
  { id: 'viparspectra-xs1500', q: 'Viparspectra+XS1500+Pro+LED+grow+light', m: 'vipar.?spectra.*xs-?1500.*pro|xs-?1500.*pro' },
  { id: 'barrina-t5-4pack', q: 'Barrina+T5+4-Pack+LED+grow+light', m: 'barrina.*t5.*(4 ?pack|four pack)' },
  { id: 'aerogarden-harvest', q: 'AeroGarden+Harvest+LED+grow+light', m: 'aerogarden.*harvest|harvest.*aerogarden', x: 'lite|bounty|slim|xl|elite|sprout|2\\.0|brown|black|white|red|green|pink|bundle|45|60' },
  { id: 'hlg-100-rspec', q: 'HLG+100+RSpec+LED+grow+light', m: 'hlg.*100.*rspec|100 rspec|100rspec' },
  { id: 'spider-farmer-sf-2000', q: 'Spider+Farmer+SF-2000+LED+grow+light', m: 'spider.?farmer.*sf-?2000|sf-?2000.*spider', x: '2 ?pack|4 ?pack' },
  { id: 'mars-hydro-fc-3000', q: 'Mars+Hydro+FC-3000+LED+grow+light', m: 'mars.?hydro.*fc-?3000|fc-?3000.*mars', x: '2 ?pack|evo|tent|kit' },
  { id: 'ac-infinity-ionbeam', q: 'AC+Infinity+IONBEAM+S16+LED+grow+light', m: 'ac.?infinity.*ionbeam.*s16|ionbeam.*s16.*ac|ionbeam s16' },
  { id: 'viparspectra-p600', q: 'VIPARSPECTRA+P600+LED+grow+light', m: 'vipar.?spectra.*p-?600|p-?600.*vipar' },
  { id: 'growers-choice-roi-e720', q: 'Growers+Choice+ROI-E720+LED+grow+light', m: 'roi-?e720|roi e720|e720.*growers|growers.*e720' },
  { id: 'phlizon-cree-cob', q: 'Phlizon+CREE+COB+2000W+LED+grow+light', m: 'phlizon.*(cree|cob)|cree.*phlizon' },
  { id: 'unit-farm-uf-2000', q: 'Unit+Farm+UF-2000+LED+grow+light', m: 'unit.?farm.*uf-?2000|uf-?2000.*unit' },
  { id: 'maxsisun-pb-2000', q: 'Maxsisun+PB-2000+LED+grow+light', m: 'maxsisun.*pb-?2000|pb-?2000.*maxsisun' },
  { id: 'vivosun-vs1000', q: 'Vivosun+VS1000+LED+grow+light', m: 'vivosun.*vs-?1000|vs-?1000.*vivosun', x: 'vs1000e|aerolab|aeroshed' },
  { id: 'mars-hydro-ts-600', q: 'Mars+Hydro+TS-600+LED+grow+light', m: 'mars.?hydro.*ts-?600|ts-?600.*mars', x: '2 ?pack|4 ?pack|kit|combo' },
  { id: 'viparspectra-xs1000', q: 'VIPARSPECTRA+XS1000+LED+grow+light', m: 'vipar.?spectra.*xs-?1000|xs-?1000.*vipar' },
  { id: 'viparspectra-p2000', q: 'VIPARSPECTRA+P2000+LED+grow+light', m: 'vipar.?spectra.*p-?2000|p-?2000.*vipar' },
  { id: 'spider-farmer-sf-3000', q: 'Spider+Farmer+SF-3000+LED+grow+light', m: 'spider.?farmer.*sf-?3000|sf-?3000.*spider', x: '2 ?pack|4 ?pack' },
  { id: 'spider-farmer-sf-7000', q: 'Spider+Farmer+SF7000+LED+grow+light', m: 'spider.?farmer.*sf-?7000|sf-?7000.*spider|sf7000', x: '2 ?pack' },
  { id: 'ac-infinity-ionframe-evo3', q: 'AC+Infinity+IONFRAME+EVO3+LED+grow+light', m: 'ac.?infinity.*ionframe.*evo3|ionframe.?evo3|evo3.*ionframe' },
  { id: 'ac-infinity-ionframe-evo8', q: 'AC+Infinity+IONFRAME+EVO8+LED+grow+light', m: 'ac.?infinity.*ionframe.*evo8|ionframe.?evo8|evo8.*ionframe' },
  { id: 'mars-hydro-fc-4800', q: 'Mars+Hydro+FC-4800+LED+grow+light', m: 'mars.?hydro.*fc-?4800|fc-?4800.*mars', x: '2 ?pack|evo|tent|kit' },
  { id: 'hlg-300l-rspec', q: 'HLG+300L+RSpec+LED+grow+light', m: '300l.*rspec|rspec.*300l' },
  { id: 'migro-aray-4', q: 'Migro+Aray+4+LED+grow+light', m: 'migro.*aray.?4|aray.?4.*migro' },
  { id: 'gavita-1700e', q: 'Gavita+1700E+LED+grow+light', m: 'gavita.*1700|1700e' },
  { id: 'bloom-plus-xp-2500', q: 'BloomPlus+XP-2500+LED+grow+light', m: 'bloom.?plus.*xp-?2500|xp-?2500.*bloom' },
  { id: 'medicgrow-fold-8', q: 'Medic+Grow+Fold-8+LED+grow+light', m: 'medic.?grow.*fold.?8|fold.?8.*medic' },
  { id: 'kind-led-x750', q: 'Kind+LED+X750+LED+grow+light', m: 'kind.*x750|x750.*kind' },
  { id: 'hlg-650-r-spec', q: 'HLG+650R+RSpec+LED+grow+light', m: '650r.*rspec|rspec.*650r|650r' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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

  await send('Runtime.evaluate', { expression: "document.title='glserp-tab'" });

  const scrape = async (q, matchRe, excludeRe, label) => {
    const url = 'https://www.amazon.com/s?k=' + q;
    await send('Page.navigate', { url });
    await sleep(3000);
    // force USD (cookie must be set while on amazon.com)
    await send('Runtime.evaluate', {
      expression: `document.cookie = 'i18n-prefs=USD; domain=.amazon.com; path=/; max-age=31536000'; document.cookie = 'lc-main=en_US; domain=.amazon.com; path=/; max-age=31536000';`,
    });
    await send('Page.reload', {});
    await sleep(3000);

    let state = null;
    for (let i = 0; i < 20; i++) {
      const r = await send('Runtime.evaluate', {
        expression: `(() => {
          try {
            const n = Array.from(document.querySelectorAll('div[data-asin]')).filter(el => {
              const h2 = el.querySelector('h2');
              return el.getAttribute('data-asin') && h2 && (h2.className.indexOf('a-text-normal') !== -1 || h2.hasAttribute('aria-label'));
            }).length;
            const err = !!document.querySelector('img[alt*="Dogs of Amazon"]');
            return JSON.stringify({n, err});
          } catch (e) { return JSON.stringify({n:0, err:false}); }
        })()`,
        returnByValue: true,
      });
      const raw = r && r.result && r.result.value;
      state = raw ? JSON.parse(raw) : { n: 0, err: false };
      if (state.n > 2 || state.err) break;
      await sleep(1500);
    }
    if (!state || state.err || state.n === 0) {
      return { label, blocked: true };
    }
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const seen = {};
        const out = [];
        document.querySelectorAll('div[data-asin]').forEach(el => {
          const asin = el.getAttribute('data-asin');
          if (!asin || seen[asin]) return;
          const h2 = el.querySelector('h2');
          if (!h2) return;
          // real product cards carry a-text-normal class or an aria-label; sponsor brand tiles have only a-size-mini
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
          const ratingEl = el.querySelector('span.a-icon-alt');
          const rating = ratingEl ? ratingEl.innerText.trim() : '';
          const sponsored = !!el.querySelector('.puis-sponsored-label-text, span.puis-sponsored-label-text');
          out.push({asin, title: title.slice(0, 160), price, rating, sponsored});
        });
        return JSON.stringify(out);
      })()`,
      returnByValue: true,
    });
    let results = [];
    const raw = r && r.result && r.result.value;
    if (raw) { try { results = JSON.parse(raw); } catch (e) { results = []; } }
    const ranked = results.map((x, i) => Object.assign({}, x, { pos: i }));
    const matched = ranked.filter((x) => matchRe.test(x.title) && (!excludeRe || !excludeRe.test(x.title)) && !x.sponsored);
    const brandish = ranked.filter((x) => !matched.includes(x) && x.title.length > 8);
    return { label, blocked: false, matched: matched.slice(0, 5), brandish: brandish.slice(0, 4) };
  };

  for (const p of PRODUCTS) {
    const res = await scrape(p.q, new RegExp(p.m, 'i'), p.x ? new RegExp(p.x, 'i') : null, p.id);
    if (res.blocked) {
      console.log('B\t' + p.id);
    } else if (res.matched.length === 0) {
      console.log('N\t' + p.id + '\t' + JSON.stringify(res.brandish.map(b => ({ asin: b.asin, pr: b.price, tt: b.title.slice(0, 80), sp: b.sponsored }))));
    } else {
      for (const m of res.matched) {
        console.log('H\t' + p.id + '\t' + JSON.stringify({ asin: m.asin, price: m.price, rating: m.rating, pos: m.pos, title: m.title.slice(0, 110) }));
      }
    }
    await sleep(2500 + Math.floor(Math.random() * 2000));
  }
  ws.close();
}
main().catch((e) => console.error('FATAL', String(e && e.stack ? e.stack : e)));