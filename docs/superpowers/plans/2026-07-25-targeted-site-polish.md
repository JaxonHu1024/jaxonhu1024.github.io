# Targeted Site Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Contact 中间宽度截断、站点定位文案、移动加载提示、Hero 终端复位、响应式断点跳变和语义颜色 Token 覆盖不足。

**Architecture:** 保留现有 Next.js App Router 页面结构和 CSS 动效体系，将修复限制在页面静态文案、两个客户端状态组件、共享样式与现有发布门禁。响应式收敛为 `≤900px` 堆叠和 `≥901px` 左右分区两种 Hero 定位模型，所有行为继续由现有 DOM/CSS、IntersectionObserver 和轻量阶段状态机完成。

**Tech Stack:** Next.js 16、React 19、TypeScript、原生 CSS、Node test runner、Playwright、vinext 静态导出

---

## File Map

- Modify: `app/globals.css`
  - 扩展语义颜色 Token。
  - 添加 Hero 定位行和紧凑 Experience 样式。
  - 调整 Hero 两模式响应式、Contact 列数和终端复位状态。
- Modify: `app/page.tsx`
  - 输出 Hero 定位行以及 `CURRENT ROLE` / `PREVIOUS ROLE`。
- Modify: `app/components/MobileLoadFeedback.tsx`
  - 实现 300ms 延迟展示、快速加载静默和 600ms 完成态。
- Modify: `tests/rendered-html.test.mjs`
  - 锁定新文案、结构与“不新增经历事实”的约束。
- Modify: `tests/scroll-performance-contract.test.mjs`
  - 锁定语义 Token 和 Hero 终端复位契约。
- Modify: `tests/browser-release-gate.test.mjs`
  - 验证加载反馈、终端循环、Contact 文本和断点边界。
- Reference: `docs/superpowers/specs/2026-07-25-targeted-site-polish-design.md`
  - 已批准设计与完成标准。

不创建新组件、不新增依赖、不修改 `public/og.png`、README 或手工编辑
`github-pages-dist/`。

### Task 1: Expand Semantic Color Tokens

**Files:**
- Modify: `app/globals.css:3-34`
- Modify: `app/globals.css:72-286`
- Modify: `app/globals.css:374-542`
- Modify: `app/globals.css:603-1405`
- Modify: `app/globals.css:1883-1977`
- Test: `tests/scroll-performance-contract.test.mjs`

- [ ] **Step 1: Write the failing semantic-token contract**

Append this test to `tests/scroll-performance-contract.test.mjs`:

```js
test("routes shared interface colors through semantic tokens", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  for (const token of [
    "--color-foreground-secondary",
    "--color-foreground-muted",
    "--color-foreground-weak",
    "--color-line-strong",
    "--color-accent-signal",
    "--color-status-active",
    "--surface-header",
    "--surface-panel",
    "--surface-feedback",
    "--shadow-panel",
    "--shadow-feedback",
  ]) {
    assert.ok(css.includes(token), `missing semantic token ${token}`);
  }

  for (const [selector, token] of [
    [".site-header", "--surface-header"],
    [".terminal-button", "--color-accent"],
    [".hero-terminal", "--surface-panel"],
    [".section-footer-index", "--color-foreground-weak"],
    [".contact-socials a", "--color-foreground"],
    [".mobile-load-feedback", "--surface-feedback"],
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? "";
    assert.match(block, new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  }
});
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```bash
node --test --test-name-pattern="routes shared interface colors" tests/scroll-performance-contract.test.mjs
```

Expected: FAIL，至少报告 `missing semantic token --color-foreground-secondary`。

- [ ] **Step 3: Add the semantic roles**

Extend `:root` in `app/globals.css` with this block, keeping the existing primitive
brand colors:

```css
  --color-foreground-secondary: rgba(233, 255, 249, .76);
  --color-foreground-muted: rgba(233, 255, 249, .68);
  --color-foreground-weak: rgba(233, 255, 249, .5);
  --color-line-strong: rgba(233, 255, 249, .28);
  --color-line: rgba(233, 255, 249, .19);
  --color-line-subtle: rgba(233, 255, 249, .12);
  --color-accent: var(--mint);
  --color-accent-signal: var(--violet);
  --color-status-active: var(--coral);
  --surface-header: rgba(3, 5, 7, .72);
  --surface-panel: rgba(3, 5, 7, .72);
  --surface-feedback: rgba(3, 5, 7, .94);
  --shadow-panel: 0 22px 60px rgba(0, 0, 0, .36);
  --shadow-feedback: 0 .875rem 2.5rem rgba(0, 0, 0, .38);
