# 监控脚本状态机

无 MCP 时使用 `scripts/monitor-flow.mjs`，它消费随附固定清单，控制授权、下载、校验、中央入口检查和执行顺序。它不实现插件安装器、生产登录、Hook、后台或上传；这些仍由固定 telemetry 发布入口维护。`monitor-preflight.mjs` 仅供状态机与发布检查复用清单校验和告知函数，不提供独立执行入口。

## 调用顺序

所有命令由 Agent 执行，用户只需阅读完整说明、作出真实决定以及完成必要登录/宿主交互。下列 `<flow>` 和 `<digest>` 必须使用脚本返回值，不猜测或重造。

```text
node <Skill>/scripts/monitor-flow.mjs list --cwd <真实绝对目录> --host codex
node <Skill>/scripts/monitor-flow.mjs begin --cwd <真实绝对目录> --host codex
```

`list` 只读列出该目录与宿主已有流程，可在重启后恢复。已有流程时先 `status --flow <id>`，根据 `allowed_actions` 继续，避免重复创建流程。只有新流程需要 begin；它校验清单并保存 `awaiting_consent`，返回完整 `disclosure`、流程 ID 和 `disclosure_digest`，不联网或执行外部代码。真实目录需为规范绝对路径，符号链接别名需先核实并展示真实路径。

面向用户仅展示返回的 `disclosure.display`（第 1 节短文案和完整说明链接），不在前面展示 `consent`、版本、地址/哈希、目标、宿主与目录的重复清单。其余字段仍参与流程绑定与校验。只询问一次，取得用户明确决定后：

```text
node <Skill>/scripts/monitor-flow.mjs authorize --flow <flow> --decision approve --digest <disclosure_digest>
node <Skill>/scripts/monitor-flow.mjs fetch --flow <flow>
node <Skill>/scripts/monitor-flow.mjs inspect --flow <flow>
node <Skill>/scripts/monitor-flow.mjs execute --flow <flow>
node <Skill>/scripts/monitor-flow.mjs verify --flow <flow>
```

每一步读返回值；仅在 `allowed_actions` 包含下一动作时继续。不能把这些命令当作无条件批处理。inspect 返回中央 notice 供核对，不绕过 execute 直接运行 enable。execute 重新检查实时版本、目录、权限和选项，原样使用已校验的中央 argv；如需插件地址只补充随附固定 `--artifact-url`，不接受其他来源。初始同意仅涵盖条件式 install 或同版本兼容 reuse；更新及其他兼容版本复用按下方动作确认协议继续，不自动更新或降级。

用户选择“不下载、不上报”时，使用 authorize 的 `--decision decline` 和真实 digest；流程终止，不联网。这个本地决定记录不撤回已有项目授权。允许下载并上报最小拒绝的选择仍按 `skill-data-consent.md` 的独立 decline 协议处理；该独立事件不能伪装成开启监控的授权。不得把“允许记录拒绝”转换为 approve。

## 重试及版本动作确认

`check_failed` 保留原同意及原始 diagnostic、error_code、phase（可用时）。解决技术错误后沿原 flow 再次 inspect，不重复询问采集同意，不能把 unknown 当成 missing。执行开始后的 failed/executing 仍仅允许 verify，禁止自动重放安装。

`action_confirmation_required` 返回 notice、proposed_action、action_digest。展示中央 notice 的实际动作、当前/目标版本、目录、权限和完整数据说明，取得该动作的明确确认后执行 `confirm-action --flow <flow> --decision approve --digest <action_digest>`，再 execute。原采集同意不包含更新权限；兼容的不同版本复用也须确认实际版本，不能自动更新或降级。确认时和执行前均重新核对实时摘要；状态变化后重新 inspect，不沿用旧动作确认。

## 状态及停止规则

| 状态 | 允许动作 | 含义 |
| --- | --- | --- |
| awaiting_consent | authorize | 告知已生成，尚未取得明确决定 |
| authorized | fetch | 明确授权已绑定当前告知，允许固定下载 |
| entry_verified | inspect | 固定入口已通过 SHA-256 校验 |
| choice_ready | inspect、execute | 中央动作及实际版本已通过授权检查 |
| check_failed | inspect | 技术检查故障，不当作未安装 |
| action_confirmation_required | inspect、confirm-action | 更新或不同版本复用须单独确认 |
| executing | verify | 已开始外部动作，崩溃后只允许复查 |
| activation_reported | verify | 入口返回成功，尚未确认真实 Hook |
| verification_pending | verify | 需完成登录、信任、重启或观察 Hook |
| collecting | verify | 当前运行时报告 collecting；落库仍未验证 |
| failed | verify | 外部动作失败，禁止自动重放安装 |
| needs_reconfirmation | inspect | 状态不符可重新检查；新增权限仍需确认 |
| declined | 无变更动作 | 本次拒绝，不下载或上传选择结果 |

空目录或缺少 appId 时，授权状态仍按真实目录保存在用户目录。`choice_ready` 可暂停在登录或项目配置完成前；此时尚未激活采集，不重复询问。继续时先查询 status，再执行 execute；不要将项目配置报错误判为用户未授权。

所有流程状态均可用 `status --flow <id>` 只读查看。主状态、immutable binding 摘要、显式决定、告知摘要、清单内容摘要、真实目录及其文件系统身份、宿主、中央选项与检查摘要、历史转换均保存在用户目录 `~/.qdmp-skill/monitor-flows/<id>/state.json`，文件权限 0600，目录 0700。工作目录不生成状态文件。

清单或目录身份变化、下载哈希错误、中央目录/版本/法律/上传目标不符直接报错，未执行安装。调用并发由流程独占锁拦截；崩溃遗留锁不得自动移除，先确认原进程已结束。执行前先写 executing，失败写 failed；不能靠重试重复安装。检查真实状态、完成必要用户交互后 verify，确有新动作需求时新建告知和授权流程。

脚本强制执行其入口内的流程约束，不是宿主安全沙箱。authorize 记录的是 Agent 提交的真实用户决定，无法独立证明用户已阅读告知；不得伪造决定、编辑状态文件、直接调用外部入口或改脚本来绕过校验。宿主执行审批仍独立生效。

Codex 重启不会自动证明插件 Hook 已受信任。`verification_pending` 返回的 `instruction` 必须向用户展示；在当前宿主检查并信任待审查的 Hook，再发送普通 prompt 与工具调用后重复 verify。CLI 可用 `/hooks`；Desktop 若无审查入口，用户可在 CLI 的 `/hooks` 审查同一插件定义后重启 Desktop，但仍须用 Desktop 的真实 prompt/tool 事件验证，不能以 CLI 审查结果冒充 Desktop 采集证据。仅有安装、注册或 HTTP 上报时，不得声称运行日志已完整采集。

collecting 由已校验运行时的实时 project-status 判断，不由 Agent 手写状态。HTTP、Kafka、Hue 验证保持独立；状态机不会接受一个“落库成功”布尔参数就标记验收完成，也不代查生产数据。
