# 通用 Chrome Agent 桥接器可视化文档站实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `website/` 中建设一个仅供本机浏览的中文多页面可视化技术文档站，完整覆盖现有 README、架构、API、安全和 Codex 差异文档。

**Architecture:** 网站使用 Sites/vinext 多路由结构，原有插件项目保持不变。所有页面从 `website/lib/content/` 的结构化数据生成；搜索、图表、矩阵和内容完整性测试读取同一数据源。交互只在浏览器本机执行，不连接真实 Chrome 桥接器。

**Tech Stack:** Sites/vinext、React、TypeScript、CSS、Vitest、Testing Library、本机 `localStorage`

## Global Constraints

- 网站只在本机浏览器运行，不执行 Sites 托管或公网部署。
- 面向开发者；除 MCP、JSON-RPC、Native Messaging、CDP、Manifest V3、API 等必要名词外，文案使用中文。
- 使用用户确认的 A“技术书刊”视觉方向：暖白纸张、编辑式排版、少量朱红强调，不使用仪表盘式深色大色块、霓虹或无依据指标。
- 现有 `README.md`、`docs/ARCHITECTURE.md`、`docs/API.md`、`docs/SECURITY.md`、`docs/CODEX-DIFFERENCES.md` 是事实来源。
- 文档站不得调用真实 Chrome、读取浏览器数据或请求扩展权限。
- 所有图形必须有文本等价内容；颜色不得作为唯一状态表达方式。
- 当前工作区不是 Git 仓库。不得自动初始化 Git；每个提交步骤仅在用户之后初始化 Git 时执行，否则记录为“跳过：非 Git 工作区”。

---

## File Map

### New site root

- `website/.openai/hosting.json`：Sites 本地项目声明；保留构建配置，不执行发布。
- `website/app/layout.tsx`：全站元数据、字体和 `SiteShell`。
- `website/app/globals.css`：技术书刊视觉变量、排版、响应式和减少动画规则。
- `website/app/page.tsx`：首页。
- `website/app/architecture/page.tsx`：架构总览。
- `website/app/request-flow/page.tsx`：请求全过程。
- `website/app/capabilities/page.tsx`：能力地图。
- `website/app/api/page.tsx`：API 浏览器。
- `website/app/security/page.tsx`：安全模型。
- `website/app/codex-differences/page.tsx`：Codex 差异。
- `website/app/setup/page.tsx`：安装与验证。
- `website/app/not-found.tsx`：中文 404 页面。

### Content model

- `website/lib/content/types.ts`：共享内容类型。
- `website/lib/content/navigation.ts`：路由、分组和阅读顺序。
- `website/lib/content/overview.ts`：首页内容与阅读入口。
- `website/lib/content/architecture.ts`：组件、连接、信任边界和故障路径。
- `website/lib/content/request-flow.ts`：请求步骤和示例载荷。
- `website/lib/content/capabilities.ts`：能力分类、状态和 API 关联。
- `website/lib/content/api.ts`：方法、参数、结果、错误和示例。
- `website/lib/content/security.ts`：威胁、保护、残余风险和加固项。
- `website/lib/content/differences.ts`：架构和能力比较。
- `website/lib/content/setup.ts`：平台、安装步骤和预期结果。
- `website/lib/content/search-index.ts`：从内容层生成搜索记录。

### Components

- `website/components/site-shell.tsx`：侧栏、顶部搜索、面包屑和移动导航。
- `website/components/search-dialog.tsx`：`Ctrl/⌘ + K` 搜索和键盘选择。
- `website/components/architecture-map.tsx`：架构视图和组件详情。
- `website/components/request-stepper.tsx`：步骤播放器。
- `website/components/capability-matrix.tsx`：能力筛选和状态图例。
- `website/components/api-explorer.tsx`：方法搜索、详情和深链接。
- `website/components/security-map.tsx`：信任边界和风险详情。
- `website/components/difference-matrix.tsx`：差异筛选。
- `website/components/setup-guide.tsx`：安装步骤和本机进度。
- `website/components/copy-button.tsx`：复制反馈与降级。
- `website/components/status-badge.tsx`：带图标和文字的统一状态标签。