```

Keep the existing names as compatibility aliases where they are already public:

```css
  --color-muted: var(--color-foreground-muted);
  --color-surface: var(--surface-header);
```

- [ ] **Step 4: Migrate shared selectors**

Replace repeated shared values according to this exact mapping:

```text
rgba(233,255,249,.76)  → var(--color-foreground-secondary)
rgba(233,255,249,.68)  → var(--color-foreground-muted)
rgba(233,255,249,.5)   → var(--color-foreground-weak)
rgba(233,255,249,.28)  → var(--color-line-strong)
rgba(233,255,249,.19)  → var(--color-line)
rgba(233,255,249,.12)  → var(--color-line-subtle)
var(--mint) on shared interactive emphasis → var(--color-accent)
var(--violet) on shared signal emphasis     → var(--color-accent-signal)
var(--coral) on shared status emphasis      → var(--color-status-active)
```

Use `var(--surface-header)` in `.site-header`, `var(--surface-panel)` in
`.hero-terminal` and `.not-found-panel`, and `var(--surface-feedback)` in
`.mobile-load-feedback`. Compose the existing inset shadows with
`var(--shadow-panel)` / `var(--shadow-feedback)` instead of duplicating their
outer shadow values.

Do not replace Canvas colors, organization-logo colors, section-specific radial
gradients or keyframe-only alpha values.

- [ ] **Step 5: Run the focused contract**

Run:

```bash
node --test --test-name-pattern="routes shared interface colors" tests/scroll-performance-contract.test.mjs
```

Expected: PASS。

- [ ] **Step 6: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: lint、全部 unit/SSR contracts、export checks、全部 browser release tests
and all eight viewports PASS；三次性能样本继续低于发布阈值。

- [ ] **Step 7: Commit**

```bash
git add app/globals.css tests/scroll-performance-contract.test.mjs
git commit -m "style(theme): expand semantic color tokens"
```

### Task 2: Clarify Hero and Experience Hierarchy

**Files:**
- Modify: `app/page.tsx:50-140`
- Modify: `app/globals.css:327-368`
- Modify: `app/globals.css:638-957`
- Modify: `app/globals.css:1688-1799`
- Test: `tests/rendered-html.test.mjs`
- Test: `tests/browser-release-gate.test.mjs`

- [ ] **Step 1: Write the failing rendered-copy test**

Add this test to `tests/rendered-html.test.mjs`:

```js
test("renders the clarified role hierarchy without inventing experience facts", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /class="hero-positioning">SENIOR AI ENGINEER \/\/ AI AGENTS · LLMs \/ VLMs · AUTONOMOUS DRIVING<\/p>/,
  );
  assert.match(html, /class="experience-status">CURRENT ROLE<\/span>/);
  assert.match(html, /class="experience-status">PREVIOUS ROLE<\/span>/);
  assert.match(html, /<h3>ByteDance<\/h3>/);
  assert.match(html, /<p>Senior AI Engineer<\/p>/);
  assert.match(html, /<h3 id="alibaba-group-title">Alibaba<\/h3>/);
  assert.match(html, /<p>Machine Learning Engineer<\/p>/);
  assert.doesNotMatch(
    html,
    /2025\.02–PRESENT|2023\.07–2025\.01|2022\.06–2023\.06|2020\.12–2022\.03/,
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run build
node --test --test-name-pattern="renders the clarified role hierarchy" tests/rendered-html.test.mjs
```

Expected: FAIL because `.hero-positioning` does not exist。

- [ ] **Step 3: Render the approved copy**

Replace the content of `.hero-copy` in `app/page.tsx` with:

```tsx
<div className="hero-copy">
  <div className="hero-message">
    <p className="hero-positioning">
      SENIOR AI ENGINEER // AI AGENTS · LLMs / VLMs · AUTONOMOUS DRIVING
    </p>
    <p className="hero-statement">
      <span>COMPILING INTELLIGENCE</span>
      <span>FOR THE REAL WORLD_</span>
    </p>
  </div>
  <a className="terminal-button hero-cta" href="#experience">
    <span>VIEW EXPERIENCE</span>
    <span className="button-arrow" aria-hidden="true">›</span>
  </a>
</div>
```

Insert these labels immediately before the relevant company `<h3>`:

```tsx
<span className="experience-status">CURRENT ROLE</span>
```

```tsx
<span className="experience-status">PREVIOUS ROLE</span>
```

- [ ] **Step 4: Add the hierarchy and compact-spacing styles**

Add:

```css
.hero-message {
  display: grid;
  gap: clamp(10px, 1.2vw, 16px);
}

.hero-positioning {
  max-width: 66ch;
  margin: 0;
  color: var(--color-foreground-secondary);
  font-size: clamp(11px, .78vw, 13px);
  font-weight: 500;
  line-height: 1.55;
  letter-spacing: .11em;
  text-wrap: balance;
}

.experience-status {
  display: block;
  margin-bottom: 8px;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: .14em;
}
```

Apply these compact values:

```css
.experience-row,
.experience-group-header {
  min-height: 144px;
}

.experience-subentry {
  padding-block: 18px 20px;
}

@media (max-width: 760px) {
  .experience-row,
  .experience-row.is-current,
  .experience-group-header {
    min-height: 120px;
  }

  .experience-status {
    margin-bottom: 6px;
    font-size: 10px;
  }

  .experience-subentry {
    padding-block: 18px 20px;
  }
}
```

Keep company titles, roles, logos and timeline axes aligned. Do not remove the
Alibaba organization branch.

- [ ] **Step 5: Extend the viewport checks**

In the existing `sectionChecks` definitions in
`tests/browser-release-gate.test.mjs`, add:

```js
".hero-positioning"
```

to the Hero selectors and:

```js
".experience-status"
```

to the Experience selectors. The existing visibility, clipping and opacity
assertions must apply without new special cases.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm run build
node --test --test-name-pattern="renders the clarified role hierarchy" tests/rendered-html.test.mjs
npm run export:github-pages:from-build
node --test --test-name-pattern="fresh export passes" tests/browser-release-gate.test.mjs
```

Expected: both tests PASS and every status label has a visible box。

- [ ] **Step 7: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: all eight viewports PASS with no Hero or Experience clipping。

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/globals.css tests/rendered-html.test.mjs tests/browser-release-gate.test.mjs
git commit -m "feat(content): clarify role hierarchy"
```

### Task 3: Delay Mobile Loading Feedback

**Files:**
- Modify: `app/components/MobileLoadFeedback.tsx`
- Modify: `tests/browser-release-gate.test.mjs:334-457`

- [ ] **Step 1: Replace the old loading test with fast and slow paths**

Rename the current narrow-viewport test to
`"slow narrow loads show delayed feedback until assets finish"` and change its
setup so the component script is released immediately while the font stays
blocked. Assert the SSR state is initially hidden, then assert loading becomes
visible only after the delay:

```js
assert.equal(await feedback.getAttribute("data-state"), "loading");
assert.equal(await feedback.getAttribute("data-visible"), "false");
assert.equal(await feedback.getAttribute("aria-hidden"), "true");

releaseFeedbackScript.resolve();
await page.waitForFunction(() => (
  document.querySelector('[data-testid="mobile-load-feedback"]')
    ?.getAttribute("data-visible") === "true"
), null, { timeout: 1_500 });

assert.equal(await feedback.getAttribute("data-state"), "loading");
assert.match(await feedback.textContent(), /Loading visual assets/i);
```

After releasing the font, require complete and then hidden within 2 seconds.

Add a separate fast-path test:

```js
test("fast narrow loads never flash loading or completion feedback", async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await page.addInitScript(() => {
      window.__feedbackVisibilityHistory = [];
      document.addEventListener("DOMContentLoaded", () => {
        const feedback = document.querySelector(
          '[data-testid="mobile-load-feedback"]',
        );
        if (!feedback) return;

        const record = () => {
          window.__feedbackVisibilityHistory.push({
            state: feedback.getAttribute("data-state"),
            visible: feedback.getAttribute("data-visible"),
          });
        };
        record();
        new MutationObserver(record).observe(feedback, {
          attributeFilter: ["data-state", "data-visible"],
          attributes: true,
        });
      }, { once: true });
    });
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.documentElement.dataset.pageActive === "true"
    ));
    await page.waitForTimeout(750);

    const feedback = page.getByTestId("mobile-load-feedback");
    assert.equal(await feedback.getAttribute("data-visible"), "false");
    assert.equal(await feedback.getAttribute("aria-hidden"), "true");
    assert.equal(await feedback.getAttribute("data-state"), "loading");
    assert.deepEqual(
      await page.evaluate(() => window.__feedbackVisibilityHistory),
      [{ state: "loading", visible: "false" }],
    );
  } finally {
    await context.close();
  }
});
```

- [ ] **Step 2: Update existing fast-path waiters**

In the slow-load test, use this exact completion sequence after releasing the
font:

```js
releaseFont.resolve();
await page.waitForFunction(() => {
  const feedback = document.querySelector(
    '[data-testid="mobile-load-feedback"]',
  );
  return feedback?.getAttribute("data-state") === "complete"
    && feedback?.getAttribute("data-visible") === "true";
}, null, { timeout: 3_000 });
assert.match(await feedback.textContent(), /Interface ready/i);
await page.waitForFunction(() => (
  document.querySelector('[data-testid="mobile-load-feedback"]')
    ?.getAttribute("data-visible") === "false"
), null, { timeout: 2_000 });
```

In `"asset failures expose an accessible persistent error state"`, remove the
wait for `data-state="complete"`. Before appending the broken image, wait for
client effects instead:

```js
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => (
  document.documentElement.dataset.pageActive === "true"
  && document.querySelector('[data-testid="mobile-load-feedback"]')
    ?.getAttribute("data-visible") === "false"
));
```

In `runPerformanceSample` and the eight-viewport release test, replace the
`state === "complete" && visible === "false"` waiter with:

```js
await page.waitForFunction(() => (
  document.documentElement.dataset.pageActive === "true"
  && document.querySelector('[data-testid="mobile-load-feedback"]')
    ?.getAttribute("data-visible") === "false"
), null, { timeout: 5_000 });
```

The slow-load test is the only success path that should require
`data-state="complete"`.

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="slow narrow loads|fast narrow loads" tests/browser-release-gate.test.mjs
```

