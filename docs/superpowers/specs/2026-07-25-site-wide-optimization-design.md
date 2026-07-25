# 站点全面优化设计规格

- 日期：2026-07-25
- 状态：已确认，待实施
- 范围：全站视觉规范、动效生命周期、导航与无障碍、响应式发布门禁
- 基准：`docs/网站优化指南.md`

## 1. 目标

在保留现有 Neo-Terminal 视觉身份、内容结构和 Hero 动态终端的前提下，
完成一次系统性精修，而不是重新设计页面。最终结果必须同时满足：

1. 视觉颜色、线条、表面、文字层级和交互状态由语义化 Token 统一管理。
2. 常规交互复用少量时长与缓动；循环动效可在离屏、后台和 reduced-motion
   环境暂停或降级。
3. 固定导航、锚点、焦点、浏览器前进/后退和移动安全区保持一致且可访问。
4. 静态 HTML、禁用 JavaScript、资源失败和慢速移动网络下，核心内容仍可阅读。
5. 新鲜构建在 8 个强制视口中通过整页布局、导航、交互、触控和动画状态检查。
6. 移动节流环境继续满足 LCP ≤ 2.5s、INP ≤ 300ms、CLS ≤ 0.1。
7. `npm run verify` 继续作为可复现的发布门禁，且测试内容真实覆盖上述目标。

## 2. 已有能力与保留项

以下能力已经存在，实施中只做规范化或补充验证，不重复重写：

- Oxanium + IBM Plex Mono 字体组合和深色 Neo-Terminal 配色。
- Hero 动态终端作为唯一主要复杂记忆点。
- 研究区 Canvas 的 DPR 限制、离屏暂停、后台暂停和 reduced-motion 静态状态。
- Hero 终端的离屏/后台停启、静态 SSR 终态和稳定尺寸占位。
- 可取消的站内滚动、移动导航菜单、跳转后焦点同步和 Skip Link。
- 非首屏组织 Logo 懒加载、固有尺寸、静态导出、定制 404 和社交元数据。
- 移动加载/错误反馈以及现有 Core Web Vitals 浏览器采样。

## 3. 方案选择

### 方案 A：系统性精修（采用）

保留内容和构图，只收敛 Token、生命周期、元数据、安全区和发布门禁。

- 优点：风险最低，直接解决指南中的一致性、性能和无障碍缺口。
- 缺点：不会产生“换了一个网站”的视觉冲击。

### 方案 B：中度版式改造（不采用）

保留主题但重排 Hero、Experience 和 Research。

- 优点：视觉变化明显。
- 缺点：当前八视口几何关系和性能基线需大面积重建，且并非指南要求。

### 方案 C：引入动画编排库（不采用）

使用 GSAP/ScrollTrigger 统一揭示和滚动动效。

- 优点：时间线编排能力强。
- 缺点：现有 CSS、Observer 和轻量状态机已覆盖需求，引入依赖会增加包体和复杂度。

## 4. 视觉系统

### 4.1 语义化 Token

在保留 `--terminal`、`--mint`、`--violet` 等品牌原子变量以避免破坏已有组件的同时，
新增并使用以下语义角色：

- 背景：`--color-background`、`--color-surface`。
- 文字：`--color-foreground`、`--color-muted`。
- 强调：`--color-accent`；紫色只作为信号层，珊瑚色只作为运行/错误状态。
- 线条：`--color-line`、`--color-line-subtle`。
- 运动：`--ease-out`、`--ease-spring`、`--duration-fast`、
  `--duration-normal`、`--duration-reveal`。
- 层级：为固定导航、反馈和内容建立可读的 z-index Token。

改动优先覆盖全局基础元素、导航、CTA、区块轨道和反馈组件。特效内部的透明度可保留
局部值，避免为了“零硬编码”制造难以理解的变量。

### 4.2 深色主题与安全区

- HTML 声明 `color-scheme: dark`。
- 页面输出与背景一致的 `theme-color`。
- 固定导航、移动反馈和移动区块内边距使用 `env(safe-area-inset-*)`，
  在普通屏幕保持现有视觉尺寸，在刘海/圆角屏避免内容贴边或被遮挡。

### 4.3 排版与内容

- 继续使用现有展示体/等宽体层级和 `clamp()` 尺度。
- 标题保留 `text-wrap: balance/pretty`；长联系方式继续可截断。
- 不修改个人经历、研究成果、联系方式和公开文案。

## 5. 动效与运行生命周期

### 5.1 统一运动节奏

- 即时反馈使用快速 Token。
- 导航指示、菜单和 CTA 使用标准 Token。
- 内容揭示保留 24px 位移，但使用统一的减速曲线。
- 不新增循环动画；现有终端、时间线、节点脉冲和联系方式跑马灯是全部循环层。

### 5.2 按需运行

