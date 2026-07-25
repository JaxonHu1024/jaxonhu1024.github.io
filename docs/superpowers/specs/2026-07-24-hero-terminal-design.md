# Hero 动态终端替换设计规格

- 日期：2026-07-24
- 状态：已实施（详见 §13 实施记录）
- 作者：Agent（经用户逐节确认）
- 影响范围：首页 Hero 视觉主体（芯片图 + Canvas 信号层 → 动态终端）

## 1. 目标与背景

将首页 Hero 右侧的静态芯片图（`hero-processor-field-optimized.webp`）与
其叠加的 Canvas 信号层（`HeroSignalField`）整体替换为一个**自动演算的构建终端**，
呼应主标语 `COMPILING INTELLIGENCE FOR THE REAL WORLD_`，把"编译智能"从文字
隐喻升级为可见的构建过程。

设计参考用户提供的浅色终端截图（窗口三点、命令行、时间戳日志、版本行、进度条），
但**配色、字体、质感全部沿用现网赛博终端深色主题**，不引入参考图的浅色桌面外观。

### 成功标准

1. 终端在首页加载后自动开始"编译"演算，无需任何用户输入。
2. 完全复用现有配色（`--void / --terminal / --mint / --violet / --coral / --text`）、
   字体（IBM Plex Mono / Oxanium）与网格底纹，视觉上像原生模块而非外挂控件。
3. 在 8 个响应式断点（见 §8）下，终端**不与 Hero 姓名、标语、CTA 发生几何重叠或遮挡**，
   且无横向溢出、无裁切。
4. 动效可被 `IntersectionObserver`（离屏）、`visibilitychange`（切后台）、
   `prefers-reduced-motion`（无障碍）三重降级；离屏与后台时零 `requestAnimationFrame`。
5. 满足 AGENTS.md 的发布性能门禁：LCP ≤ 2.5s、INP ≤ 300ms、CLS ≤ 0.1；
   终端容器有稳定的 `aspect-ratio`/尺寸占位，加载不产生布局跳动。
6. `npm run verify` 全绿（含 lint、SSR HTML 校验、静态导出、导出完整性、浏览器发布门禁）。

## 2. 关键决策（已确认）

| 维度 | 决策 |
| --- | --- |
| 交互深度 | **自动演算**：终端不接管鼠标/键盘/触控，Hero CTA 仍是唯一主要操作目标 |
| 内容叙事 | **个人能力编译**：围绕 AI systems / research / production / real-world 展开，英文 |
| 循环节奏 | **完成后静置再重启**：一轮 ~14.7s，成功态停留后柔和淡出并重启 |
| 技术路径 | **DOM + CSS 动画 + 轻量 React 阶段状态机**（非纯 CSS、非全量 Canvas） |
| 外壳构图 | **方案 A：框架式构建窗口**（深色半透明窗口 + 三点状态灯，最贴近参考图） |
| 硬约束 | 终端**不得覆盖/重叠**其他 Hero 元素（用户最终强调） |

## 3. 架构与组件边界

替换遵循"最小侵入、职责隔离"原则，与现有 Hero 生命周期对齐。

### 3.1 组件划分

- **`HeroTerminal`（新增，client component）**
  - 位置：`app/components/HeroTerminal.tsx`
  - 职责：渲染框架式终端窗口的**完整 DOM 结构**（窗口条 + 命令行 + 日志区 + 版本/进度页脚），
    并驱动一个 **6 阶段状态机**（见 §5）控制 `data-phase` / `data-step` 数据属性与进度百分比。
  - 输入依赖：无 props；日志文案与阶段时序内置为模块级常量（便于测试断言与静态导出）。
  - 输出接口：向宿主 DOM 写入 `data-phase`（如 `booting/compiling/linking/ready/idle`）、
    `data-motion`（`running/reduced`），CSS 据此驱动过渡；不向父组件回调。
  - 生命周期：所有过渡由 CSS `transition`/`animation` 完成；React 仅在**阶段切换**（约每
    2–3s 一次，全循环 ~6 次 setState）时更新，**不逐字符 setState**，避免高频重渲染。

- **`HeroSignalField`（移除）**：Canvas 信号层删除；其 `data-motion-layer="hero-flow"` 语义
  由 `HeroTerminal` 承接（见 §9 测试影响）。