### Tests

- `website/tests/content-coverage.test.ts`：源文档章节、API、错误码和差异条目覆盖。
- `website/tests/search-index.test.ts`：中文、API 名和错误码搜索。
- `website/tests/request-stepper.test.tsx`：前进、后退、重置和减少动画。
- `website/tests/api-explorer.test.tsx`：筛选、深链接和详情。
- `website/tests/setup-guide.test.tsx`：本机进度保存、清除和无存储降级。
- `website/tests/navigation.test.tsx`：侧栏、搜索快捷键和键盘导航。

---

### Task 1: 初始化 Sites 项目并建立技术书刊视觉骨架

**Files:**
- Create: `website/` starter files through the Sites initializer
- Modify: `website/app/layout.tsx`
- Modify: `website/app/globals.css`
- Modify: `website/package.json`
- Create: `website/vitest.config.ts`
- Create: `website/tests/setup.ts`

**Interfaces:**
- Produces: a working `npm run dev`, `npm run build`, and `npm test` site project
- Produces CSS variables: `--paper`, `--paper-muted`, `--ink`, `--ink-muted`, `--vermillion`, `--safe`, `--warning`, `--danger`, `--rule`

- [ ] **Step 1: Invoke `sites:sites-building` and initialize `website/` once**

Run the Sites initializer with `website/` as the selected project surface. Preserve the generated package manager, lockfile, vinext plugin, and `.openai/hosting.json`. Do not initialize the repository root or overwrite its existing `package.json`.

- [ ] **Step 2: Add the test dependencies and scripts**

Add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, and `@testing-library/user-event` as development dependencies. Add:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write the failing shell test**

Create `website/tests/navigation.test.tsx` with an initial assertion that the layout renders the Chinese product name and all eight route labels.

```tsx
expect(screen.getByRole("link", { name: "架构总览" })).toHaveAttribute("href", "/architecture");
expect(screen.getByRole("link", { name: "安装与验证" })).toHaveAttribute("href", "/setup");
```

- [ ] **Step 4: Run the test and verify failure**

Run: `cd website && npm test -- navigation.test.tsx`

Expected: FAIL because `SiteShell` and the route labels do not exist.

- [ ] **Step 5: Implement the global layout and visual variables**

Replace the starter preview with a minimal site shell placeholder. In `globals.css`, define the confirmed palette and typography:

```css
:root {
  --paper: #f7f3ea;
  --paper-muted: #eee8dc;
  --ink: #28231d;
  --ink-muted: #746d62;
  --vermillion: #c94a32;
  --safe: #2f6b4f;
  --warning: #9a6a21;
  --danger: #9d3f3f;
  --rule: #d9d1c3;
}
```

Remove `app/_sites-preview`, its imports, the temporary preview metadata marker, and `react-loading-skeleton` if no finished component uses it.

- [ ] **Step 6: Run tests and the build**

Run: `cd website && npm test -- navigation.test.tsx && npm run build`

