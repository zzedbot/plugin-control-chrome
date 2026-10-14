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

### 0.1.15 常驻虚拟鼠标候选

- 调试器首次附加后先按当前 CSS 视口宽高居中显示箭头；后续指针动作移动同一个覆盖层，不再设置淡出计时器。
- 页面导航完成监控器刷新后重新居中注入；覆盖层宿主被页面移除时由独立世界的 MutationObserver 恢复，detach 时先断开观察器再移除宿主。
- 兼容标记升级为 `virtualCursor: "overlay-v2"`，E2E 前置检查会拒绝仍运行 0.1.14/overlay-v1 的扩展。
- 0.1.15 Host 已构建安装，扩展部署目录逐文件哈希一致；`npm run check` 与 `npm test`（78/78）通过。E2E 已增加 claim 后居中、导航后居中和移动到目标坐标三段断言，待用户重新加载后的真实 Chrome 验收。

### 0.1.16 视口 resize 居中修复候选

- 0.1.15 重新加载后的增强 E2E 通过，但等待 2.5 秒的常驻验收发现：Chrome 显示调试提示条后页面视口高度缩小，未移动的箭头停留在旧中心。
- 新增 resize 跟随：箭头尚未被动作移动时随当前视口保持居中；执行指针动作后解除中心锚定，窗口变化不会覆盖动作坐标。detach 同时移除 resize 监听。
- 版本升级为 0.1.16，兼容标记升级为 `virtualCursor: "overlay-v3"`，避免已加载的 0.1.15/overlay-v2 被误判为修正版。Host 已构建安装，扩展部署目录逐文件哈希一致，`npm run check` 与 `npm test`（78/78）通过；待重新加载后重跑 2.5 秒常驻验收。
- 用户重新加载后，实例 `f22dde34-ba39-4226-9760-9c6461ce30a1` 的 Host/扩展均报告 0.1.16，Chrome 152 报告 `virtualCursor: "overlay-v3"`。增强 `npm run test:chrome` 通过 claim 居中、导航后居中和坐标移动断言。

### 0.1.17 Precision Glass 受控反馈

- 按用户确认的 `precision-glass.html` 设计实现顶部玻璃状态条、Lingee 图标、接管边缘扫光、30×38 白色双描边鼠标、双层点击波纹与中心闪点、滚动方向胶囊和拖拽起点连线，并加入 `prefers-reduced-motion` 降级。
- `browser.wheel` 与 `browser.scroll` 会向覆盖层传递滚动方向和强度；`browser.drag` 会传递起点和当前位置。覆盖层保持封闭 Shadow DOM、`pointer-events:none` 和最大层级，不改变 CDP 输入结果。
- 版本升级为 0.1.17。首次真实 E2E 发现全屏拖拽 SVG 恢复了默认命中测试并挡住页面按钮；Shadow 宿主和全部子元素现均强制 `pointer-events:none`，并新增源码级断言。兼容标记随修复升级为 `virtualCursor: "overlay-v5"`，以拒绝仍加载缺陷版 `overlay-v4` 的实例。
- Host 已构建并安装到 `universal-browser-host-8c14a274dc9b7761.exe`，六个运行脚本、manifest 和图标已同步到 Chrome 解包扩展目录并通过 SHA-256 一致性检查。重新加载 `overlay-v5`、`overlay-v6` 和 `overlay-v7` 后真实 E2E 均通过；截图确认点击与滚动已对齐，但 class 切换未取消浏览器中已经运行的拖拽 transition。拖拽阶段现直接设置内联 `transition-duration:0ms`，在释放前等待最终坐标稳定，再恢复 70ms 动画，标记升级为 `overlay-v8`。
- 最终重新加载后，运行实例 `cce72e91-202e-46c3-82cc-0b421c2fa46e` 报告 Host/扩展 0.1.17 和 `virtualCursor: "overlay-v8"`。`npm run test:chrome` 通过；实机关键帧确认状态条与图标常驻，点击箭头尖端和波纹中心一致，滚动胶囊贴近箭头，拖拽箭头、连线终点与释放波纹对齐，detach 后测试标签已清理。`npm run check` 通过，`npm test` 为 78/78 通过。

### 0.1.18 可见快速移动

- 普通鼠标移动改为按距离计算的 180–360ms 缓动，到达后停留 70ms 再执行点击或滚轮，避免原 70ms 移动与 80ms 等待导致操作一闪而过。
- 后台按受控标签页保存最后坐标；导航产生新文档后，Precision Glass 覆盖层从该坐标恢复，不再重新居中。首次接管仍从视口中心开始，detach 或关闭标签页时清理状态。
- 拖拽每帧增加 16ms 节奏，保持快速的同时让路径可见。兼容标记升级为 `virtualCursor: "overlay-v9"`，版本升级为 0.1.18。
- 重新加载 0.1.18 后，实机截图发现原页面仍保留不再受新版控制的 `overlay-v8` 箭头；刷新页面后 `overlay-v9` 可正确移动。0.1.19/`overlay-v10` 在创建新版覆盖层前断开历史观察器并移除所有历史覆盖层宿主，避免旧箭头停在中心造成误判。
- 重新加载最终 0.1.19 后，运行实例 `c853db0d-2629-4b76-9cb9-5d9919a606a2` 报告 Host/扩展 0.1.19 和 `virtualCursor: "overlay-v10"`。增强 E2E 通过，覆盖首次接管居中、两次导航坐标继承、移动与点击、detach 和标签清理。云之家登录页实机验收中，箭头从中心移动至二维码区域后再移动至左侧资讯区，最终画面仅保留一个位于目标位置的箭头，中心无历史覆盖层残留。
- 独立常驻验收只 claim 回环页面，不执行指针动作，等待 2500ms 后仍读取到 `state: "move"`；当前视口为 1023×1090，光标为 (512,545)，与视口中心一致。截图确认箭头可见，随后已 detach 并关闭测试标签。