- **`app/page.tsx`（修改）**：`.hero-media` 内的 `<img>` + `<HeroSignalField />` 替换为
  `<HeroTerminal />`。`.hero-media` 容器、`aria-hidden`、层级保留。

- **`HeroInteractionController`（基本不变）**：
  - `useHeroExperienceNavigation`（CTA 可打断滚动）完全保留。
  - `useHeroMediaVisibility` 保留：仍以 `.hero-media` 为观察目标，写入
    `data-hero-visible`；供 CSS 暂停终端环境动画（替代原 `img` 的 `animation-play-state`）。
  - `useSectionMotionVisibility` 不变。

- **`MobileLoadFeedback`（逻辑不变，测试期望调整）**：
  它等待 `document.fonts.ready` + 所有非懒加载 `<img>`。移除芯片大图后，
  首屏不再有该主图；终端为纯 DOM/文本，加载反馈将主要由字体就绪驱动，等待更短。
  组件代码无需改动，仅需更新依赖该图 URL 的浏览器门禁测试（见 §9）。

### 3.2 运行数据流

```
页面加载 (SSR 输出完整终端静态 DOM，首屏即可读)
        │
        ▼
HeroTerminal 挂载 (client)
        │  读取 prefers-reduced-motion
        ├─ reduced  → 直接渲染 "ready" 静态终态，不启动计时器
        └─ running  → 启动阶段状态机 (setTimeout 链 / rAF 进度)
                          │
        IntersectionObserver(.hero-media) ──► data-hero-visible=false → CSS 暂停 + 清计时器
        visibilitychange (hidden) ─────────► 暂停；可见时恢复
                          │
                      CSS transition 承载所有视觉过渡
                          │
                   一轮完成 → idle 静置 → 淡出 → 重启
```

### 3.3 SSR / 静态导出兼容

- 终端 DOM 结构在服务端渲染时即完整输出（含首帧命令行与首条日志的静态形态），
  保证 JS 未执行/被拦截时首页仍呈现一个"静态终端"，符合 README "Static by default"。
- 无外部资源请求（无新增图片/字体）；文案为内联文本，随 HTML 一同静态导出。

## 4. 视觉设计（沿用现有主题）

### 4.1 外壳（方案 A）

- 窗口容器：`background: rgba(3,5,7,.72)`（同 `--terminal` 系），
  `border: 1px solid rgba(233,255,249,.19)`，配现有 HUD 直角/切角语言，
  可选 `clip-path` 缺角与 `.site-header` 呼应。
- 标题条：左侧三点状态灯**重新编码为主题色**——
  `--coral`（运行/编译）、`--violet`（链接）、`--mint`（就绪），
  而非参考图的红黄绿交通灯；右侧可放极简 `sac://build` 之类路径标签。
- 复用 `--hero-fade` 径向遮罩思路：终端边缘与背景网格柔和融合，避免生硬矩形。

### 4.2 内容与排版

- 命令行：`›_ jaxon build --real-world`（`--mint` 前缀 `›_`，与站点 wordmark 一致）。
- 日志行：时间戳 `rgba(233,255,249,.45)` + 事件文本 `--text`；等宽 IBM Plex Mono。
  文案（英文，个人能力编译方向）：
  - `mapping AI systems`
  - `loading research signals`
  - `resolving model dependencies`
  - `optimizing deployment path`
  - `validating production impact`
  - `linking real-world intelligence`
- 页脚：版本行 `v1.0.0 · linking…` 用 `--coral`（呼应参考图橙色语义，但取自主题变量）；
  百分比 `--mint`。
- 进度条：轨道 `rgba(233,255,249,.12)`，填充 `--mint`（可选末端 `--violet` 渐变微光）。
- 字号一律用 `clamp()` 响应式，移动端中文无涉；英文日志在窄屏下可按需省略尾部行数
  （通过 `data-density` 控制显示行数，而非缩小到不可读）。

### 4.3 动效清单（仅这些，克制优先）

1. 命令行：打字机式**遮罩位移**（用 `clip-path`/`width` 过渡，非逐字符 DOM 变更）。
2. 日志行：逐条 `opacity + translateY` 淡入，级联 stagger（复用站点回弹 `cubic-bezier` 风格）。
3. 进度条：`transform: scaleX()` 填充（合成器友好，不触发布局）。
4. 完成态：终端边框/进度条一次性 `--mint` 呼吸辉光（`box-shadow`，加 `will-change`）。
5. 静置 → 淡出 → 重启：整体 `opacity` 过渡，随后状态机复位。

