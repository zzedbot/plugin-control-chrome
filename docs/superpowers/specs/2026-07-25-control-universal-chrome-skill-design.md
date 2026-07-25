# 通用 Chrome 控制 Skill 设计

## 目标

为 Universal Chrome Agent Bridge 提供一套跨工具通用的 Agent Skill。它参考 Codex `control-chrome` Skill 的任务选择、浏览器状态复用、页面操作与故障恢复原则，但只依赖本项目公开的 MCP、JSON-RPC 和 Bridge Client 接口。

Skill 同时满足两个分发目标：

- 在仓库 `skills/control-universal-chrome/` 中归档并由 Git 管理。
- 复制安装到用户的 Codex Skills 目录，供当前环境立即发现和测试。

## 兼容范围

主流程遵循 Agent Skills 目录约定，并使用标准 MCP 工具名称。支持 MCP 的客户端直接调用 `universalChrome` MCP Server；只有终端能力但不能直接调用 MCP 的客户端使用随 Skill 提供的 Node.js 统一调用脚本。

Skill 不依赖 Codex 私有的 `browser-client`、Node REPL、`agent.browsers.*`、动态 `documentation()` 或内部故障文档。

## 目录结构

```text
skills/control-universal-chrome/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── scripts/
│   ├── invoke.mjs
│   └── doctor.mjs
└── references/
    ├── tools.md
    ├── security.md
    └── troubleshooting.md
```

不增加 README、安装指南或重复的项目文档。Skill 主文件保持精简，完整工具表、安全规则和故障处理按需加载。

## 组件职责

### `SKILL.md`

定义触发条件与标准工作流：

1. 用户明确要求操作 Chrome，或任务确实依赖现有 Chrome 标签页、登录状态或扩展时使用本工具。
2. 有更合适的专用 API、连接器或 CLI 时优先使用它；需要可视交互时回到浏览器控制。
3. 先检查 Bridge 状态和实例，再选择或创建标签页。
4. 访问站点前遵守域名策略，不把高权限授权隐含在普通操作中。
5. 优先读取文本、DOM 或无障碍树并构造稳定定位器。
6. 执行动作后重新读取相关状态，确认操作结果。
7. 仅在视觉判断或稳定定位器不可用时使用截图与坐标操作。
8. 登录受阻时请求用户在同一 Chrome 中登录，不通过搜索或切换来源规避身份验证。

### `references/tools.md`

列出 MCP 工具分组、必要参数、返回结果和典型组合，内容以 `src/mcp-server.mjs` 与 `docs/API.md` 为事实来源。该文件同时给出 MCP 工具名和脚本 `call` 子命令的一一映射。

### `references/security.md`

记录以下强制边界：

- 普通站点控制使用逐域名授权。
- `policy_set_allow_all` 需要用户明确批准。
- 历史、书签和下载元数据访问需要用户明确批准。
- 原始 CDP 方法必须加入白名单，并只在高级能力确实需要时使用。
- 不读取浏览器密码、Cookie、Local Storage、配置文件或会话存储。
- 不用浏览器自动化绕过登录、验证码或站点安全控制。

### `references/troubleshooting.md`

按故障层次提供恢复顺序：MCP 客户端配置、Bridge 进程、Native Messaging Host、Chrome 扩展、实例选择、域名策略和标签页调试连接。每一层先获取诊断信息，再执行最小恢复动作。

### `scripts/invoke.mjs`

为没有 MCP 调用能力但可以运行 Node.js 的代理提供稳定 CLI：

```text
node invoke.mjs instances
node invoke.mjs call bridge.getInfo '{}'
node invoke.mjs call browser.listTabs '{}'
node invoke.mjs call browser.click '{"tabId":1,"locator":{"role":"button","name":"提交"}}'
```

脚本只负责项目定位、JSON 参数校验、调用 `src/bridge-client.mjs` 和规范化 JSON 输出，不复制浏览器控制逻辑。

项目定位顺序：

1. 显式环境变量 `UNIVERSAL_CHROME_BRIDGE_ROOT`。
2. 从 Skill 所在路径向上查找项目标志文件。
3. 当前工作目录及其父目录。

定位失败时返回结构化错误和修复提示，不猜测其他安装路径。

### `scripts/doctor.mjs`

只执行只读诊断，检查 Node.js 版本、项目根目录、Bridge Client 文件、可发现实例和扩展连接状态。输出单个 JSON 对象，便于不同代理解析；不会安装、启动、授权或修改浏览器状态。

## 与 Codex Chrome Skill 的转换

| Codex Chrome 能力 | 通用实现 |
|---|---|
| `browser-client` 私有运行时 | 项目 MCP Server 或 Bridge Client |
| `agent.browsers.get(...)` | `bridge_list_instances`、`bridge_status` |
| Node REPL 持久绑定 | MCP 客户端连接或每次 CLI 调用 |
| 动态 `documentation()` | Skill 的按需参考文件 |
| `tab.playwright` | DOM 快照、无障碍树与 locator 工具 |
| 内部故障文档 | `references/troubleshooting.md` |
| 私有浏览器选择策略 | 明确选择 Bridge 实例和 Chrome 标签页 |

通用实现不会声称与 Codex 的私有协议或内部扩展完全相同。所有能力以本项目公开接口和测试结果为准。

## 数据流

MCP 路径：

```text
代理 → MCP 客户端 → src/mcp-server.mjs → Bridge Client
     → 本地 IPC → Native Host → Chrome 扩展 → Chrome/CDP
```

脚本路径：

```text
代理 → Node.js invoke.mjs → Bridge Client
     → 本地 IPC → Native Host → Chrome 扩展 → Chrome/CDP
```

两条路径从 Bridge Client 开始共用同一实现、安全策略和浏览器扩展。

## 错误处理

Skill 要求根据稳定错误码分类处理：

- 未找到实例或连接中断：先运行只读诊断，再提示启动或检查扩展。
- 域名被策略拒绝：说明目标域名，并只在用户意图覆盖该站点时申请逐域名授权。
- 标签页不存在或调试会话失效：重新列出标签页并获取新的 `tabId`。
- 定位器不唯一或元素不可见：重新读取 DOM，收紧 locator，不直接退化为坐标点击。
- 敏感元数据或 CDP 被拒绝：解释所需权限并等待明确批准。
- 登录、验证码或站点限制：停止自动化并请求用户处理。

## 测试策略

按 Skill TDD 执行：

1. 在没有新 Skill 的新代理上下文中运行基线场景，记录其对工具选择、站点授权、稳定定位和故障处理的遗漏。
2. 创建最小 Skill 与脚本，使相同场景按预期执行。
3. 用新上下文复测以下场景：读取现有标签页、打开并操作允许的网站、处理未授权域名、诊断断开的扩展、拒绝未经批准的敏感元数据和 `allowAll`。
4. 对脚本执行参数校验、项目定位、结构化输出和失败路径测试。
5. 运行 Skill `quick_validate.py`、项目测试与静态检查。
6. 对项目归档副本与本机安装副本做文件校验，确保内容一致。

测试不得访问真实敏感数据、修改无关浏览器状态或自动扩大站点权限。

## 交付边界

本次交付包含一个 Skill、两个薄脚本、三份按需参考、Codex UI 元数据、测试和安装副本。不修改已暂停的 HTML 文档站，不发布网站，不声称复用了 OpenAI 私有源代码。
