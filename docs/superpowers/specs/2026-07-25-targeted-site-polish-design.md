# 定向站点精修设计规格

- 日期：2026-07-25
- 状态：已确认，待实施
- 范围：审查问题 1、2、7、8、9、10
- 方案：定向系统精修

## 1. 目标

在不重写页面、不新增公开经历事实、不改变 Neo-Terminal 视觉身份的前提下，
修复以下问题：

1. `1101–1275px` 宽度下 Contact 邮箱被截断。
2. Hero 定位不明确，Experience 信息密度与区块占地不匹配。
3. 移动端快速加载时仍强制展示约 1.4 秒加载/完成提示。
4. Hero 终端每轮整体消失，并可见地从 100% 回退到 0%。
5. `760/761px`、`1100/1101px` 存在不必要的整套构图跳变。
6. 语义化颜色 Token 仅覆盖少量共享组件，样式容易继续漂移。

完成后必须保持：

- 现有内容顺序、字体、品牌色和主要交互不变。
- Hero 终端仍是唯一复杂首屏记忆点。
- 静态 HTML、无 JavaScript、reduced-motion 和资源失败状态可用。
- 8 个强制视口及 Core Web Vitals 发布门禁继续通过。

## 2. 已确认的内容边界

### 2.1 不新增未经提供的事实

Experience 只使用当前源码已公开的信息：

- ByteDance
- Senior AI Engineer
- Alibaba
- Machine Learning Engineer
- International Digital Commerce Group
- DAMO Academy

不新增日期、项目、职责、量化成果或推断性描述。

### 2.2 Hero 定位文案

保留现有品牌口号：

```text
COMPILING INTELLIGENCE
FOR THE REAL WORLD_
```

新增一条低层级定位行：

```text
SENIOR AI ENGINEER // AI AGENTS · LLMs / VLMs · AUTONOMOUS DRIVING
```

该定位行来自现有职位、Toolchain 和 metadata，不引入新事实。它使用等宽小字，
层级低于品牌口号但保持正常文字对比度；窄屏允许自然换行，不通过过度缩小字号强行单行。

### 2.3 Experience 信息密度

Experience 保留现有时间线结构，新增：

- ByteDance：`CURRENT ROLE`
- Alibaba：`PREVIOUS ROLE`

同时收紧记录高度、公司与职位间距、组织子项内边距和区块底部留白。当前节点、
组织 Logo、Alibaba 分支与轨道语言继续保留。

## 3. 响应式设计

### 3.1 Hero 收敛为两种定位模型

Hero 不再分别维护手机、平板和桌面三套定位模型，而是与导航断点对齐：

#### `≤900px`：上下堆叠

- 姓名、定位行、口号、终端和 CTA 纵向排列。
- 姓名字号使用有上限的 `clamp()`，避免宽屏平板继续按 `25vw` 放大后压住口号。
- 定位行和口号位于姓名下方，终端占据文案与 CTA 之间的稳定槽位。
- 终端宽度使用容器可用宽度并设置合理上限，避免 900px 处突然铺满整屏。
- CTA 保持底部主要操作，终端继续 `pointer-events: none`。

#### `≥901px`：左右分区

- 姓名与文案位于左侧，终端位于右侧。
- 终端宽度统一使用一组连续 `clamp()`，不再在 1100/1101px 切换
  `340px` 与 `600px` 两套尺寸。
- 终端高度同样连续缩放，底部定位模型在整个桌面区间保持一致。
- 允许在较窄桌面区间调整间距，但不得改变终端的定位模式。

`900/901px` 是唯一有意的 Hero 模式切换，并与移动导航/桌面导航切换同步。
`760/761px` 与 `1100/1101px` 只允许连续的数值变化，不再切换构图。

### 3.2 Contact 列数

- `≤760px`：1 列。
- `761–1279px`：2 列。
- `≥1280px`：4 列。

邮箱、用户名和平台名称必须完整显示；不能依靠 `text-overflow: ellipsis`
掩盖布局不足。现有 4 列边框规则随新断点迁移。

### 3.3 边界门禁

新增以下成对视口：

- `760/761px`
- `900/901px`
- `1100/1101px`
- `1279/1280px`

所有边界都检查无溢出、无裁切、无元素重叠和完整联系方式。
`760/761px`、`1100/1101px` 额外检查 Hero 姓名和终端的尺寸/位置变化保持连续；
`900/901px` 允许有意的模式切换，但两侧都必须形成完整、平衡的构图。

## 4. 移动加载反馈

### 4.1 状态模型

`MobileLoadFeedback` 继续使用 `loading / complete / error`，但初始不可见：

```text
mount
  ├─ start 300ms reveal timer
  ├─ resources ready before timer
  │    └─ cancel timer, remain hidden
  ├─ timer fires first
  │    └─ show loading
  │         └─ resources ready → show complete briefly → hide
  └─ image error at any time
       └─ cancel timers → show persistent error + Retry
```

### 4.2 行为要求

- 快速加载不展示 `Loading visual assets…`，也不补播 `Interface ready.`。
- 慢加载超过 300ms 才展示反馈。
- 若 loading 已展示，complete 保留 600ms 后隐藏。
- 错误状态立即可见、持久存在，并保持 `role="alert"` 与 44px Retry 目标。
- 初始 SSR 标记为隐藏，避免 hydration 前闪现。
- 无 JavaScript 时继续通过 `<noscript>` 隐藏反馈。

## 5. Hero 终端循环

### 5.1 外壳常驻

