'use strict';
const fs = require('fs');
const path = require('path');
const { scrape } = require('./scraper');

const BASE = 'https://www.yxdzqb.com/';

function sortGames(arr) {
  // 折扣力度大、现价低 优先
  return arr.sort((a, b) => {
    if ((b.discountPct || 0) !== (a.discountPct || 0)) return (b.discountPct || 0) - (a.discountPct || 0);
    return (a.currentPriceNum || 0) - (b.currentPriceNum || 0);
  });
}

async function build() {
  console.log('[抓取] 中文游戏历史低价 ...');
  const cn = await scrape(BASE, ['index_low_cn.html']);
  console.log(`  中文: 总=${cn.all.length} 突破史低=${cn.break_.length} 平史低=${cn.tie.length}`);

  console.log('[抓取] 热门游戏历史低价 ...');
  const en = await scrape(BASE, ['index_low.html']);
  console.log(`  英文: 总=${en.all.length} 突破史低=${en.break_.length} 平史低=${en.tie.length}`);

  // 合并去重：cn 优先（含中文名）；同 appid 取 status 更“强”的（突破 > 平）
  const strength = s => s === '打破历史低价' ? 2 : (s === '持平历史低价' || s === '接近历史低价' ? 1 : 0);
  const richness = g => (g.histLow ? 1 : 0) + (g.cnName ? 1 : 0);
  const map = new Map();
  for (const g of en.all) map.set(g.appid, g);
  for (const g of cn.all) {
    const ex = map.get(g.appid);
    if (!ex || strength(g.status) > strength(ex.status) || richness(g) > richness(ex)) map.set(g.appid, g);
  }
  const all = [...map.values()];

  const result = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.yxdzqb.com/',
    total: all.length,
    break_: sortGames(all.filter(g => g.status === '打破历史低价')),
    tie: sortGames(all.filter(g => g.status === '持平历史低价' || g.status === '接近历史低价')),
  };

  // 写 data.json（便于程序/接口消费）
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(result, null, 2), 'utf8');

  // 写 data.js（window.__GAMES__，供 index.html 通过 <script> 直接打开使用）
  const js = 'window.__GAMES__ = ' + JSON.stringify(result) + ';\n';
  fs.writeFileSync(path.join(__dirname, 'data.js'), js, 'utf8');

  console.log(`[完成] 突破史低=${result.break_.length} 平史低=${result.tie.length} → data.json / data.js`);
  return result;
}

module.exports = { build };

if (require.main === module) {
  build().catch(e => { console.error('FATAL', e); process.exit(1); });
}