Expected: navigation test PASS and production build succeeds.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website
git commit -m "feat(docs): initialize visual documentation site"
```

If `git status` reports that the workspace is not a repository, skip without initializing Git.

---

### Task 2: 建立结构化内容层和完整性测试

**Files:**
- Create: all files under `website/lib/content/`
- Create: `website/tests/content-coverage.test.ts`

**Interfaces:**
- Produces: `NavigationItem[]`, `ArchitectureComponent[]`, `RequestStep[]`, `Capability[]`, `ApiMethod[]`, `SecurityRisk[]`, `DifferenceItem[]`, `SetupStep[]`
- Produces: `buildSearchIndex(): SearchRecord[]`

- [ ] **Step 1: Define exact shared types**

In `types.ts`, create discriminated unions and stable IDs:

```ts
export type CapabilityStatus = "implemented" | "equivalent" | "different" | "missing" | "unavailable";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export interface ApiParameter { name: string; type: string; required: boolean; description: string; constraints?: string[]; }
export interface ApiMethod { id: string; method: string; title: string; category: string; summary: string; risk: RiskLevel; parameters: ApiParameter[]; result: string; errors: string[]; examples: { label: string; language: "json" | "javascript"; code: string }[]; }
export interface Capability { id: string; title: string; category: string; status: CapabilityStatus; summary: string; apiMethods: string[]; differenceId?: string; }
export interface SearchRecord { id: string; title: string; description: string; href: string; keywords: string[]; kind: "page" | "api" | "error" | "capability"; }
```

- [ ] **Step 2: Write failing coverage tests against the source documents**

The test reads the five source Markdown files from `../../` and extracts:

- every backticked `browser.*`, `policy.*`, and `bridge.*` method from `docs/API.md`
- every uppercase error code from the common error table
- every capability row from `docs/CODEX-DIFFERENCES.md`
- every H2/H3 heading from all source files

Assert that each extracted method exists in `apiMethods`, each error exists in an API error list or error record, each capability comparison exists in `differenceItems`, and every major heading maps to a route or content section.

- [ ] **Step 3: Run coverage tests and verify failure**

Run: `cd website && npm test -- content-coverage.test.ts`

Expected: FAIL listing all source methods and comparison rows not yet represented.

- [ ] **Step 4: Populate the content modules from the source documents**

Translate explanatory prose to Chinese while preserving exact method names, error codes, commands, file names, host names, and protocol terms. Do not invent percentages, benchmark data, capabilities, or compatibility claims.

The API list must include every method currently documented in `docs/API.md`, including bridge, policy, browser lifecycle, observation, interaction, CDP, event, history, bookmark, and download methods.

- [ ] **Step 5: Build the search index from shared data**

Implement `buildSearchIndex()` by concatenating navigation pages, API methods, capability items, and error codes. Chinese titles, English methods, aliases, and error codes must be indexed.

- [ ] **Step 6: Run the content tests**

Run: `cd website && npm test -- content-coverage.test.ts search-index.test.ts`

Expected: PASS with zero missing source methods, errors, comparison rows, or major topics.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/lib/content website/tests
git commit -m "feat(docs): add structured Chinese documentation content"
```

---

### Task 3: 完成全站导航、搜索和阅读框架

**Files:**
- Create: `website/components/site-shell.tsx`
- Create: `website/components/search-dialog.tsx`
- Create: `website/components/copy-button.tsx`
- Modify: `website/app/layout.tsx`
- Test: `website/tests/navigation.test.tsx`
- Test: `website/tests/search-index.test.ts`

**Interfaces:**
- Consumes: `navigationItems`, `buildSearchIndex()`
- Produces: `<SiteShell>{children}</SiteShell>`, `<SearchDialog records={records} />`, `<CopyButton value={string} />`

- [ ] **Step 1: Expand failing navigation and search tests**

Cover sidebar links, `Ctrl+K`, `Meta+K`, search-result keyboard movement, Escape closing, no-results copy, mobile navigation toggle, and copy feedback.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd website && npm test -- navigation.test.tsx search-index.test.ts`

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement `SiteShell`**

Desktop: fixed sidebar and content column. Mobile: a labelled menu button opens a modal/drawer. Use the route data for both so labels cannot diverge.

- [ ] **Step 4: Implement `SearchDialog`**

Filter `SearchRecord[]` by normalized Chinese text, method name, alias, and error code. Results must be real links, support ArrowUp/ArrowDown/Enter, and announce the result count through an `aria-live` region.

- [ ] **Step 5: Implement copy feedback and fallback**

Use `navigator.clipboard.writeText`. On rejection, select a read-only text area and show “复制失败，已选中文本，请手动复制”。

- [ ] **Step 6: Run tests and build**

Run: `cd website && npm test -- navigation.test.tsx search-index.test.ts && npm run build`

Expected: PASS and build succeeds.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/components website/app/layout.tsx website/tests
git commit -m "feat(docs): add navigation and full-text search"
```

