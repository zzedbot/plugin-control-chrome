# 2026-09-11 至 2026-09-15 续作验证记录

## 已完成

- `npm run check`：通过。
- `npm test`：76/76 通过，0 跳过；包括重建后的 Native Host 可执行文件版本检查。
- `git diff --check`：无空白错误，仅 LF/CRLF 提示。
- `npm run build:host`：完成，Host/MCP 版本来自 package.json（0.1.12）。
- `npm run install:host -- --extension-id ndlghihiphbagmllgmakcplcfgedcdbj`：完成，注册带构建哈希的独立文件；运行中的旧 Host 未终止。
- 部署扩展目录：`E:\AI\lingee\workspace\control-chrome\extension`。五个运行文件已同步：manifest.json、background.js、debugger-controller.js、foreign-frame-monitor.js、monitor-injection.js。
- E2E 运行前检查扩展、Host 版本和 `remove-after-blank-v11` / `generation-v4` 标记，检查失败时不打开测试标签。

## 独立审查

第一轮确认并修复：

1. onDetach 的旧异步清理可能删除重新安装的监控器：加入清理屏障和回归测试。
2. 顶层 fallback 成功仍误报失败、缓存过时 documentId：使用实际结果及新枚举验证，增加六个模拟 API 用例。
3. srcdoc 被移除后外部 iframe 可恢复：增加 srcdoc 属性观察和行为回归。

第二轮独立审查执行 24 项局部测试，通过，未发现上述修复的新增确认问题。仍有 P2 限制：已连接 host 在初次扫描之后创建的新 shadow root 不一定被发现。已在架构文档和交接记录中注明，尚未解决。

## 真实浏览器证据及断点

### 0.1.3 修复候选

重新加载 0.1.2 后已确认 v2 标记，但基础 E2E 在 `debugger.attach` 返回 `Cannot access a chrome-extension:// URL of different extension`。这证明 documentId 注入已运行，却未消除 Chrome 的安全主体检查。根据 Chromium `debugger_api.cc`，附加会检查每个 RenderFrameHost 的 committed URL 和 SiteInstance security principal；仅使用 srcdoc 可能仍保留外部扩展主体。

源码已推进到 0.1.3：外部扩展 frame 元素改为移除，框架树需连续三次检查无外部扩展 URL；失败诊断只返回计数，不返回 URL 或内容。运行证据需在重新构建、安装、同步并由用户重新加载后取得。

### 0.1.3 真实结果与 0.1.4 候选

0.1.3 基础真实 E2E 已通过，Host/扩展版本与 remove-frame-v3 标记、claim、DOM、点击、结果读取和清理均成功。显式 Surfingkeys frame 回归仍在 debugger.attach 失败；诊断为 pageFrameCount=1、foreignFrameCount=0，页面监控器 foreignFramesSeen=1、removedFrames=1。这表明删除后 Chrome 仍暂时保留受限安全主体。

0.1.4 改为把该 frame 导航到 `about:blank`，并在框架枚举连续三次无外部扩展 URL 后附加。

### 0.1.4 最终真实结果（2026-09-15）

- 新实例 `49da5f6a-eea8-4538-89e7-8cc28a92b6c1`；Host 与扩展均为 0.1.4。
- 兼容性标记：about-blank-v4、generation-v2、counts-v1。
- `npm run test:chrome`：通过，foreignFrameChecked=false。
- 使用 Surfingkeys 1.19.1 的 `pages/frontend.html` 执行 `npm run test:chrome:foreign-frame`：通过，foreignFrameChecked=true。
- 两项真实测试均完成标签页创建、claim、DOM 读取、点击、结果复核、detach 和关闭清理。
- 0.1.4 构建后 `npm run check` 与 `npm test` 通过，68/68；`git diff --check` 无空白错误。

### 0.1.5 终审修复候选

独立终审确认导航刷新存在操作屏障缺口：已附加标签页导航后，页面操作可能早于监控器重装完成；重装失败也会保留已附加快路径。0.1.5/generation-v3 让 ensure 等待刷新，刷新失败时撤销控制、分离调试器并移除监控器。另修复 detach 与 already-attached 响应交错时可能遗漏自有陈旧会话清理的问题。