终端 `idle` 阶段不再将整个 `.hero-terminal` 设置为 `opacity: 0`：

- 边框、背景、路径和窗口结构始终可见。
- idle 只降低日志、状态文字和进度内容的强调度。
- ready 辉光结束后自然回到静态外壳，不制造“组件消失”。

### 5.2 无感进度复位

进入 `booting` 时：

1. 进度内容先隐藏或降至不可感知状态。
2. `scaleX` 在无 transition 的条件下瞬时复位到 0。
3. 进入 `compiling` 后重新显示，并只做 0 → 目标值的正向增长。

用户不得看到 100% → 0% 的反向动画。日志仍在 booting 同步清空，
随后按原有 stagger 顺序出现。

### 5.3 生命周期保持

以下能力不变：

- 离屏停止计时器和 rAF。
- 页面后台暂停 CSS 与 JS 动效。
- 回到首屏从干净 booting 状态重新开始。
- reduced-motion 锁定 ready 静态终态，完整日志可读。
- SSR 与无 JavaScript 输出 ready 静态终端。

## 6. 语义化视觉 Token

### 6.1 原子值与语义角色

保留以下品牌原子值：

- `--terminal`
- `--mint`
- `--violet`
- `--coral`
- `--text`
- 各区块背景原子值

在现有 Token 基础上补全并使用：

- 文字：主文字、次文字、弱文字。
- 线条：强、中、弱三档。
- 表面：页面、固定头部、面板、交互反馈。
- 强调：主强调、信号强调、运行/错误状态。
- 阴影：面板阴影、反馈阴影。

### 6.2 迁移范围

以下共享区域必须改用语义 Token：

- 页面基础文字与选择状态
- Header、导航和移动菜单
- CTA
- Hero 终端外壳及常规文字
- Section kicker、轨道、页脚
- Experience / Foundations 的共享标题和 Logo 状态
- Contact 卡片
- MobileLoadFeedback
- 404 面板

Canvas 绘制色、单次特效渐变、关键帧中的局部透明度和组织 Logo 自身颜色可保留局部值。
目标是让共享视觉规则有统一来源，而不是为每个 alpha 值制造变量。

## 7. 组件与文件边界

预计修改：

- `app/page.tsx`
  - 新增 Hero 定位行。
  - 新增 Experience 状态标签。
- `app/components/MobileLoadFeedback.tsx`
  - 实现延迟展示和快速加载静默路径。
- `app/components/HeroTerminal.tsx`
  - 保留现有六阶段状态机，不新增阶段；复位由 booting 阶段属性与 CSS 完成。
- `app/globals.css`
  - 文案层级、紧凑 Experience、两模式 Hero、Contact 断点、终端复位和 Token 迁移。
- `app/scroll-performance.css`
  - 仅在运行时可见性覆盖需要同步时修改。
- `tests/rendered-html.test.mjs`
  - 新公开文案与结构契约。
- `tests/scroll-performance-contract.test.mjs`
  - Token 与终端复位契约。
- `tests/browser-release-gate.test.mjs`
  - 加载状态、边界视口和终端循环的真实浏览器验证。

默认不修改：

- `public/og.png`，因为社交图不在本轮选择的修复项中。
- Contact 跑马灯结构。
- 论文链接文案与无障碍名称。
- README。
- 生成目录 `github-pages-dist/`；它只能通过脚本重新生成。

## 8. 错误处理与性能

- 加载反馈的所有计时器在卸载和错误时清理。
- 资源完成与错误竞争时，错误状态优先，complete 不能覆盖 error。
- 不新增依赖、图片、第三方脚本或客户端数据请求。
- HeroTerminal 继续仅在阶段切换时 setState；百分比仍使用受控、低频 DOM 写入。
- 新文案在 SSR 中直接输出，不增加 hydration 依赖。
- 布局保留稳定尺寸，CLS 目标继续 ≤0.1。

## 9. 验证

### 9.1 静态与单元

- SSR 包含 Hero 定位行、`CURRENT ROLE`、`PREVIOUS ROLE`。
- 不出现新增日期、成果或未确认经历。
- 共享组件使用新增语义 Token。
- idle 不再隐藏整个终端。
- booting 进度复位不执行反向 transition。
- 快速加载状态初始隐藏。

### 9.2 浏览器专项

- 快速资源：加载提示从未可见。
- 慢字体/资源：300ms 后出现 loading，完成后出现短暂 complete 并隐藏。
- 图片失败：持久 error 与可用 Retry。
- 一轮终端循环：外壳始终可见，进度复位不可见，下一轮仅正向增长。
- 4 组边界视口符合 §3.3。
- Contact 在 `1101–1275px` 不再截断邮箱。

### 9.3 发布门禁

运行 `npm run verify`，必须包含：

- lint、构建、单元与 SSR 测试。
- 静态导出和导出完整性。
- 8 个强制视口全部 PASS。
- 无 JavaScript、reduced-motion、后台暂停、触控释放、历史导航全部 PASS。
- 移动 4G + 4× CPU 的 3 次样本均满足：
  - LCP ≤2.5s
  - INP ≤300ms
  - CLS ≤0.1

## 10. 完成定义

- 六个选定问题均有代码修复和自动化证据。
- 未引入用户未提供的经历事实。
- 现有品牌、内容顺序和交互行为未被破坏。
- 所有边界及强制视口没有无法解释的视觉失败。
- `npm run verify` 全绿。
- 最终 diff 只包含本规格范围内的源码、测试和设计文档。