---

### Task 4: 建设首页和架构总览

**Files:**
- Create: `website/components/architecture-map.tsx`
- Modify: `website/app/page.tsx`
- Create: `website/app/architecture/page.tsx`
- Create: `website/tests/architecture-map.test.tsx`

**Interfaces:**
- Consumes: `architectureComponents`, `architectureConnections`, `architectureViews`
- Produces: `<ArchitectureMap initialView="data-flow" />`

- [ ] **Step 1: Write failing architecture interaction tests**

Assert that the six primary system layers are visible, clicking “本机宿主” opens its responsibilities, and switching to “权限边界” exposes the site policy and token boundary.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- architecture-map.test.tsx`

Expected: FAIL because `ArchitectureMap` does not exist.

- [ ] **Step 3: Implement the homepage**

Use a concise headline, the verified simplified chain, and three reading paths: “理解系统”“接入开发”“评估安全”. Display only verifiable counts derived from content arrays.

- [ ] **Step 4: Implement the architecture map**

Use semantic buttons and CSS connectors. Views: `data-flow`, `trust-boundaries`, `failure-paths`. Each component detail includes responsibilities, inputs, outputs, dependencies, security boundary, failure effect, and code files.

- [ ] **Step 5: Add a complete textual equivalent**

Below the interactive map, render the same components in document order so the architecture remains understandable without JavaScript.

- [ ] **Step 6: Run test and build**

Run: `cd website && npm test -- architecture-map.test.tsx && npm run build`

Expected: PASS and both routes build.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/app website/components/architecture-map.tsx website/tests/architecture-map.test.tsx
git commit -m "feat(docs): visualize system architecture"
```

---

### Task 5: 建设请求播放器和能力地图

**Files:**
- Create: `website/components/request-stepper.tsx`
- Create: `website/components/capability-matrix.tsx`
- Create: `website/components/status-badge.tsx`
- Create: `website/app/request-flow/page.tsx`
- Create: `website/app/capabilities/page.tsx`
- Test: `website/tests/request-stepper.test.tsx`

**Interfaces:**
- Consumes: `requestSteps`, `capabilities`, `CapabilityStatus`
- Produces: `<RequestStepper steps={requestSteps} />`, `<CapabilityMatrix items={capabilities} />`

- [ ] **Step 1: Write failing request and filter tests**

Cover next, previous, reset, keyboard control, masked token display, category filtering, status filtering, and clear-filters behavior.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- request-stepper.test.tsx`

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement `RequestStepper`**

Show step number, active layer, request/response direction, example payload, policy decision, and result. Use CSS transition only when `prefers-reduced-motion: no-preference`; otherwise switch states instantly.

- [ ] **Step 4: Implement `CapabilityMatrix`**

Render category groups and status badges with icon, label, and color. Each item links to its API methods and optional Codex difference entry.

- [ ] **Step 5: Add narrow-screen layouts**

Convert matrix rows to cards under 720px. Keep the request step list vertically readable without horizontal shrinking.

- [ ] **Step 6: Run focused and full tests**

Run: `cd website && npm test -- request-stepper.test.tsx && npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/app/request-flow website/app/capabilities website/components website/tests/request-stepper.test.tsx
git commit -m "feat(docs): add request flow and capability map"
```

---

### Task 6: 建设 API 浏览器

**Files:**
- Create: `website/components/api-explorer.tsx`
- Create: `website/app/api/page.tsx`
- Test: `website/tests/api-explorer.test.tsx`

**Interfaces:**
- Consumes: `ApiMethod[]`
- Produces: `<ApiExplorer methods={apiMethods} initialMethodId={string | null} />`
- URL contract: `/api?method=browser-click` opens the matching method

- [ ] **Step 1: Write failing API explorer tests**

Test method search by Chinese summary and `browser.click`, category filtering, risk filtering, query-string selection, parameter rendering, error-code links, example switching, and copy action.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- api-explorer.test.tsx`

