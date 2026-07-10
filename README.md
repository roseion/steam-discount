# Steam 打折网

每日抓取**国区 Steam 历史低价**，自动区分「**突破史低**」与「**平史低**」两大板块。
数据来源：[游戏打折情报 yxdzqb.com](https://www.yxdzqb.com/)。

> 说明：SteamDB 有 Cloudflare 反爬且无公开 API，无法直接稳定抓取；本项目的「突破史低」判定来自 yxdzqb 已标注的历史低价状态（打破/持平/接近历史低价），这是业界通用做法。

## 文件说明

| 文件 | 作用 |
|------|------|
| `scraper.js` | 抓取并解析 yxdzqb 历史低价页（中/英文），输出结构化游戏数据 |
| `run_scrape.js` | 合并中/英两页、去重、分类（突破史低/平史低），生成 `data.json` 与 `data.js` |
| `data.js` | 前端直接读取的数据（`window.__GAMES__`），**双击 index.html 也能离线打开** |
| `data.json` | 同数据的 JSON 版，供接口/程序消费 |
| `index.html` / `style.css` / `app.js` | 前端页面（Steam 暗色风格、响应式卡片、双板块） |
| `server.js` | 本地静态服务器 + `/refresh` 手动刷新接口 + 内置每日 13:00 定时抓取 |
| `install_taskscheduler.js` | （Windows）注册系统任务计划，每天自动抓取（需管理员权限） |

## 快速开始

### 1. 抓取一次数据
```bash
node run_scrape.js
```
生成 `data.json` 与 `data.js`。

### 2. 启动网站（推荐）
```bash
node server.js
```
打开 http://localhost:8080 —— 页面自带「↻ 刷新」按钮，点击即重新抓取（仅限本机）。

### 或：直接打开（无需服务器）
双击 `index.html` 即可查看（数据来自 `data.js`）。

## 每日自动更新

两种方式，任选其一：

- **方式 A（最简单）**：保持 `node server.js` 一直运行，它内置每天 13:00（北京时间）自动抓取。
- **方式 B（系统级，关机也跑）**：用管理员 PowerShell 运行：
  ```powershell
  schtasks /Create /TN "SteamDiscountDaily" /TR '"C:\path\to\node.exe" "C:\path\to\run_scrape.js"' /SC DAILY /ST 13:05 /F /RL HIGHEST
  ```
  （脚本 `install_taskscheduler.js` 已生成该命令，普通权限会因「拒绝访问」失败，需管理员。）

## 免责声明
本站为个人学习/展示项目，价格数据来自第三方公开页面，可能存在延迟或误差，请以 Steam 官方商店实际价格为准。本站与 Valve / Steam 无任何隶属关系。

联系方式：QQ 638694