新增三个控制器并发测试；E2E 增加 claim 后导航，并在成功路径断言 detach、关闭及标签页不存在。0.1.5 尚待部署重新加载后的两项真实 E2E。

### 0.1.5 真实结果与 0.1.6 候选

0.1.5 基础真实 E2E 通过。Surfingkeys 回归在 claim 后导航的 domSnapshot 阶段以 FOREIGN_FRAME_MONITOR_FAILED 安全失败；诊断显示 pageFrameCount=3、foreignFrameCount=0，顶层监控器 blankedFrames=2。两个已提交 about:blank 的惰性子文档被错误纳入重装覆盖检查。

0.1.6/about-blank-v5 排除非顶层 about:blank/about:srcdoc 文档，仍监控顶层和普通页面子文档；新增策略单元测试。

### 0.1.6 最终真实结果（2026-09-15）

- 新实例 `9bd9780a-59e2-4a69-a577-5095b7d271a6`；Host 与扩展均为 0.1.6。
- 兼容性标记：about-blank-v5、generation-v3、counts-v1。
- `npm run test:chrome`：通过，含 claim 后导航与成功清理断言。
- Surfingkeys `pages/frontend.html` 的 `npm run test:chrome:foreign-frame`：通过，foreignFrameChecked=true。
- 当前必做真实浏览器验证闭环完成。

### 0.1.7 最终复核修复候选

复核确认 0.1.6 按 URL 跳过全部非顶层 about:blank/about:srcdoc 会遗漏页面自有的可执行空白文档。0.1.7/about-blank-v6 仅跳过在前一帧枚举中已识别为外部扩展 URL、随后导航到 about:blank 的 frameId；普通 about:blank 和所有 about:srcdoc 仍注入监控。新增归因策略测试。

generation-v4 将刷新失败后的 debugger/monitor 清理登记为 detachment barrier，显式 detach 会等待清理真正结束；新增窄竞态测试。0.1.7 尚待部署重新加载后的两项真实 E2E。

### 0.1.8 最终复核修复候选

复核确认 0.1.7 的归因 frameId 豁免仍留下可写的 about:blank 子文档，页面可在其中再次创建外部扩展 iframe，而父文档监控器无法跨 document 观察。0.1.8/remove-after-blank-v7 在安全空白导航的 load 事件中移除原元素，后台同时等待已归因 frameId 从框架树消失；成功后清空临时豁免。普通 about:blank/srcdoc 继续安装监控。

E2E fixture 新增空白文档复用尝试：页面先注册 load 处理器并在安全空白文档中创建嵌套扩展 iframe，随后要求原 frame 连同嵌套内容被监控器移除。0.1.8 已完成构建、Host 安装、部署目录同步，`npm run check` 与 `npm test`（73/73）通过；尚待用户重新加载后的两项真实 Chrome E2E。

### 0.1.8 真实结果与 0.1.9 候选

0.1.8 基础 E2E 通过。增强 Surfingkeys 回归首次安全失败、窄重试及随后三次通过、第四次再次安全失败，确认存在可复现竞态。失败时 foreignFrameCount=0，顶层诊断显示 foreignFramesSeen=2、blankedFrames=2、removedFrames=2，但 pageFrameCount=2 且残留子文档 diagnosticUnavailable；原因是页面在空白文档复用测试中创建的嵌套 frame 随父元素移除后仍短暂出现在 Chrome 框架枚举中。

0.1.9/remove-after-blank-v8 将已归因外部 frame 的整个后代 frameId 子树纳入临时排除和消失屏障，直到每个残留后代都从框架树中消失；新增多层后代追踪与逐步消失测试。已重新构建、安装并同步部署目录，`npm run check` 与 `npm test`（74/74）通过；待用户重新加载并执行真实回归。

### 0.1.9 真实结果与 0.1.10 候选

