# 收集脚本状态机

无 MCP 时使用 `scripts/monitor-flow.mjs`，它消费随附固定清单，控制授权、下载、校验、中央入口检查和执行顺序。它不实现插件安装器、生产登录、Hook、后台或上传；这些仍由固定 telemetry 发布入口维护。`monitor-preflight.mjs` 仅供状态机与发布检查复用清单校验和告知函数，不提供独立执行入口。

## 启动分流与恢复

先按 SKILL.md 的启动顺序检查精确目录。无 MCP 时，`local-status` 在四秒内只调用当前服务托管的 telemetry 运行时的 `project-status`，核对返回的目录和宿主。它不扫描项目、不执行旧 onboarding、不联网查发布版、不启动服务。返回 `bundled_version` 仅表示随 Skill 固定的版本，不能据此声称已查到最新版本。没有可验证的本地入口时，历史授权仅用于防止重复询问。

需要检查历史时，`list` 查看对应目录和宿主的流程。有通过采集验证且仍匹配固定清单的流程，可用 `probe --flow <id>` 作只读复查；其余流程用 `status --flow <id>`，只按 `allowed_actions` 恢复。目录、宿主或版本冲突时保留旧记录，不重放旧动作。明确拒绝时继续原业务。只有当前返回 `consent_required`，或本地无运行时、无该目录的授权证据，且没有历史授权/执行记录时，才使用 `preview`。本地返回 `unknown` 时说明状态未确认，继续业务。

首次告知使用只读 `preview`。用户必须在对话中收到完整 `disclosure.display`，包含完整说明链接。不要把终端输出视为告知。只有收到明确决定后，才进入下节记录决定。用户暂不决定时继续原业务。

### 子 Agent 安装与修复

**主 Agent 负责授权和宿主交互，子 Agent 负责技术执行。** 首次明确同意后，主 Agent 先记录真实决定；已有授权时用精确目录的实时授权或当前可验证的授权流程确认。同一目录和宿主只派一个子 Agent。健康、明确关闭或撤回时不派发。授权证据不明时只读核查；用户要求只读时不执行变更。子 Agent 不可用时，主 Agent 按相同步骤接手，不要求用户手动敲命令。

派发时只提供实际 Skill 路径、宿主、精确目录、状态及证据、当前 flow ID（如有）、已许可动作和限制。不要传业务对话、凭据或收集到的数据。主 Agent 可继续独立业务，在本轮完成前等待子 Agent 结果并做一次精确目录复查。子 Agent 遇到需要确认的动作时返回所需范围和实际版本，主 Agent 在对话中处理后再继续，不派第二个执行者。

