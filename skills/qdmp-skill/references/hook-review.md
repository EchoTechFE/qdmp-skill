# 按宿主版本审查与复验

本节只用于已经授权且 Hook 待验证，或用户刚完成宿主审查的目录。目录授权和宿主对脚本的信任是两项独立状态。

## 识别审查需求

1. 核对原会话绑定的真实目录、当前宿主产品、使用界面（Desktop、IDE 扩展或 CLI）及安装版本。优先用实际界面的「关于」或宿主诊断；使用 CLI 版本时先核对它确实是该宿主的二进制。开发机上另一个 CLI 的版本不能替代 Desktop 版本。
2. 使用该宿主版本支持的只读 Hook 清单或界面提示，只核对 `agent-runtime-telemetry` 对应的提示和工具事件。`hook_followup.action=review`、宿主明确报告 `untrusted` 或 `modified`，或显示该插件需要审查时，按下表引导。Codex 支持时优先查询已加载原会话的 `hooks/list`（`threadId`）；单独启动 app-server 查询 `cwds` 只能核对该配置下的清单，不能当成 Desktop 已加载会话的信任回执。命令、参数与版本以该宿主协议为准。
3. `hooks_pending` 或 `hook_followup.action=diagnose` 本身只说明证据不齐。查不到宿主信任状态时，如实说明，并让用户查看实际界面有无审查提示。已确认可信时直接复验缺失事件。宿主报告关闭、撤回、策略禁止或配置错误时，按对应状态处理，不能把这些状态当作待审查。

## 给出当前界面的入口

按实际产品和版本查该厂商的官方文档或版本说明，并以用户界面可见的文字为准。只给与当前宿主相符的一条最短路径。版本未核实或该版本没有文档支持时，提示查看实际界面的 Hook 诊断或对应官方帮助，不猜按钮、不把其他产品的菜单搬过来。

| 宿主 | 已核实的入口与边界 |
| --- | --- |
| Codex Desktop | 输入框上方出现 **Review hooks（审查 Hooks）** 时点它；也可进入 **设置 → Hooks**。找到 `agent-runtime-telemetry` 的待审查项，核对来源和命令后由用户点击该版本显示的信任按钮。[Codex 官方文档](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks) |
| Codex CLI | 在当前交互会话输入 `/hooks`，选中对应条目后审查。Desktop 用户使用 Desktop 路径。[Codex 官方文档](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) |
| Claude Code | 当前产品支持时用 `/hooks` 查看插件来源与定义。该菜单是只读浏览器；若实际宿主显示工作区信任或插件确认提示，在当前界面处理该提示。桌面或扩展的点击路径按当前版本的官方说明核对。[Claude Code 官方文档](https://code.claude.com/docs/en/hooks#the-hooks-menu) |
| Qoder 桌面版 | 该版本提供时，进入 **设置 → Hooks**，展开对应事件和插件条目检查来源与诊断。这里显示配置，只有实际宿主出现审查或工作区信任提示时才指引用户处理。[Qoder 官方文档](https://docs.qoder.com/qoder/hooks) |

面向用户说明一个操作，并请其在**原会话**回复「已完成 Hook 审查」。该回复是继续复验的信号。Agent 不代点信任、不写入信任配置。宿主明确要求重载时才指引重载，之后仍恢复原会话。

## 用户确认后自动复验

1. 收到确认就从原会话继续，复核绑定的宿主和目录，不要求用户另开会话或再次调用 Skill。保留原 flow ID 和收集授权，不重新展示授权告知，不执行 `begin`、`authorize`、安装或升级。
2. 优先用原 flow 的 `verify --flow <id>`。会话没保留 ID 时，执行 `node <实际 Skill 目录>/scripts/monitor-flow.mjs list --cwd <原会话绝对目录> --host <实际宿主>`，只选同目录、同宿主、兼容且允许 `verify` 的原流程。沙箱不允许 `verify` 写流程锁时，已验证过 `collecting` 的兼容 flow 可改用只读 `probe --flow <id>`。没有匹配流程或探测失败时，调用同目录的 MCP `project_status` 或同一脚本的 `local-status --cwd <目录> --host <宿主>`。若沙箱阻止访问本机收集器，按宿主正常权限流程做一次范围相同的复查。目录配置和 `status --flow` 里的历史快照都不能替代实时结果。
3. 如果缺工具事件，在原会话做一次最小只读工具调用；如果缺提示事件，优先用用户从原会话输入框发送的确认消息。若宿主尚未观察到它，请用户在原输入框手动发送一条普通消息。Agent 经跨会话工具代发的消息不能当作原生提示证据。
4. 只有实时状态为 `collecting` 才报告收集已生效。按同一项目和授权周期记录真实提示与工具事件 ID，分别核对上传器回执和生产日志库的精确事件 ID。缺少日志库查询权限时明确区分已上报和落库待核对。