**明确排除**（对齐 project_memory 的拒绝案）：无横向扫光、无逐字符高频重渲染、
无模拟输入光标交互、日志不做无限滚屏。

## 5. 阶段状态机（~14.7s 一轮）

| 阶段 | `data-phase` | 时长(约) | 行为 |
| --- | --- | --- | --- |
| 0 引导 | `booting` | 0.6s | 窗口淡入，命令行遮罩展开 |
| 1 编译 | `compiling` | 5.0s | 逐条吐出日志 1–4，进度 0→55% |
| 2 链接 | `linking` | 4.5s | 日志 5–6，进度 55→92%，状态灯切 `--violet` |
| 3 收敛 | `sealing` | 2.0s | 进度 92→100%，状态灯切 `--mint` |
| 4 就绪 | `ready` | 1.6s | 完成辉光 + `ready.` 文案 |
| 5 静置 | `idle` | 1.0s | 停留后整体淡出 → 复位回阶段 0 |

- `reduced-motion`：跳过 0–3，直接锁定 `ready` 终态（进度 100%、全部日志可见、无动画）。
- 计时实现：阶段切换用 `setTimeout` 链（可在暂停时 `clearTimeout` 并记录剩余时间）；
  进度条百分比用单条 CSS `transition` 承载，不用 per-frame JS 更新（除非需要数字滚动，
  则用节流到 ~10fps 的 `requestAnimationFrame`，离屏即停）。

## 6. 布局与"零重叠"策略（硬约束）

终端沿用 `.hero-media` 的绝对定位槽位，与 Hero 文本区（`.hero-name` / `.hero-copy`）
共享同一 Hero 舞台。零重叠通过**分区 + 尺寸夹取**实现：

### 6.1 桌面 / 平板（≥ 761px）

- 终端继续占据右下媒体槽（`.hero-media` 现有 `right/bottom/width`），
  文本区在左（`.hero-copy` 绝对定位左下），二者天然分列左右。
- 终端宽度沿用 `min(56vw, …, 900px)` 量级夹取；新增**高度上限**
  （如 `max-height: min(52dvh, 520px)`）与 `aspect-ratio`，防止在矮视口纵向侵入文本。
- 校验点：右侧终端左边缘不越过 `.hero-copy` 右边缘；在 1280×800 / 1440×900 /
  1920×1080 / 768×1024 / 820×1180 逐一核验包围盒不相交。

### 6.2 移动端（≤ 760px）

- 现网移动端 `.hero-media` 已是 `bottom: 126px; width: min(103vw, 460px); opacity:.76`，
  且 `.hero-copy` 在上方 `top: clamp(246px,29vh,276px)`、CTA 贴底。
- 终端改为**低透明度背景层**语义：置于文本下方区域，`z-index` 低于 `.hero-copy`；
  即便视觉上有纵向交叠，也通过**层级 + 内容留白**保证文字完全可读、可点击，
  但**几何上**优先让终端整体位于 CTA 之上、标语之下的空档区（用 `clamp` 收紧高度）。
- 触控目标：终端不接收指针事件（`pointer-events: none`），不产生 44px 命中区竞争；
  CTA 命中区不被覆盖。

### 6.3 通用护栏

- 容器 `overflow: clip` + `isolation: isolate`（沿用 `.hero`/`.hero-media`）。
- 所有尺寸用 `%/vw/dvh/clamp/min`，仅在边框/细节用固定 px。
- 预留占位：终端容器在 JS 执行前即有确定尺寸（`aspect-ratio` 或显式 min-height），CLS≈0。

## 7. 性能优化措施

1. **零新增网络资源**：删除 86KB 芯片 WebP 的首屏解码与 Canvas 初始化；
   终端为纯文本/边框，首屏更轻，利好 LCP。
2. **LCP 保护**：Hero 的 LCP 元素预计回落到 `.hero-name`（大字标题）；
   确认不因移除 `fetchPriority="high"` 图片而回退（见 §9 门禁测试）。
3. **合成器友好动画**：仅 `opacity` / `transform` / `clip-path` / `box-shadow`；
   进度条用 `scaleX`；对呼吸辉光元素加 `will-change` 并在 `idle` 后移除。