Expected: FAIL because current SSR state is visible and fast loads enter complete。

- [ ] **Step 4: Implement the delayed state machine**

In `MobileLoadFeedback.tsx`, use:

```ts
const LOADING_REVEAL_DELAY_MS = 300;
const COMPLETE_VISIBILITY_MS = 600;
```

Initialize visibility as:

```ts
const [visible, setVisible] = useState(false);
```

Inside the effect, replace `shownAt` / `minimumVisibilityTimer` with:

```ts
let loadingWasShown = false;
let revealTimer: number | undefined;
let hideTimer: number | undefined;

const revealLoading = () => {
  if (cancelled || failed) return;
  loadingWasShown = true;
  setState("loading");
  setVisible(true);
};

revealTimer = window.setTimeout(
  revealLoading,
  LOADING_REVEAL_DELAY_MS,
);
```

Implement successful completion as:

```ts
const showComplete = () => {
  if (cancelled || failed) return;
  window.clearTimeout(revealTimer);

  if (!loadingWasShown) {
    setVisible(false);
    return;
  }

  setState("complete");
  setVisible(true);
  hideTimer = window.setTimeout(() => {
    if (!cancelled && !failed) setVisible(false);
  }, COMPLETE_VISIBILITY_MS);
};
```

Call `showComplete` directly from the readiness Promise. In `showError` and the
effect cleanup, clear both `revealTimer` and `hideTimer`. Preserve the existing
capture-phase image error listener and Retry behavior.