- `HeroInteractionController` 继续管理区块可见状态，并新增页面前台/后台状态标记。
- Experience 时间线与 Contact 跑马灯同时受“区块可见”和“页面前台”控制。
- Hero 与 Research 保留组件内部的精确 rAF/计时器停启。
- 永久 `will-change` 只保留在持续运动且实测需要的元素；菜单等临时运动层仅在打开时启用。

### 5.3 Reduced Motion 与无 JavaScript

- reduced-motion 下所有核心内容默认可见，循环动画和滚动动画停止。
- 禁用 JavaScript 时，SSR 内容、研究标题、经历、联系方式和 404 仍可阅读；
  移动加载提示由 `<noscript>` 隐藏，避免永久显示“加载中”。
- Canvas 继续作为装饰层，论文标题和链接是其文本替代，不以 Canvas 承载关键信息。

## 6. 导航与无障碍

- 所有可跳转区块设置与固定导航匹配的 `scroll-margin-top`，支持原生 hash 恢复。
- 浏览器 hash 前进/后退后同步活动导航与顺序焦点，不创建新的历史记录。
- 保留用户滚轮、触摸和键盘对平滑滚动的即时打断。
- 移动菜单继续支持首项聚焦、Escape 关闭、点击外部/滚动关闭。
- 所有交互保持可见 `:focus-visible`，触控目标不低于 44×44 CSS px。
- 不引入表单、Cookie、追踪脚本或需要法律同意的新功能。

## 7. 性能约束

- 不新增运行时依赖、图片、第三方脚本或外部 CDN。
- 高频动画只修改 `transform` 和 `opacity`；已有一次性阴影/滤镜只在小面积状态中使用。
- 不为长页面新增逐元素 ScrollTrigger；区块可见性继续共用 Observer。
- 不改变图片懒加载和固有尺寸策略。
- 保留稳定的 Hero 终端槽位和移动研究 Canvas 最小高度，避免 CLS。

## 8. 实施边界

预计修改：

- `app/globals.css`
- `app/scroll-performance.css`
- `app/layout.tsx`
- `app/components/HeroInteractionController.tsx`
- `app/components/Navigation.tsx`
- `tests/rendered-html.test.mjs`
- `tests/scroll-performance-contract.test.mjs`
- `tests/browser-release-gate.test.mjs`

仅在公开功能说明发生变化时同步 `README.md` / `README_zh.md`；本轮不改变使用方式，
默认不修改 README。

明确不做：

- 不重写页面、不调整内容顺序、不新增区块。
- 不新增 GSAP、Framer Motion 或其他动画库。
- 不增加第二个 Hero/Canvas 主特效。
- 不改变品牌主色、字体或公开身份信息。

## 9. 验证设计

### 9.1 静态与单元门禁

- SSR/导出 HTML 包含 `theme-color`、英文语言声明、完整核心内容和固有图片尺寸。
- CSS 契约覆盖语义 Token、dark color scheme、安全区、scroll margin、
  reduced-motion 和后台暂停规则。
- 导航测试覆盖用户打断、目标焦点、hash 历史恢复和异常 hash。

### 9.2 8 视口整页门禁

使用新鲜 `github-pages-dist/` 导出，在以下精确视口逐一验证：

- 360×800、390×844、430×932
- 768×1024、820×1180
- 1280×800、1440×900、1920×1080

每个视口至少检查：

1. `scrollWidth <= clientWidth`，无横向溢出。
2. Hero 姓名、标语、CTA、各区块标题、研究按钮和联系方式均有可见包围盒且不被裁切。
3. 固定头部不越界；移动菜单关闭/打开/关闭状态可用，桌面导航链接可见。
4. 所有可见按钮和移动导航目标达到 44×44 CSS px。
5. 逐区滚动后活动导航、区块揭示终态和 Canvas/终端可见状态一致。
6. 无页面错误、控制台错误或失败资源请求。

### 9.3 专项门禁

- reduced-motion：终端静态完成、跑马灯/脉冲/揭示停止，内容完整。
- JavaScript disabled：核心内容可读，加载反馈隐藏。
- 移动网络 + 4× CPU：加载反馈可见，LCP ≤ 2.5s、INP ≤ 300ms、CLS ≤ 0.1。
- 页面切后台：所有循环 CSS 动效暂停；回到前台且区块可见时恢复。

## 10. 完成定义

只有在以下条件全部具备真实证据时，任务才完成：

- 本规格的实现边界已落地，未引入范围外重构。
- `npm run verify` 在沙箱外真实启动 Chromium 并全绿。
- 8 个强制视口逐项输出 PASS，不能只依赖单一对齐断言。
- 性能输出包含 3 次可执行 INP 样本并全部达标。
- reduced-motion、无 JavaScript、后台暂停和浏览器历史恢复均有自动化或直接浏览器证据。
- 最终 Git diff 仅包含本轮必要改动，且没有手工修改 `github-pages-dist/`。
