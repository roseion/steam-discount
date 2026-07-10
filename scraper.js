'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchText(next));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, url }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout ' + url)));
  });
}

function g_status_is_break(block) {
  return /打破历史低价/.test(block);
}
function splitBlocks(html) {
  const blocks = [];
  const marker = '<tr class=bg-none>';
  let start = html.indexOf(marker);
  while (start !== -1) {
    const next = html.indexOf(marker, start + marker.length);
    const block = next === -1 ? html.slice(start + marker.length) : html.slice(start + marker.length, next);
    blocks.push(block);
    if (next === -1) break;
    start = next;
  }
  return blocks;
}

// parse one <tr class=bg-none>...</tr> block
function parseBlock(block) {
  const get = (re, def) => { const m = block.match(re); return m ? m[1].trim() : def; };

  const name = get(/<span><b>([^<]+)<\/b><\/span>/);
  if (!name) return null;

  // chinese name: second span inside the title row
  const cnMatch = block.match(/<span><b>[^<]+<\/b><\/span><br><span>([^<]*)<\/span>/);
  const cnName = cnMatch ? cnMatch[1].trim() : '';

  // appid from capsule image or steam link
  let appid = null;
  const cap = block.match(/\/apps\/(\d+)\/capsule_184x69\.jpg/);
  if (cap) appid = cap[1];
  if (!appid) { const sl = block.match(/store\.steampowered\.com\/app\/(\d+)/); if (sl) appid = sl[1]; }

  const capsule = cap ? block.match(/\/\/media\.st\.dl\.eccdnx\.com\/steam\/apps\/\d+\/capsule_184x69\.jpg/)?.[0] : null;
  const image = capsule ? 'https:' + capsule : (appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_184x69.jpg` : null);

  // 折扣与现价：锚定价格单元格 -NN%&nbsp;<b>￥X</b>
  const priceRaw = block.match(/-(\d+)%&nbsp;<b>\D*?(￥\d+)<\/b>/);
  let discountPct = priceRaw ? parseInt(priceRaw[1], 10) : null;
  const currentPrice = priceRaw ? priceRaw[2] : null;
  const currentPriceNum = priceRaw ? parseInt(priceRaw[2].replace(/[^\d]/g, ''), 10) : null;
  // 理智校验：史低/打折页里 100% 折扣几乎必为误读（与非零现价矛盾），不展示
  if (discountPct === 100) discountPct = null;

  const ratingM = block.match(/Steam_icon_small\.png>&nbsp;<b>(\d+)<\/b>/);
  const rating = ratingM ? parseInt(ratingM[1], 10) : null;
  const metaM = block.match(/Metacritic_small\.png>&nbsp;<b>(\d+)<\/b>/);
  const metacritic = metaM ? parseInt(metaM[1], 10) : null;

  // status: 打破/持平/接近/当前没有定价 (may be wrapped in <b>)
  const statusM = block.match(/(打破历史低价|持平历史低价|接近历史低价|当前没有定价)/);
  let status = statusM ? statusM[1] : '未知';

  // 历史低价行：价格可能被 <b>/<span> 包裹，允许符号与数字间有标签；符号也可能是 ￥/¥
  const histLowM = block.match(/历史低价[^\d]{0,40}?(\d+)/);
  let histLow = histLowM ? '￥' + histLowM[1] : null;
  let histLowNum = histLowM ? parseInt(histLowM[1], 10) : null;
  // 突破史低时，当前价即为新史低（兜底，保证字段完整）
  if (!histLow && g_status_is_break(block)) {
    histLow = currentPrice || null;
    histLowNum = currentPriceNum;
  }
  const histLowDateM = block.match(/历史低价日期：([\d-]+)/);
  const histLowDate = histLowDateM ? histLowDateM[1] : null;

  const releaseM = block.match(/上市日期：([\d-]+)/);
  const releaseDate = releaseM ? releaseM[1] : null;

  if (!appid) return null;

  return {
    appid, name, cnName, image,
    discountPct, currentPrice,
    rating, metacritic,
    status, histLow, histLowDate, releaseDate,
    currentPriceNum, histLowNum,
    steamUrl: `https://store.steampowered.com/app/${appid}/`
  };
}

function classify(g) {
  if (g.status === '打破历史低价') return 'break';      // 突破史低
  if (g.status === '持平历史低价' || g.status === '接近历史低价') return 'tie'; // 平史低
  return 'other';
}

async function scrapeListPage(url) {
  const r = await fetchText(url);
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' for ' + url);
  const blocks = splitBlocks(r.body);
  const games = [];
  for (const block of blocks) {
    const g = parseBlock(block);
    if (g) games.push(g);
  }
  // pagination links
  const pages = [...new Set([...r.body.matchAll(/href=(index_low(?:_cn)?_p?\d*\.html)/g)].map(m => m[1]))];
  return { games, pages };
}

async function scrape(baseUrl, listPages) {
  const seen = new Map();
  const pageQueue = [...listPages];
  const visited = new Set();
  while (pageQueue.length) {
    const p = pageQueue.shift();
    if (visited.has(p)) continue;
    visited.add(p);
    const url = new URL(p, baseUrl).toString();
    try {
      const { games, pages } = await scrapeListPage(url);
      for (const g of games) {
        if (!seen.has(g.appid)) seen.set(g.appid, g);
      }
      for (const np of pages) if (!visited.has(np)) pageQueue.push(np);
    } catch (e) {
      console.error('  ! failed', url, e.message);
    }
  }
  const all = [...seen.values()];
  const break_ = all.filter(g => classify(g) === 'break');
  const tie = all.filter(g => classify(g) === 'tie');
  const other = all.filter(g => classify(g) === 'other');
  return { all, break_, tie, other, generatedAt: new Date().toISOString(), source: baseUrl };
}

module.exports = { scrape, parseBlock, scrapeListPage, splitBlocks };

// CLI test mode: node scraper.js test <file>
if (require.main === module && process.argv[2] === 'test') {
  const f = process.argv[3] || 'low.html';
  const html = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const blocks = splitBlocks(html);
  let n = 0, ok = 0;
  const sample = [];
  for (const block of blocks) {
    const g = parseBlock(block);
    if (g) { ok++; if (sample.length < 6) sample.push(g); }
    n++;
  }
  console.log(`blocks=${n} parsed=${ok}`);
  console.log(JSON.stringify(sample, null, 2));
}