4. **三重停启**：离屏（IntersectionObserver on `.hero-media`）、后台（visibilitychange）、
   减弱动态（matchMedia）均清空计时器/rAF，恢复时重建；与现网机制一致。
5. **低频 setState**：整轮约 6 次状态更新；React 更新与 CSS 过渡解耦。
6. **INP**：无输入驱动逻辑，主线程空闲；计时器回调轻量（仅切 data 属性）。

## 8. 响应式测试矩阵（AGENTS.md 强制）

对新构建/`github-pages-dist/` 导出，在下列每个视口逐项核验：

| 类别 | 宽 | 高 |
| --- | ---: | ---: |
| Mobile | 360 | 800 |
| Mobile | 390 | 844 |
| Mobile | 430 | 932 |
| Tablet | 768 | 1024 |
| Tablet | 820 | 1180 |
| Desktop | 1280 | 800 |
| Desktop | 1440 | 900 |
| Desktop | 1920 | 1080 |

每个视口核验：无横向溢出；终端与姓名/标语/CTA 无几何重叠或遮挡（**本次硬约束**）；
无裁切；对齐/间距稳定；CTA 命中区 ≥44px 且未被覆盖；固定头与菜单开合正常；
动画起止一致；容器占位无布局跳动；移动网络节流下加载反馈可见；
`prefers-reduced-motion` 下锁定静态终态。最终交付记录 8 个视口 pass/fail。

## 9. 测试与门禁影响

现有测试对旧 Hero 有硬编码断言，替换须同步更新（属预期变更，非破坏）：

- `tests/rendered-html.test.mjs`
  - L214：`hero-processor-field-optimized.webp` + `fetchPriority="high"` 断言 → 改为断言
    终端组件存在；LCP 优先级策略若转移到 `.hero-name` 需相应调整。
  - L515–516：`hero-processor-field-optimized\.webp` / `HeroSignalField` → 改为 `HeroTerminal`。
  - L522–529（ambient motion）：`data-motion-layer="hero-flow"` 语义迁移到 `HeroTerminal`，
    保留 `prefers-reduced-motion` / `IntersectionObserver` 断言。
  - L540：移动端 `.hero-media { … bottom: 126px; width: min(…) }` 断言——若调整移动端终端
    尺寸需同步更新该正则。
- `tests/browser-release-gate.test.mjs`
  - L344–353 / L401–404：`route("**/assets/hero-processor-field-optimized.webp")` 的加载/失败
    模拟 → 该图不再存在。需改造：或改为拦截字体资源以驱动 loading 态，或调整该用例断言
    "无主图时加载反馈仍走 fonts.ready 完成/错误路径"。保持 LCP/INP/CLS 阈值不变。
- `tests/scroll-performance-contract.test.mjs`：`[data-hero-visible="true"]` 契约保留
  （改为驱动终端环境动画的 `animation-play-state`，替代原 `img`）。
- 资源清理：确认无其它引用后，从 `public/assets/` 移除 `hero-processor-field-optimized.webp`
  及 `output/imagegen/` 源图（若确认弃用）；`export-github-pages` 与 `test:export` 应仍通过。

## 10. 影响文件清单

- 修改：`app/page.tsx`、`app/globals.css`、`app/scroll-performance.css`、
  `app/components/HeroInteractionController.tsx`（仅注释/目标确认，逻辑基本不变）。
- 新增：`app/components/HeroTerminal.tsx`。
- 删除：`app/components/HeroSignalField.tsx`；`public/assets/hero-processor-field-optimized.webp`
  （及对应 `output/imagegen/` 源图，确认弃用后）。
- 测试：`tests/rendered-html.test.mjs`、`tests/browser-release-gate.test.mjs`
  （必要时 `tests/scroll-performance-contract.test.mjs`）。
- 文档：`README.md` / `README_zh.md` 组件列表 `HeroSignalField → HeroTerminal`。

## 11. 非目标（YAGNI）

- 不做可交互/可输入终端、不做真实命令解析。
- 不改动 Experience/Research/Foundations/Contact 等其它区块。
- 不引入动画库或新字体/图片资源。
- 不改变站点主题变量取值与整体版式骨架。

## 12. 待办的工程附注

