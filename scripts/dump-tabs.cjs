const http = require('http');
function httpReq(method, path, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port: 9222, method, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evalIn(wsUrl, expr) {
  const ws = new WebSocket(wsUrl);
  let msgId = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const mid = ++msgId; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  ws.close();
  return r;
}
async function main() {
  const list = JSON.parse(await httpReq('GET', '/json/list'));
  const pages = list.filter(t => t.type === 'page' && t.url.includes('amazon.com'));
  console.log('N=' + pages.length);
  for (const p of pages) {
    try {
      const r = await evalIn(p.webSocketDebuggerUrl, "JSON.stringify({t:document.title, u:location.href, h1:(document.querySelector('#title,#productTitle')||{}).innerText||'', price:(document.querySelector('#corePrice_feature_div .a-offscreen, .priceToPay .a-offscreen, #priceblock_ourprice, #price_inside_buybox')||{}).innerText||'', ap:(document.querySelector('.a-price .a-offscreen')||{}).innerText||'', asin:document.querySelector('input#ASIN, input[name=ASIN]')?document.querySelector('input#ASIN, input[name=ASIN]').value:''})");
      console.log('TAB\t' + p.title.slice(0,60) + '\t' + (r.result && r.result.value ? r.result.value.slice(0,600) : 'ERR:' + JSON.stringify(r.result && r.result.description || r.exceptionDetails || 'no value')));
    } catch (e) { console.log('ERRTAB\t' + p.title.slice(0,40) + '\t' + e.message); }
    await sleep(300);
  }
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', String(e)); process.exit(1); });