- [ ] **Step 5: Run the focused loading tests**

Run:

```bash
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="slow narrow loads|fast narrow loads|asset failures" tests/browser-release-gate.test.mjs
```

Expected: all three tests PASS。

- [ ] **Step 6: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: the mobile-network performance samples still record executable INP,
and LCP/CLS remain below thresholds。

- [ ] **Step 7: Commit**

```bash
git add app/components/MobileLoadFeedback.tsx tests/browser-release-gate.test.mjs
git commit -m "fix(feedback): delay mobile load status"
```

### Task 4: Keep the Terminal Shell Visible During Reset

**Files:**
- Modify: `app/globals.css:545-600`
- Modify: `tests/scroll-performance-contract.test.mjs`
- Modify: `tests/browser-release-gate.test.mjs:815-856`

- [ ] **Step 1: Write the failing CSS contract**

Replace the old idle-opacity expectation in
`tests/scroll-performance-contract.test.mjs` with:

```js
test("resets terminal progress without hiding the terminal shell", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(
    css,
    /\.hero-terminal\[data-motion="running"\]\[data-phase="idle"\]\s*\{\s*opacity:\s*0;/,
  );
  assert.match(
    css,
    /\[data-phase="booting"\] \.hero-terminal-progress-fill\s*\{[^}]*transition:\s*none;/s,
  );
  assert.match(
    css,
    /\[data-phase="booting"\] \.hero-terminal-progress\s*\{[^}]*opacity:\s*0;/s,
  );
});
```