0.1.9 基础 E2E 通过；增强 Surfingkeys 回归连续三次通过后第 4 次再次安全失败。诊断中外部 URL 已清零、两个元素已移除，但两个后代文档短暂残留且不可注入。根因是子树更新先清理已消失父 ID，再扩展本轮才出现的后代，丢失了跨枚举轮次的父子归因。

0.1.10/remove-after-blank-v9 改为先使用上一轮父 ID 递归归因当前后代，再清理已消失 ID；增加“父已消失、子随后出现”的专门回归测试。已构建安装、同步部署目录，`npm run check` 与 `npm test`（75/75）通过；待用户重新加载及真实回归。

### 0.1.10 真实结果与 0.1.11 候选

0.1.10 基础 E2E 通过；增强 Surfingkeys 回归连续四次通过后第 5 次安全失败。跨轮父子归因已生效，但销毁中的已归因后代并不保证始终报告 about:blank；旧注入策略仍会把临时非空 URL 当作普通页面文档并尝试注入。

0.1.11/remove-after-blank-v10 在消失屏障完成前按 frameId 临时排除整个已归因子树，不再依赖瞬时 URL。屏障仍要求所有归因 frameId 实际消失，因此不会把持久页面文档当作已覆盖；新增临时 URL 策略测试。已构建安装、同步部署目录，`npm run check` 与 `npm test`（75/75）通过；待用户重新加载及真实回归。

### 0.1.11 真实结果与 0.1.12 候选

0.1.11 基础 E2E 通过；增强 Surfingkeys 回归连续两次通过后第 3 次安全失败。诊断仍为外部 URL 清零、元素已移除，但两个销毁中文档短暂不可注入，说明 Chrome 的内部 frame 替换并不总能仅靠页面可见的 frameId/URL 关联。

0.1.12/remove-after-blank-v11 将覆盖确认从两次无间隔枚举改为最多 20 次、每次 25ms 的有界稳定化重试。每轮重新读取当前框架树并要求所有正常页面文档确实已安装监控；持续存在且无法注入的文档仍返回 FOREIGN_FRAME_MONITOR_FAILED。新增多轮残留后消失的回归测试。已构建安装、同步部署目录，`npm run check` 与 `npm test`（76/76）通过；待用户重新加载及真实回归。

### 0.1.12 最终真实结果（2026-09-15）

- 新实例 `a05c1253-11a5-40c6-ab45-c994b90ea556`；Host 与扩展均为 0.1.12。
- 兼容性标记：remove-after-blank-v11、generation-v4、counts-v2。
- `npm run test:chrome`：通过，含 claim 后导航、DOM、点击、结果读取、detach、关闭和标签页不存在断言。
- Surfingkeys 1.19.1 `pages/frontend.html` 的增强回归连续 10/10 轮通过；fixture 每轮尝试在安全 about:blank 文档内创建嵌套外部扩展 iframe，并确认原 frame 及其子树被移除。
- 此前 0.1.8 至 0.1.11 在第 3–5 轮可复现的短暂销毁文档覆盖误判，在本轮压力回归中未再出现。
- 0.1.12 的源码、已构建 Host、已安装哈希命名 Host 与部署扩展目录一致；工作区保留未提交状态。

### 0.1.13 品牌与图标更新

- 下载用户指定的 Lingee favicon，验证为 PNG，实际尺寸 48×48，SHA-256 为 `AFE1A3480F3AE50ECD6578DCFFC53C00BED3D3920BC4BC0F7B90EEC3873A5534`。
- 原图保存为 `extension/icons/lingee-48.png`，manifest 的扩展图标和 action 工具栏图标均按真实 48px 尺寸引用该文件。
- 用户可见产品名统一为 `Lingee Chrome Agent Bridge`；npm/MCP 标识改为 `lingee-chrome-agent-bridge`。Native Messaging 主机名、运行目录和既有技能目录等内部兼容标识保持不变。
- 0.1.13 Host 已构建安装，manifest 与图标已同步至部署目录；源文件与部署文件哈希一致。
- `npm run check` 与 `npm test`（76/76）通过；待用户重新加载确认运行版本和图标显示。

### Lingee Chrome Control Skill 更名