Expected: FAIL because `ApiExplorer` is absent.

- [ ] **Step 3: Implement list and deep-link selection**

Read `method` from `URLSearchParams`. Selecting a method updates the query string with `history.replaceState` and keeps the list position stable.

- [ ] **Step 4: Implement the details panel**

Render method name, Chinese summary, risk badge, parameters, constraints, result, common errors, and all examples. Required parameters must have both text and visual marks.

- [ ] **Step 5: Provide no-JavaScript reference content**

The route server-renders a complete categorized method index before client enhancement. No method may be available only through a hidden client-side state.

- [ ] **Step 6: Run coverage, component test, and build**

Run: `cd website && npm test -- api-explorer.test.tsx content-coverage.test.ts && npm run build`

Expected: PASS with every documented method present.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/app/api website/components/api-explorer.tsx website/tests/api-explorer.test.tsx
git commit -m "feat(docs): add searchable API explorer"
```

---

### Task 7: 建设安全模型和 Codex 差异页

**Files:**
- Create: `website/components/security-map.tsx`
- Create: `website/components/difference-matrix.tsx`
- Create: `website/app/security/page.tsx`
- Create: `website/app/codex-differences/page.tsx`
- Create: `website/tests/security-differences.test.tsx`

**Interfaces:**
- Consumes: `securityBoundaries`, `securityRisks`, `defaultProtections`, `hardeningItems`, `differenceItems`
- Produces: `<SecurityMap />`, `<DifferenceMatrix />`

- [ ] **Step 1: Write failing security and comparison tests**

Cover boundary selection, risk details, protection and residual risk, status filtering, “不可复用” explanation, and explicit wire-incompatibility text.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- security-differences.test.tsx`

Expected: FAIL because both components are absent.

- [ ] **Step 3: Implement the trust-boundary diagram**

Render caller, local IPC, Native Messaging, extension permissions, page content, and sensitive metadata as semantic nodes. The detail area must always show threat, current protection, residual risk, and production recommendation.

- [ ] **Step 4: Implement the difference matrix**

Support `equivalent`, `same-pattern`, `different`, `missing`, and `unavailable` filters. Include the architecture table, capability table, reuse list, and the explicit statement that the project is not wire-compatible with the OpenAI extension or Native Host.

- [ ] **Step 5: Run test and content coverage**

Run: `cd website && npm test -- security-differences.test.tsx content-coverage.test.ts`

Expected: PASS and every source comparison row is represented.

- [ ] **Step 6: Commit when Git is available**

```bash
git add website/app/security website/app/codex-differences website/components website/tests/security-differences.test.tsx
git commit -m "feat(docs): visualize security and Codex differences"
```

---

### Task 8: 建设本机安装与验证向导

**Files:**
- Create: `website/components/setup-guide.tsx`
- Create: `website/app/setup/page.tsx`
- Create: `website/tests/setup-guide.test.tsx`

**Interfaces:**
- Consumes: `setupPlatforms`, `setupSteps`
- Produces: `<SetupGuide storageKey="universal-bridge-docs.setup.v1" />`

- [ ] **Step 1: Write failing progress and fallback tests**

