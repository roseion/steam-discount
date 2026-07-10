'use strict';

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch (e) { return iso || ''; }
}

function statusText(s) {
  if (s === '打破历史低价') return 'break';
  return 'tie';
}

function cardHTML(g) {
  const isBreak = statusText(g.status) === 'break';
  const tagCls = isBreak ? 'break' : 'tie';
  const tagTxt = isBreak ? '突破史低' : (g.status === '接近历史低价' ? '接近史低' : '平史低');
  const title = g.cnName
    ? `<div class="card-title">${esc(g.name)}<div class="cn">${esc(g.cnName)}</div></div>`
    : `<div class="card-title">${esc(g.name)}</div>`;
  const meta = [];
  if (g.rating != null) meta.push(`<span class="rating">好评 ${g.rating}%</span>`);
  if (g.metacritic != null) meta.push(`<span class="meta">MC ${g.metacritic}</span>`);
  const metaHtml = meta.length ? `<div class="card-meta">${meta.join('')}</div>` : '';
  const oldPrice = g.histLow && g.histLow !== g.currentPrice
    ? `<span class="price-old">${esc(g.histLow)}</span>` : '';
  const lowDate = g.histLowDate ? `<div class="card-lowdate">历史低价日期：${esc(g.histLowDate)}</div>` : '';
  return `
  <article class="card">
    <div class="card-img">
      <img src="${esc(g.image)}" alt="${esc(g.name)}" loading="lazy" onerror="this.src='https://cdn.cloudflare.steamstatic.com/steam/apps/${esc(g.appid)}/capsule_184x69.jpg'">
      <span class="card-tag ${tagCls}">${tagTxt}</span>
      ${g.discountPct != null ? `<span class="card-discount">-${g.discountPct}%</span>` : ''}
    </div>
    <div class="card-body">
      ${title}
      ${metaHtml}
      <div class="card-price">
        <span class="price-now">${esc(g.currentPrice || '—')}</span>
        ${oldPrice}
        <span class="price-low">史低 ${esc(g.histLow || '—')}</span>
      </div>
      ${lowDate}
      <div class="card-actions">
        <a href="${esc(g.steamUrl)}" target="_blank" rel="noopener">在 Steam 查看</a>
      </div>
    </div>
  </article>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function render(data) {
  const gridBreak = document.getElementById('gridBreak');
  const gridTie = document.getElementById('gridTie');
  gridBreak.innerHTML = data.break_.length
    ? data.break_.map(cardHTML).join('')
    : '<div class="empty">今天没有检测到突破史低的游戏，记得常来刷新～</div>';
  gridTie.innerHTML = data.tie.length
    ? data.tie.map(cardHTML).join('')
    : '<div class="empty">暂无平史低游戏。</div>';
  document.getElementById('cntBreak').textContent = data.break_.length;
  document.getElementById('cntTie').textContent = data.tie.length;
  document.getElementById('updatedAt').textContent = fmtDate(data.generatedAt);
}

function showStatus(msg, type) {
  const el = document.getElementById('statusBar');
  el.textContent = msg;
  el.className = 'notice' + (type ? ' ' + type : '');
}

function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  const data = window.__GAMES__;
  if (!data) {
    showStatus('未找到数据文件 data.js，请先运行抓取：node run_scrape.js', 'err');
    return;
  }
  render(data);

  const btn = document.getElementById('refreshBtn');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    showStatus('正在重新抓取 yxdzqb.com 数据，请稍候…');
    try {
      const r = await fetch('refresh?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      showStatus(txt, 'ok');
      // 重新加载 data.js
      const s = document.createElement('script');
      s.src = 'data.js?ts=' + Date.now();
      s.onload = () => { render(window.__GAMES__); btn.disabled = false; };
      document.body.appendChild(s);
    } catch (e) {
      showStatus('刷新失败：' + e.message + '（你也可以直接在终端运行 node run_scrape.js）', 'err');
      btn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