- `.superpowers/` 目录（可视化伴侣产物）当前未被 `.gitignore` 忽略；
  实施阶段应将其加入忽略，避免误提交 brainstorm 中间产物。

## 13. 实施记录（2026-07-24 完成）

本节记录规格落地的实际结果，与 §10 影响清单逐项对齐。

### 13.1 代码变更

- 新增 `app/components/HeroTerminal.tsx`：client 组件，无 props，日志文案与
  6 阶段时序为模块级常量；`data-phase` / `data-motion` / `data-motion-layer="hero-flow"`
  驱动 CSS；`setTimeout` 链切阶段（整轮 6 次 setState），百分比经节流 rAF
  写入 ref（不逐字符 setState）；`IntersectionObserver` + `visibilitychange`
  + `matchMedia(prefers-reduced-motion)` 三重停启，卸载时清理全部计时器与监听。
- 修改 `app/page.tsx`：`.hero-media` 内 `<img>` + `<HeroSignalField />`
  替换为 `<HeroTerminal />`；容器与 `aria-hidden` 保留。
- 修改 `app/globals.css`：新增终端外壳/内容/进度条/阶段动画样式（复用
  `--void/--terminal/--mint/--violet/--coral/--text` 与 IBM Plex Mono）；
  `.hero-media` 改为有界占位（`bottom/height` 夹取，无 `-5vh` 溢出）；
  删除 `processor-breathe` 关键帧与旧 `img` / `.hero-signal-field` 规则；
  新增 `hero-terminal-type` / `hero-terminal-caret` / `hero-terminal-ready` 关键帧。
- 修改 `app/scroll-performance.css`：`data-hero-visible` 契约由旧 `img`
  迁移到 `.hero-terminal`（离屏暂停环境 CSS 动画）。
- 删除 `app/components/HeroSignalField.tsx`、`public/assets/hero-processor-field-optimized.webp`
  及源图 `output/imagegen/hero-processor-field-optimized.png`。
- `HeroInteractionController.tsx` 逻辑不变（`.hero-media` 仍为观察目标）。

### 13.2 测试与文档

- `tests/rendered-html.test.mjs`：LCP 断言改为“终端为纯 DOM、无高优图、
  LCP 回落 `.hero-name`”；Hero 内容断言改为 `HeroTerminal`；ambient-motion
  断言改读 `HeroTerminal.tsx`（新增 `visibilitychange`）；移动端 `.hero-media`
  断言改为“左右内嵌 + `max-height` 夹取 + `pointer-events: none`”。
- `tests/browser-release-gate.test.mjs`：加载态改由 `**/assets/*.woff2`
  字体请求驱动；错误态改为完成后注入失败图片，验证捕获阶段错误守卫；
  LCP/INP/CLS 阈值不变。
- `tests/scroll-performance-contract.test.mjs`：ambient-motion 断言改为校验
  进度条以 `transform: scaleX()` 动画、不使用 `width` 动画。
- `README.md` / `README_zh.md`：组件列表 `HeroSignalField → HeroTerminal`。
- `.gitignore`：`.superpowers/` 已忽略（§12 附注落实）。

### 13.3 验收结果

- `npm run verify` 全绿：lint、build + node 测试（37 通过）、静态导出、
  导出完整性（1 通过）、浏览器发布门禁（5 通过）。
- 发布性能（3 次采样，移动端节流）：LCP ≈ 1.37–1.40s、INP 32–40ms、
  CLS 0.003–0.005，均满足 LCP ≤ 2.5s / INP ≤ 300ms / CLS ≤ 0.1。
- 8 视口零重叠核验（专用审计脚本，事后清理）：全部 PASS——无横向溢出；
  桌面/平板终端与姓名/标语/CTA 包围盒零相交；移动端终端 `pointer-events: none`
  且层级低于 `.hero-copy`；CTA 命中区 62–72px（≥44px）。

  | 视口 | 结果 |
  | --- | --- |
  | 360×800 | PASS |
  | 390×844 | PASS |
  | 430×932 | PASS |
  | 768×1024 | PASS |
  | 820×1180 | PASS |
  | 1280×800 | PASS |
  | 1440×900 | PASS |
  | 1920×1080 | PASS |

- `prefers-reduced-motion: reduce` 直查：终端锁定 `data-phase="ready"`、
  `data-motion="reduced"`、进度 100%、6 条日志全可见、无计时器启动。