### 0.1.20 顶层覆盖与可靠初始化

- 根因一：Shadow DOM 的 `:host { all: initial !important }` 会覆盖宿主内联样式中没有 `!important` 的 `position`、`inset` 和 `z-index`，因此此前写入的最大 z-index 并不可靠。
- 根因二：接管和导航刷新只尝试一次注入；若新文档尚未创建 `documentElement`，注入会正常返回 `visible: false`，后台却不会重试。导航刷新回调中的异常也只记录事件，可能留下仍受控但无覆盖层的新文档。
- 0.1.20/`overlay-v11` 在 Shadow 宿主内外重复声明关键固定定位与最大层级，使用 manual popover 进入浏览器 top layer，并在页面打开 dialog、popover 或进入全屏后重新提升。
- 新增有界注入恢复：接管时立即重试，并在顶层文档的 `DOMContentLoaded`、导航刷新和标签完成加载时再次确保覆盖层存在。子 frame 提交不再触发顶层覆盖层刷新。
- `npm run check` 通过；重建 Native Host 后 `npm test` 为 78/78 通过。源码与 Chrome 解包部署目录的 7 个运行文件 SHA-256 一致，0.1.20 Host 已注册。
- 在 `chrome://extensions` 重新加载后，运行实例 `403fc06f-a8de-46b7-886f-1f70245320bb` 报告 Host/扩展均为 0.1.20，兼容标记为 `overlay-v11`。增强真实 E2E 校验宿主计算样式为 `position: fixed`、`z-index: 2147483647` 且 `:popover-open` 为真，并在页面打开覆盖全视口、最大 z-index 的模态框后再次确认覆盖层仍在 top layer。
- 同一实例连续运行 10 轮增强真实 E2E，10/10 全部通过；每轮覆盖首次接管显示、两次导航恢复、可见移动、点击、模态框顶层竞争、detach 和标签清理，未复现偶发不显示。

### Lingee Chrome Control Skill 自包含审计

- 复现并确认灵基报错根因：旧 ZIP 仅含 `invoke.mjs`/`doctor.mjs` 包装脚本，运行时强制从完整源码仓库加载 `src/bridge-client.mjs`；单独安装 Skill 必然可能返回 `BRIDGE_ROOT_NOT_FOUND`。
- 将公共 `bridge-client.mjs` 与 `runtime-paths.mjs` 放入 `scripts/runtime/`，默认从 Skill 内加载；`UNIVERSAL_CHROME_BRIDGE_ROOT` 仅保留为显式仓库开发覆盖。新增同步测试，要求内置运行时与仓库公共客户端逐字节一致。
- 修复多实例约束：CLI 调用和只读 doctor 在多个实例且没有 `UNIVERSAL_BROWSER_INSTANCE_ID` 时返回 `BRIDGE_INSTANCE_SELECTION_REQUIRED`，不会默认选择最新 Chrome 会话。
- 独立复制测试确认 Skill 离开源码仓库、清除根目录变量后可运行；本机安装副本真实 `instances` 与 `doctor.mjs` 均成功，doctor 报告 `bridgeClient.source: "bundled"` 且扩展已连接。
- `quick_validate.py` 对仓库副本和安装副本均通过；Skill 定向测试为 36/36。重新生成的 ZIP 包含 9 个文件、CRC 完整、包含两个运行时文件且不递归包含旧 ZIP，路径为 `dist/lingee-chrome-control-skill-0.1.20.zip`。

### 0.1.21 初始化首帧与慢速可视验收

- 虚拟鼠标标记升级为 `overlay-v12`。新建箭头先以 0ms 过渡同步放置到视口中心，再恢复常规移动过渡，避免初始化时从左上角滑入。
- 单元测试新增初始化位置、临时禁用过渡及恢复普通过渡的断言；`npm run check` 和 `npm test` 均通过，测试结果为 82/82。
- 重建并注册 0.1.21 Native Host 后，仓库与 Chrome 解包部署目录的 7 个运行文件 SHA-256 一致。重新加载扩展后的实例 `e4a46bbb-aab2-4fe5-9a06-634893cf7bad` 报告 Host/扩展均为 0.1.21，兼容标记为 `overlay-v12`，真实 Chrome E2E 通过。
- 慢速可视验收依次停留展示居中初始化、三段移动、语义点击、三次向下滚动和一次向上滚动。四阶段截图保存为 `dist/cursor-slow-{1-initialized,2-moved,3-clicked,4-scrolled}.png`；初始化截图确认箭头直接位于视口中心，移动和点击截图确认箭头到达目标且按钮状态改变，滚动截图确认页面进入下一内容区，结束后正常 detach 并保留演示页。
- 已生成 `dist/lingee-chrome-control-skill-0.1.21.zip`（9 个文件）和 `dist/lingee-chrome-agent-bridge-extension-0.1.21.zip`（12 个文件）。两包均从 ZIP 解压后逐文件核对 SHA-256；解压 Skill 通过 `quick_validate.py`，扩展脚本通过 `node --check`，扩展 manifest 的名称和版本核验为 Lingee Chrome Agent Bridge 0.1.21。

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