- [ ] **Step 2: Extend the browser loop test**

In `"terminal loop clears old logs before each staggered compile reveal"`,
capture idle before waiting for booting:

```js
const idle = await page.locator(".hero-terminal").evaluate((terminal) => ({
  opacity: Number.parseFloat(getComputedStyle(terminal).opacity),
  progressOpacity: Number.parseFloat(
    getComputedStyle(terminal.querySelector(".hero-terminal-progress")).opacity,
  ),
}));
assert.ok(idle.opacity >= 0.99, `idle shell opacity was ${idle.opacity}`);
```

After entering booting, assert:

```js
const bootProgress = await page.locator(".hero-terminal").evaluate((terminal) => {
  const progress = terminal.querySelector(".hero-terminal-progress");
  const fill = terminal.querySelector(".hero-terminal-progress-fill");
  return {
    opacity: Number.parseFloat(getComputedStyle(progress).opacity),
    transitionDuration: getComputedStyle(fill).transitionDuration,
  };
});
assert.equal(bootProgress.opacity, 0);
assert.equal(bootProgress.transitionDuration, "0s");
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
node --test --test-name-pattern="resets terminal progress" tests/scroll-performance-contract.test.mjs
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="terminal loop clears" tests/browser-release-gate.test.mjs
```

Expected: CSS contract fails because idle currently sets `opacity: 0`。