Test Windows default, platform switch, step completion, reload restoration, clear progress, expected-result expansion, clipboard failure, and `localStorage` exception fallback.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- setup-guide.test.tsx`

Expected: FAIL because `SetupGuide` is missing.

- [ ] **Step 3: Implement the platform-aware guide**

Windows is the default verified path. macOS/Linux sections show platform-specific manifest paths and clearly label which steps were not verified in the current Windows environment.

- [ ] **Step 4: Implement local progress safely**

Store only an array of completed step IDs. Wrap all storage reads and writes in `try/catch`; on failure show “当前浏览器不会保存进度”，without blocking the guide.

- [ ] **Step 5: Add expected results and failure help**

Every step includes exact command, operation location, expected visible result, and common failure reason. Do not place secrets or real extension IDs in examples.

- [ ] **Step 6: Run tests and build**

Run: `cd website && npm test -- setup-guide.test.tsx && npm run build`

Expected: PASS and setup route builds.

- [ ] **Step 7: Commit when Git is available**

```bash
git add website/app/setup website/components/setup-guide.tsx website/tests/setup-guide.test.tsx
git commit -m "feat(docs): add local installation guide"
```

---

### Task 9: 完成可访问性、响应式和错误降级

**Files:**
- Modify: `website/app/globals.css`
- Create: `website/app/not-found.tsx`
- Modify: all interactive components as findings require
- Create: `website/tests/accessibility-behavior.test.tsx`

**Interfaces:**
- Consumes all finished site components
- Produces consistent focus, reduced-motion, mobile, no-results, copy-failure, and storage-failure behavior

- [ ] **Step 1: Write failing accessibility behavior tests**

Assert visible focus class hooks, labelled icon buttons, non-color status text, search result announcements, reduced-motion class behavior, and meaningful empty states.

- [ ] **Step 2: Run and verify failure**

Run: `cd website && npm test -- accessibility-behavior.test.tsx`

Expected: FAIL with missing labels or states identified by the test.

- [ ] **Step 3: Implement global responsive and reduced-motion rules**

At 960px collapse the persistent sidebar; at 720px switch matrices/tables to cards; at 480px reduce page gutters without reducing body text below 16px.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

- [ ] **Step 4: Add explicit error and empty states**

Implement Chinese 404, no search result, no filtered capability, no filtered difference, invalid API query, copy failure, and unavailable storage messages with recovery actions.

- [ ] **Step 5: Run all website tests**

Run: `cd website && npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit when Git is available**

```bash
git add website
git commit -m "fix(docs): complete responsive and accessible behavior"
```

---

### Task 10: 最终内容审计、构建和本机交付

**Files:**
- Modify: `website/README.md`
- Modify: root `README.md` to add a local visual-docs link and start instructions
- Modify: any content file required by audit findings

**Interfaces:**
- Produces final local start command and complete validated site

- [ ] **Step 1: Run source-to-site coverage tests**

Run: `cd website && npm test -- content-coverage.test.ts search-index.test.ts`

Expected: PASS with zero missing methods, errors, headings, or Codex comparison rows.

- [ ] **Step 2: Run the complete website test suite**

Run: `cd website && npm test`

Expected: all tests PASS.

- [ ] **Step 3: Run the original bridge test suite**

Run from repository root: `npm.cmd test`

Expected: all existing Native Messaging, policy, executable, and MCP tests PASS.

- [ ] **Step 4: Run the production build**

Run: `cd website && npm run build`

Expected: production build succeeds with all eight routes.

- [ ] **Step 5: Start the local site and verify route availability**

Run: `cd website && npm run dev`

Use the exact Local URL printed by the development server. Verify `/`, `/architecture`, `/request-flow`, `/capabilities`, `/api`, `/security`, `/codex-differences`, and `/setup` return successful pages. Do not publish or invoke `sites-hosting`.

- [ ] **Step 6: Update local usage documentation**

Document the exact local command, expected local URL behavior, route list, test command, build command, and statement that the site never connects to the real browser bridge.

- [ ] **Step 7: Commit when Git is available**

```bash
git add README.md website docs/superpowers
git commit -m "docs: deliver local visual documentation portal"
```

If Git is unavailable, provide the complete changed-file list in the handoff instead.
