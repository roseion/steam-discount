'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('./run_scrape');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // 手动刷新接口（保护：仅本地）
  if (url.pathname === '/refresh') {
    const ip = req.socket.remoteAddress || '';
    if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
      res.writeHead(403); return res.end('forbidden');
    }
    build().then(r => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`已更新：突破史低 ${r.break_.length} / 平史低 ${r.tie.length}`);
    }).catch(e => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('刷新失败: ' + e.message);
    });
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p.replace(/\.\.+/g, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  sendFile(res, file);
});

// ---------- 每日定时抓取 ----------
// 默认每天 13:00（北京时间，Asia/Shanghai）执行一次。
const SCHED_HOUR = parseInt(process.env.SCHED_HOUR || '13', 10);
const SCHED_MIN = parseInt(process.env.SCHED_MIN || '0', 10);

function scheduleDaily() {
  const now = new Date();
  // 用上海时区计算下次触发
  const tz = 'Asia/Shanghai';
  const nowSh = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const next = new Date(nowSh);
  next.setHours(SCHED_HOUR, SCHED_MIN, 0, 0);
  if (next <= nowSh) next.setDate(next.getDate() + 1);
  const delay = next - nowSh;
  console.log(`[定时] 下次抓取：${next.toLocaleString('zh-CN', { timeZone: tz })}（${Math.round(delay / 60000)} 分钟后）`);
  setTimeout(async () => {
    console.log('[定时] 开始每日抓取…');
    try { const r = await build(); console.log(`[定时] 完成 突破史低=${r.break_.length} 平史低=${r.tie.length}`); }
    catch (e) { console.error('[定时] 抓取失败', e.message); }
    scheduleDaily(); // 递归排下一天
  }, delay);
}

server.listen(PORT, () => {
  console.log(`Steam打折网 已启动: http://localhost:${PORT}`);
  scheduleDaily();
});