- [ ] **Step 4: Implement shell-preserving reset styles**

Remove:

```css
.hero-terminal[data-motion="running"][data-phase="idle"] { opacity: 0; }
```

Add:

```css
.hero-terminal[data-motion="running"][data-phase="idle"]
  :is(.hero-terminal-body, .hero-terminal-footer, .hero-terminal-progress) {
  opacity: .42;
}

.hero-terminal[data-motion="running"] .hero-terminal-body,
.hero-terminal[data-motion="running"] .hero-terminal-footer,
.hero-terminal[data-motion="running"] .hero-terminal-progress {
  transition: opacity var(--duration-fast) var(--ease-out);
}

.hero-terminal[data-motion="running"][data-phase="booting"]
  .hero-terminal-progress {
  opacity: 0;
}

.hero-terminal[data-motion="running"][data-phase="booting"]
  .hero-terminal-progress-fill {
  transition: none;
}
```

Replace the old booting shell opacity with:

```css
.hero-terminal[data-motion="running"][data-phase="booting"] {
  opacity: 1;
}
```

- [ ] **Step 5: Run focused terminal tests**

Run:

```bash
node --test --test-name-pattern="resets terminal progress|resets terminal logs" tests/scroll-performance-contract.test.mjs
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="terminal loop clears|hero motion pauses|reduced-motion mobile terminal" tests/browser-release-gate.test.mjs
```

Expected: all matching contracts PASS; idle shell opacity is at least `.99` and
boot progress transition duration is `0s`。

- [ ] **Step 6: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: terminal lifecycle, reduced-motion and background pause tests PASS。

- [ ] **Step 7: Commit**

```bash
git add app/globals.css tests/scroll-performance-contract.test.mjs tests/browser-release-gate.test.mjs
git commit -m "fix(hero): keep terminal shell visible"
```

### Task 5: Smooth Hero and Contact Breakpoints

**Files:**
- Modify: `app/globals.css:289-368`
- Modify: `app/globals.css:1484-1518`
- Modify: `app/globals.css:1529-1654`
- Modify: `app/globals.css:1656-1734`
- Modify: `app/globals.css:1858-1880`
- Modify: `tests/browser-release-gate.test.mjs`

- [ ] **Step 1: Add a failing boundary-pair browser test**

Add a test named
`"responsive boundary pairs stay usable and continuous"` to
`tests/browser-release-gate.test.mjs`:

