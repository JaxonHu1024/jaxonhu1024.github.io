# JAXON — 信号排版个人主页

[English](./README.md) · **简体中文**

> 将模型能力转化为真实世界中的可用系统。

[jaxonhu1024.github.io](https://jaxonhu1024.github.io) 的完整源码——一个单页、
以信号排版为核心的个人作品集。站点经服务端渲染后导出为纯静态产物，并由 CI 自动部署到
GitHub Pages。构建产物不纳入版本管理；经过隐私收缩的旅行聚合会纳入版本管理，确保每个
干净检出都发布同一份已审查数据。

## 技术栈

| 分层     | 选型                                              |
| -------- | ------------------------------------------------- |
| UI       | React 19 + TypeScript                             |
| 框架     | Next.js 16 App Router，经 **vinext** 编译          |
| 构建     | Vite 8，运行于 Cloudflare Workers 运行时（Wrangler）|
| 样式     | Tailwind CSS 4 + 手写组件样式                        |
| 字体     | Oxanium Variable · Geist Variable · IBM Plex Mono   |
| 部署     | 静态导出 → GitHub Actions → GitHub Pages           |

## 亮点

- **默认静态。** 页面通过 Cloudflare Worker 入口做服务端渲染，再导出为纯 HTML——
  无需客户端 JavaScript 即可阅读全部内容。
- **无障碍动效。** 首屏与研究区的环境动画在离屏时通过 `IntersectionObserver` 暂停，
  并在 `prefers-reduced-motion` 下完全关闭。
- **可打断的滚动。** 页内导航采用平滑滚动，任意用户输入（滚轮 / 触摸 / 按键）都能立即
  打断，并实时跟踪当前所在区块。
- **精心的无障碍设计。** 提供跳转链接、可聚焦的地标区块，以及贯穿全站的 ARIA 标注。
- **静态发布元数据。** canonical、Open Graph、Twitter Card、robots 与 sitemap 均按
  GitHub Pages 域名确定性生成。
- **隐私安全的旅行足迹。** Flighty 数据仅在构建前生成机场与航线聚合，原始行程细节始终
  保留在本地。

## 环境要求

- Node.js `>=22.13.0`

## 本地开发

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000>。

## npm 脚本

| 脚本                            | 用途                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `npm run dev`                   | 在 `http://localhost:3000` 启动本地开发服务器。       |
| `npm run build`                 | 生成生产构建。                                        |
| `npm run start`                 | 在本地运行生产构建。                                  |
| `npm run typecheck`             | 运行全仓库 TypeScript 类型契约。                      |
| `npm run lint`                  | 对源码运行 ESLint。                                   |
| `npm test`                      | 先构建，再运行源码、SSR、导航与动效测试。              |
| `npm run export:github-pages`   | 构建并将静态 Pages 产物导出到 `github-pages-dist/`。  |
| `npm run test:export`           | 校验导出产物的完整性。                                |
| `npm run test:browser`          | 运行浏览器、8 视口与 Web Vitals 发布校验。             |
| `npm run test:travel`           | 校验 Flighty 解析、隐私边界与确定性输出。               |
| `npm run travel:sync -- <csv>`  | 从 Flighty CSV 刷新纳入版本管理的旅行聚合。             |
| `npm run optimize:svg`          | 确定性重新压缩组织标志 SVG。                           |
| `npm run verify`                | 完整校验：类型 → lint → 测试 → 导出 → 浏览器校验。     |

## 校验

```bash
npm run verify
```

该命令会执行 TypeScript 与 lint 检查、生产构建、服务端渲染 HTML 校验、静态 GitHub
Pages 导出、8 个精确视口校验，以及移动端 Core Web Vitals 校验。若只想生成可部署产物：

```bash
npm run export:github-pages
```

## 更新旅行地图

Flighty 导出可能包含精确日期、预订编号、座位、登机口和稳定标识符。原始文件不要放入
公开源码，只生成隐私安全的聚合数据：

```bash
npm run travel:sync -- /path/to/FlightyExport.csv
npm run verify
```

导入器会把重复航段和反向航段合并成一条走廊；只有两个方向都真实出现时，才将其标记为
双向。同步日期之后的未来航班不会进入公开足迹。写入 `app/data/travel.generated.json` 的
公开投影只保留机场/国家或地区/走廊计数、机场展示坐标与访问次数，以及走廊次数/方向性；普通构建不会读取
私有 CSV。机场元数据来自公有领域的 [OurAirports 数据集](https://ourairports.com/data/)，实心底图来自公有领域的
[Natural Earth 数据](https://www.naturalearthdata.com/)。本地更新流程详见
[`data/private/README.md`](./data/private/README.md)。

## 部署

每次推送到 `main` 都会触发 [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)。该工作流会：

1. 安装锁定的依赖（`npm ci`）；
2. 运行完整校验套件（`npm run verify`）；
3. 将 `github-pages-dist/` 作为 Pages 产物上传；
4. 部署到 `github-pages` 环境。

## 项目结构

```
app/                  页面源码、React 组件与样式
├─ components/        导航、像素肖像与研究可视化
├─ data/              隐私安全的旅行聚合数据
├─ lib/               可打断滚动与动效辅助函数
├─ layout.tsx         根布局 + 静态发布元数据
├─ page.tsx           单页作品集内容
└─ globals.css        深色信号视觉系统
public/               纳入版本管理的图片与元数据资源
data/private/          Git 忽略的原始旅行数据暂存区
scripts/              确定性的静态导出工具
tests/                渲染产物与导出完整性测试
worker/               vinext / Cloudflare Worker 构建入口
.github/workflows/    GitHub Pages 自动部署
```
