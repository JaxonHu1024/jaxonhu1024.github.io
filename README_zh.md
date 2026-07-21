# JAXON — 赛博终端个人主页

[English](./README.md) · **简体中文**

> `›_ COMPILING INTELLIGENCE FOR THE REAL WORLD`

[jaxonhu1024.github.io](https://jaxonhu1024.github.io) 的完整源码——一个单页、
赛博终端风格的个人作品集。站点经服务端渲染后导出为纯静态产物，并由 CI 自动部署到
GitHub Pages。生成的产物刻意不纳入版本管理，一切都从源码构建。

## 技术栈

| 分层     | 选型                                              |
| -------- | ------------------------------------------------- |
| UI       | React 19 + TypeScript                             |
| 框架     | Next.js 16 App Router，经 **vinext** 编译          |
| 构建     | Vite 8，运行于 Cloudflare Workers 运行时（Wrangler）|
| 样式     | Tailwind CSS 4 + 手写 `globals.css`               |
| 字体     | Oxanium（可变字体）· IBM Plex Mono                 |
| 部署     | 静态导出 → GitHub Actions → GitHub Pages           |

## 亮点

- **默认静态。** 页面通过 Cloudflare Worker 入口做服务端渲染，再导出为纯 HTML——
  无需客户端 JavaScript 即可阅读全部内容。
- **无障碍动效。** 首屏与研究区的环境动画在离屏时通过 `IntersectionObserver` 暂停，
  并在 `prefers-reduced-motion` 下完全关闭。
- **可打断的滚动。** 页内导航采用平滑滚动，任意用户输入（滚轮 / 触摸 / 按键）都能立即
  打断，并实时跟踪当前所在区块。
- **精心的无障碍设计。** 提供跳转链接、可聚焦的地标区块，以及贯穿全站的 ARIA 标注。
- **动态元数据。** SEO 与 Open Graph 标签按请求从转发的 host 派生，同一份源码可服务
  任意来源域名。

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
| `npm run lint`                  | 对源码运行 ESLint。                                   |
| `npm test`                      | 先构建，再运行渲染 HTML 与可打断滚动测试。            |
| `npm run export:github-pages`   | 构建并将静态 Pages 产物导出到 `github-pages-dist/`。  |
| `npm run test:export`           | 校验导出产物的完整性。                                |
| `npm run verify`                | 完整校验：lint → test → export → 导出校验。           |

## 校验

```bash
npm run verify
```

该命令会执行代码检查、生产构建、服务端渲染 HTML 校验、静态 GitHub Pages 导出，以及
导出完整性检查。若只想生成可部署产物：

```bash
npm run export:github-pages
```

## 部署

每次推送到 `main` 都会触发 [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)。该工作流会：

1. 安装锁定的依赖（`npm ci`）；
2. 运行完整校验套件（`npm run verify`）；
3. 将 `github-pages-dist/` 作为 Pages 产物上传；
4. 部署到 `github-pages` 环境。

## 项目结构

```
app/                 页面源码、React 组件与样式
├─ components/        Navigation、HeroSignalField、ResearchVisual
├─ lib/               可打断滚动的辅助函数
├─ layout.tsx         根布局 + 动态元数据
├─ page.tsx           单页作品集内容
└─ globals.css        赛博终端设计系统
public/               纳入版本管理的图片与元数据资源
scripts/              确定性的静态导出工具
tests/                渲染产物与导出完整性测试
worker/               vinext / Cloudflare Worker 构建入口
.github/workflows/    GitHub Pages 自动部署
```