```js
test("responsive boundary pairs stay usable and continuous", { timeout: 45_000 }, async () => {
  const boundaryViewports = [
    { width: 760, height: 1024 },
    { width: 761, height: 1024 },
    { width: 900, height: 800 },
    { width: 901, height: 800 },
    { width: 1100, height: 800 },
    { width: 1101, height: 800 },
    { width: 1150, height: 800 },
    { width: 1200, height: 800 },
    { width: 1275, height: 800 },
    { width: 1279, height: 800 },
    { width: 1280, height: 800 },
  ];
  const samples = new Map();

  for (const viewport of boundaryViewports) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      serviceWorkers: "block",
      viewport,
    });
    const page = await context.newPage();

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => (
        document.documentElement.dataset.pageActive === "true"
      ));

      const metrics = await page.evaluate(() => {
        const box = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width,
          };
        };
        const intersectionArea = (left, right) => (
          Math.max(
            0,
            Math.min(left.right, right.right) - Math.max(left.left, right.left),
          )
          * Math.max(
            0,
            Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
          )
        );
        const name = box(".hero-name");
        const message = box(".hero-message");
        const terminal = box(".hero-media");
        const cta = box(".hero-cta");
        const email = document.querySelector(".endpoint-copy small");
        const contact = document.querySelector(".contact-socials");

        return {
          clientWidth: document.documentElement.clientWidth,
          contactColumnCount: getComputedStyle(contact)
            .gridTemplateColumns
            .split(" ")
            .filter(Boolean)
            .length,
          emailClipped: email.scrollWidth > email.clientWidth + 1,
          intersections: {
            nameMessage: intersectionArea(name, message),
            nameTerminal: intersectionArea(name, terminal),
            messageTerminal: intersectionArea(message, terminal),
            terminalCta: intersectionArea(terminal, cta),
          },
          name,
          scrollWidth: document.documentElement.scrollWidth,
          terminal,
        };
      });

      assert.equal(
        metrics.scrollWidth,
        metrics.clientWidth,
        `${viewport.width}px had horizontal overflow`,
      );
      assert.equal(
        metrics.emailClipped,
        false,
        `${viewport.width}px clipped the email endpoint`,
      );
      assert.equal(
        metrics.contactColumnCount,
        viewport.width <= 760 ? 1 : viewport.width < 1280 ? 2 : 4,
        `${viewport.width}px used ${metrics.contactColumnCount} contact columns`,
      );
      for (const [pair, area] of Object.entries(metrics.intersections)) {
        assert.ok(
          area <= 1,
          `${viewport.width}px hero ${pair} intersection=${area.toFixed(2)}px²`,
        );
      }
      samples.set(viewport.width, metrics);
    } finally {
      await context.close();
    }
  }

  for (const [leftWidth, rightWidth] of [[760, 761], [1100, 1101]]) {
    const left = samples.get(leftWidth);
    const right = samples.get(rightWidth);

    for (const element of ["name", "terminal"]) {
      for (const metric of ["top", "width", "height"]) {
        assert.ok(
          Math.abs(left[element][metric] - right[element][metric]) <= 4,
          `${leftWidth}/${rightWidth}px ${element}.${metric} jumped from `
            + `${left[element][metric]} to ${right[element][metric]}`,
        );
      }
    }
  }
});
```

- [ ] **Step 2: Run the boundary test and verify failure**

Run:

```bash
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="responsive boundary pairs" tests/browser-release-gate.test.mjs
```

Expected: FAIL at 760/761 and 1100/1101 continuity, and at 1101–1275 email visibility。

- [ ] **Step 3: Make desktop terminal dimensions continuous**

Change the base Hero media variables to:

```css
.hero-media {
  --hero-terminal-height: clamp(280px, 27vw, 360px);
  width: clamp(340px, 46vw, 600px);
  height: var(--hero-terminal-height);
  min-height: var(--hero-terminal-height);
  max-width: 600px;
  max-height: var(--hero-terminal-height);
}
```

In `@media (max-width: 1100px)`, remove the alternate Hero media width,
height and bottom model. Delete the `@media (min-width: 761px) and
(max-width: 1100px)` Hero positioning override entirely and move:

```css
.foundations-grid {
  grid-template-columns: 1fr;
  gap: 64px;
}
```

into the existing `@media (max-width: 1100px)` block.

- [ ] **Step 4: Define the single stacked Hero mode**

Move only the Hero-specific rules out of `@media (max-width: 760px)` and place
them in `@media (max-width: 900px)` with these values:

```css
@media (max-width: 900px) {
  .hero {
    min-height: 100dvh;
    padding:
      calc(132px + env(safe-area-inset-top))
      max(20px, env(safe-area-inset-right))
      calc(42px + env(safe-area-inset-bottom))
      max(20px, env(safe-area-inset-left));
  }

  .hero-name {
    max-width: none;
    font-size: clamp(90px, 22vw, 144px);
    line-height: .9;
    letter-spacing: -.075em;
    transform: none;
  }

  .hero-copy {
    top: clamp(268px, 31vh, 310px);
    right: max(20px, env(safe-area-inset-right));
    bottom: var(--section-block-space);
    left: max(20px, env(safe-area-inset-left));
    justify-content: space-between;
    gap: 0;
  }

  .hero-positioning {
    max-width: 70ch;
    font-size: clamp(11px, 1.6vw, 13px);
  }

  .hero-statement {
    font-size: clamp(19px, 3.4vw, 26px);
    line-height: 1.55;
    letter-spacing: .03em;
  }

  .hero-statement span {
    white-space: normal;
  }

  .hero-media {
    --hero-terminal-height: clamp(208px, 25vw, 232px);
    z-index: 1;
    top: clamp(390px, 47vh, 430px);
    right: max(20px, env(safe-area-inset-right));
    bottom: auto;
    left: max(20px, env(safe-area-inset-left));
    width: auto;
    max-width: 460px;
    margin-left: auto;
    opacity: .62;
  }
}
```