1. **查明缺项。** 按实际宿主核对 Node、收集插件来源与版本、采集器、目录注册及 Hook 证据。命令缺失时先使用宿主已有的 Node 或版本管理器。遇到 `collector_unreachable` 或 MCP 连接失败，先在允许访问本机采集器的环境只读复查；不能凭沙箱连接失败认定插件缺失或重装。端口冲突时确认占用方，不能终止无关进程。
2. **修复和安装。** 当前流程已同意条件式安装时，子 Agent 按下节选择安装或独立复用路径，只执行 `allowed_actions`。已授权目录需要恢复时，优先用官方工具恢复同一目录的采集器或注册。比如当前 MCP 的 `register_project` 可以检查并启动收集运行时，再注册目录；仅在实际工具可将注册限制到已确认的同一目录且状态确有修复或注册需求时调用，沿用原存储范围。若该工具会推导父目录且无法保证边界，停止注册。无 MCP 时使用已校验的官方运行入口和该版本文档。仅用原渠道补齐依赖、安装缺失插件；来源不明、授权不覆盖该安装、宿主拦截或动作需要提升权限时，交回主 Agent 处理。旧流程失配时不执行旧引导、重放安装或手动写入授权。
3. **升级。** 通过原安装渠道核对最新正式版和已安装版，不能用 `bundled_version` 冒充最新版本。QDMP Skill 或 CLI 的维护按[原渠道更新说明](./upgrade.md#三类旧入口的诊断与自动更新)处理。收集插件需要更新时，优先使用官方同渠道的纯软件更新，保留现有目录授权。有按当前清单校验通过的官方 onboarding 时，对同一目录和宿主运行 `notice`，核对实际当前/目标版本、权限及纯 `update` 选项。主 Agent 取得需要的更新许可后，子 Agent 再读一次 `notice`，仅在目录、版本和动作未变化时执行其原始 `argv`；已有对应更新许可则直接继续。没有可信入口时，按官方原安装渠道处理，下载引导工具也须在已许可范围内。收集同意不替代新的安装、全局依赖、升级或扩大收集范围所需的许可；只就缺少的具体动作确认一次，不重新询问原有收集授权。未授权时不降级、不切渠道、不用 `update_and_enable` 代替纯更新。
4. **复验。** 返回采取的动作、实际版本、授权是否保留、精确目录状态和需要用户处理的事项。按宿主的真实提示处理信任或重载；Hook 待验证时在实际绑定的工作区观察正常 prompt/tool 事件。仅确认到 `collecting` 就报告已恢复收集；只有具备查询权限并回查日志库后才报告已落库。成功无需额外引导用户操作。失败或等待用户交互时，用“收集”说明最短下一步，原业务可继续。

## 调用顺序

所有命令由 Agent 执行，用户只需阅读完整说明、作出真实决定以及完成实际运行时要求的宿主交互；当前运行时采集不要求登录。下列 `<flow>` 和 `<digest>` 必须使用脚本返回值，不猜测或重造。

```text
node <Skill>/scripts/monitor-flow.mjs list --cwd <真实绝对目录> --host codex
node <Skill>/scripts/monitor-flow.mjs preview --cwd <真实绝对目录> --host codex
node <Skill>/scripts/monitor-flow.mjs begin --cwd <真实绝对目录> --host codex --preview <preview_digest>
```

`preview` 校验固定清单和真实目录，返回告知及 `preview_digest`，不写入、不下载、不执行外部代码。先在对话中展示完整文案，收到实际决定后再用该摘要执行 `begin`；目录身份或告知改变时须重新展示。已有待决定流程用 `status` 核对 `disclosure_digest`；与当前告知一致时沿用原 ID，告知变化时保留旧记录并用新告知创建绑定。已生效的目录授权不受此影响。新建项目先由 CLI 创建最终目录。仅展示 `disclosure.display`，不要重复展示 `consent`、版本、地址、哈希或其他元数据。

主 Agent 先执行下方 `authorize` 记录决定。如用户明确同意，由子 Agent 接手。实际宿主已确认启用兼容插件、原告知允许兼容复用时，使用同一 flow 的 `fetch-reuse` 代替下方 `fetch`。它只读核对最新正式 QDMP 标签的完整收集制品清单与当前 flow 一致，再下载并校验官方引导；不更新 Skill。后续只接受中央入口对同一宿主和精确目录给出的兼容复用选项。若插件缺失、版本变更或没有可验证的复用选项，保留原决定并停止，不转安装或升级。

需要首次安装且现有告知已经包含该固定版本时，可用 `fetch-install`。它同样核对最新正式标签的完整清单并校验引导。后续只接受中央入口确认插件确实缺失后返回的 `install` 选项，宿主未知、禁用或已安装时停止，不转升级、重装或复用。两个独立入口都不更新 QDMP Skill。其他流程需维护 QDMP 安装时按 [Skill 更新说明](./upgrade.md#三类旧入口的诊断与自动更新)处理后再用 `fetch`。更新后不得沿用失配告知或旧动作。下方从同意到验证的操作按各步输出执行：

```text
node <Skill>/scripts/monitor-flow.mjs authorize --flow <flow> --decision approve --digest <disclosure_digest>
node <Skill>/scripts/monitor-flow.mjs fetch --flow <flow>
node <Skill>/scripts/monitor-flow.mjs inspect --flow <flow>
node <Skill>/scripts/monitor-flow.mjs execute --flow <flow>
node <Skill>/scripts/monitor-flow.mjs verify --flow <flow>
```

每一步读返回值；仅在 `allowed_actions` 包含下一动作时继续。不能把这些命令当作无条件批处理。inspect 在状态文件保存中央 notice 供核对，动作需确认时在输出中返回告知，不绕过 execute 直接运行 enable。execute 重新检查实时版本、目录、权限和选项，原样使用已校验的中央 argv；如需插件地址只补充随附固定 `--artifact-url`，不接受其他来源。按固定清单的 permitted_action 处理：旧清单只涵盖条件式 install 或同版本 reuse；新清单 install_if_missing_or_reuse_compatible_version 在展示了条件式安装/兼容复用说明后，可直接复用已确认的兼容版本，不再问版本动作。更新、降级或不兼容版本不在该范围内。

用户选择“不下载、不上报”时，使用 authorize 的 `--decision decline` 和真实 digest；流程终止，不联网。这个本地决定记录不撤回已有项目授权。允许下载并上报最小拒绝的选择仍按 `skill-data-consent.md` 的独立 decline 协议处理；该独立事件不能伪装成开启收集的授权。不得把“允许记录拒绝”转换为 approve。

## 重试及版本动作确认

`check_failed` 保留原同意及原始 diagnostic、error_code、phase（可用时）。解决技术错误后沿原 flow 再次 inspect，不重复询问采集同意，不能把 unknown 当成 missing。执行开始后的 failed/executing 先 verify，禁止自动重放安装。唯一恢复例外是已确认复用版本的旧运行时在授予 consent 前明确返回 QDMP_LOGIN_REQUIRED：完成原登录后调用 `resume --flow <flow>`。resume 只读核对原错误、同一目录/宿主/版本/协议的 activation_pending 回执、未 granted 及同一授权 ID，再恢复为 choice_ready；之后 execute 仍重新核对实时状态。保留原采集同意及不同版本的动作确认，不 begin、不重新询问。未知失败、崩溃、安装或更新失败均不适用。

`action_confirmation_required` 返回 notice、proposed_action、action_digest。展示中央 notice 的实际动作、当前/目标版本、目录、权限和完整数据说明，取得该动作的明确确认后执行 `confirm-action --flow <flow> --decision approve --digest <action_digest>`，再 execute。原采集同意未包含该更新时，须确认具体的软件更新。旧清单下兼容的不同版本复用须确认实际版本；新清单已明确允许兼容复用时无需额外确认。两种情况均不能自动更新或降级。确认时和执行前均重新核对实时摘要；状态变化后重新 inspect，不沿用旧动作确认。

## 状态及停止规则

| 状态 | 允许动作 | 含义 |
| --- | --- | --- |
| awaiting_consent | authorize | 告知已生成，尚未取得明确决定 |
| authorized | fetch、fetch-install、fetch-reuse | 明确授权已绑定当前告知，允许固定下载 |
| entry_verified | inspect | 固定入口已通过 SHA-256 校验 |
| choice_ready | inspect、execute | 中央动作及实际版本已通过授权检查 |
| check_failed | inspect | 技术检查故障，不当作未安装 |
| action_confirmation_required | inspect、confirm-action | 更新或不同版本复用须单独确认 |
| executing | verify | 已开始外部动作，崩溃后只允许复查 |
| activation_reported | verify | 入口返回成功，尚未确认真实 Hook |
| verification_pending | verify；旧版复用登录失败可 resume | 按工作区及真实事件核验，不推断必须重启 |
| collecting | verify | 当前运行时报告 collecting；落库仍未验证 |
| failed | verify；旧版复用登录失败可 resume | 未证明为登录前置错误时禁止重放 |
| needs_reconfirmation | inspect | 状态不符可重新检查；新增权限仍需确认 |
| declined | 无变更动作 | 本次拒绝，不下载或上传选择结果 |

已存在的空目录或缺少 appId 时，授权状态仍按真实目录保存在用户目录；当前运行时无需为采集等待项目配置或登录。旧运行时明确要求登录时，choice_ready 可等待登录后继续，不把配置错误当成用户未授权。

所有流程状态均可用 `status --flow <id>` 只读查看，该命令不创建锁文件。CLI 默认只输出当前动作、指引和 Hook 证据，不反复打印完整回执与历史；完整审计数据保存在下述私有状态文件。主状态、immutable binding 摘要、显式决定、告知摘要、清单内容摘要、真实目录及其文件系统身份、宿主、中央选项与检查摘要、历史转换均保存在用户目录 `~/.qdmp-skill/monitor-flows/<id>/state.json`，文件权限 0600，目录 0700。工作目录不生成状态文件。

清单或目录身份变化、下载哈希错误、中央目录/版本/法律/上传目标不符直接报错，未执行安装。调用并发由流程独占锁拦截；崩溃遗留锁不得自动移除，先确认原进程已结束。执行前先写 executing，失败写 failed；不能靠重试重复安装。检查真实状态、完成必要用户交互后 verify，确有新动作需求时新建告知和授权流程。

脚本强制执行其入口内的流程约束，不是宿主安全沙箱。authorize 记录的是 Agent 提交的真实用户决定，无法独立证明用户已阅读告知；不得伪造决定、编辑状态文件、直接调用外部入口或改脚本来绕过校验。宿主执行审批仍独立生效。

Hook 待验证时按[宿主版本审查与复验](./hook-review.md)处理。主 Agent 负责给出当前界面入口，并在用户完成审查后沿用原会话与 flow 自动复验。`verification_pending` 不阻塞业务；正式落库以日志库按真实事件 ID 回查为准。

collecting 由已校验运行时的实时 project-status 判断，不由 Agent 手写状态。HTTP、Kafka、Hue 验证保持独立；状态机不会接受一个“落库成功”布尔参数就标记验收完成，也不代查生产数据。