- 仓库目录从 `skills/control-universal-chrome` 迁移到 `skills/lingee-chrome-control`，frontmatter 名称改为 `lingee-chrome-control`。
- `agents/openai.yaml` 的显示名为 `Lingee Chrome Control`，默认提示显式引用 `$lingee-chrome-control`。
- 测试、设计文档、交接路径及调用示例已同步；本机安装目录也迁移到 `C:\Users\fcliq\.codex\skills\lingee-chrome-control`，旧目录不再保留。
- 官方 `quick_validate.py` 对仓库副本和安装副本均验证通过。

### 0.1.14 可见虚拟鼠标

- 新增 `extension/virtual-cursor.js`：封闭 Shadow DOM 内绘制白色、Lingee 紫色描边的箭头，点击显示脉冲，1.8 秒无动作后淡出。
- 已接入语义点击、坐标移动/点击、滚轮和逐步拖拽；解除调试器控制时清理覆盖层，受限页面无法注入时不阻断底层输入。
- `browser.getInfo` 新增 `virtualCursor: "overlay-v1"` 与 `virtualCursor` capability；真实 E2E 前置检查会拒绝旧扩展，E2E 会验证覆盖层宿主、状态和坐标。
- 0.1.14 Host 已构建并安装；`npm run check` 与 `npm test`（78/78）通过。部署目录已同步。
- 用户重新加载后，实例 `d1c22976-5b08-4799-b86f-a015162f20aa` 的 Host/扩展均报告 0.1.14，Chrome 为 152.0.0.0，兼容标记包含 `virtualCursor: "overlay-v1"`。
- `npm run test:chrome` 真实 E2E 通过并报告 `virtualCursorChecked: true`；另用独立回环页面完成语义点击截图，目视确认箭头尖端位于按钮点击坐标，延迟 100ms 截图确认紫色点击脉冲处于动画中间帧。测试标签均已 detach 并关闭。

本轮公开桥接口读取结果：

- Host 连接正常，但运行版本仍为 0.1.0。
- 实际扩展版本为 0.1.1，没有新兼容性标记。
- Chrome 根进程命令行仅含 about:blank，不能证明是独占测试进程；未终止。
- 已请求用户手动完全退出并重新打开 Chrome，尚未收到完成回复。
- 旧版本失败记录保留用于追溯；最新 0.1.4 的基础与外部 frame 真实 E2E 均已通过。

只读核验 Surfingkeys 1.19.1 manifest：`pages/frontend.html` 列在 web_accessible_resources 中，matches 为 `<all_urls>`。该核验仅证明声明允许加载，尚未取得真实加载/中和证据。

## 恢复步骤

### 用户重启后的实际检查

用户已确认重启。重新发现的新实例为 `0ea6ab31-823d-47c4-8bbb-c6196d936444`，Host 和扩展均报告 0.1.2，但 `browser.getInfo` 仍没有 compatibility 字段。源码与部署目录的 background.js 均明确包含 v2 标记，因此运行代码与磁盘不一致，具体缓存/加载原因尚未确认。

已执行基础 E2E 命令，前置检查以 `Reload Chrome: foreign-frame monitor code is stale` 拒绝，未打开测试标签页，未执行 claim/DOM/点击。这不是基础 E2E 通过。已请求用户在 `chrome://extensions` 手动点击 Lingee Chrome Agent Bridge 的“重新加载”，待确认后再次检查。无需再次盲目重启整个浏览器。

1. 用户重启 Chrome 后，重新发现实例并明确设置实例 ID。
2. 检查 Host 和扩展均为 0.1.2，且扩展返回 v2 标记。
3. 执行基础 `npm run test:chrome`。
4. 设置 `UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL` 为 `chrome-extension://gfbliohnnapiefjpjlpjnehglfpaknnc/pages/frontend.html`，执行 `npm run test:chrome:foreign-frame`。
5. 外部回归除中和后 DOM/点击验证外，还应补原始资源确实加载的证据，防止不可访问资源导致误判覆盖。
6. 根据分阶段错误修复、复测，再更新本记录。当前没有自动提交或发布。