Keep the narrow-phone terminal density rules under `@media (max-width: 760px)`;
do not hide additional logs at tablet widths.

- [ ] **Step 5: Move the Contact four-column breakpoint**

Change the current Contact rules to:

```css
@media (max-width: 1279px) {
  .contact-socials {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .contact-socials li:nth-child(even) {
    border-left: 1px solid var(--color-line-subtle);
  }

  .contact-socials li:nth-child(n + 3) {
    border-top: 1px solid var(--color-line-subtle);
  }
}

@media (min-width: 1280px) {
  .contact-socials li + li {
    border-left: 1px solid var(--color-line-subtle);
  }
}
```

Keep the existing `@media (max-width: 760px)` one-column override and remove
the even-item left border there.

- [ ] **Step 6: Run the boundary and full viewport tests**

Run:

```bash
npm run build
npm run export:github-pages:from-build
node --test --test-name-pattern="responsive boundary pairs|fresh export passes" tests/browser-release-gate.test.mjs
```

Expected: all boundary pairs and the eight required viewports PASS。

- [ ] **Step 7: Run the full project gate**

Run:

```bash
npm run verify
```

Expected: no overflow, clipping or interaction regressions; performance samples
remain within LCP ≤2.5s、INP ≤300ms、CLS ≤0.1。

- [ ] **Step 8: Commit**

```bash
git add app/globals.css tests/browser-release-gate.test.mjs
git commit -m "fix(layout): smooth responsive breakpoints"
```

### Task 6: Final Release Review

**Files:**
- Review: `app/page.tsx`
- Review: `app/components/MobileLoadFeedback.tsx`
- Review: `app/globals.css`
- Review: `tests/rendered-html.test.mjs`
- Review: `tests/scroll-performance-contract.test.mjs`
- Review: `tests/browser-release-gate.test.mjs`

- [ ] **Step 1: Verify scope and generated-file hygiene**

Run:

```bash
git status --short
git diff HEAD~5 --stat
git diff HEAD~5 -- github-pages-dist
```

Expected: only the approved source, tests, spec and plan are committed;
`github-pages-dist/` has no tracked manual edits。

- [ ] **Step 2: Scan for stale implementation patterns**

Run:

```bash
rg -n 'data-phase="idle".*opacity:\s*0|MINIMUM_LOADING_VISIBILITY_MS|@media \(min-width: 1101px\)|@media \(min-width: 761px\) and \(max-width: 1100px\)' app tests
```

Expected: no stale terminal fade, old loading minimum, old Contact four-column
breakpoint or old tablet Hero positioning rule。

- [ ] **Step 3: Run the definitive release gate**

Run:

```bash
npm run verify
```

Expected:

```text
[release-viewport] 360x800: PASS
[release-viewport] 390x844: PASS
[release-viewport] 430x932: PASS
[release-viewport] 768x1024: PASS
[release-viewport] 820x1180: PASS
[release-viewport] 1280x800: PASS
[release-viewport] 1440x900: PASS
[release-viewport] 1920x1080: PASS
```

All three performance samples must report LCP ≤2500ms、INP ≤300ms、CLS ≤0.1。

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git log -6 --oneline
```

Expected: clean worktree and five focused implementation commits after the
approved design/plan documentation commits。Do not push。
