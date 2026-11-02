# qdmp-skill 真实环境测试计划

本计划覆盖当前 Skill 声明的能力与关键异常、恢复和多轮场景，共 **209 条主用例**。它用于真实测试前的用例审阅和执行准备；当前全部状态为 **待执行**。尚未执行真实登录、接口写入、安装、监控采集、发布或回滚。

- [完整用例与用户问法](cases.md)
- [结构化用例与执行记录字段](cases.json)
- [规则缺口分类与后续修复计划](repair-plan.md)
- [结构化修复任务清单](repair-backlog.json)

## 测试基准

- Skill：本地 `/Users/anqing/qd-dev/QD-Skill/qdmp-skill-mcp-api-facts`，分支 `codex/mcp-api-facts`，HEAD `239e07fa3c96`，声明版本 `1.1.14`；包含当前未提交修改。
- 配套 CLI：本地 `/Users/anqing/qd-dev/QD-Skill/qdmp-cli-mcp-api-facts`，HEAD `fe6d67c94ecb`，声明版本 `0.1.33`；包含当前未提交修改。
- 执行前记录真正加载的 Skill 目录、内容摘要和实际 CLI 路径。全局安装的同版本插件不能代替本分支；完整源码摘要已保存在 cases.json。
- 开发分支行为验收与正式稳定发布的升级/监控验收分开执行。当前源码仍声明 1.1.14，维护入口可能因开发内容与正式制品不同而返回 same_version_content_mismatch/manual_required；这不等于 API 业务失败，也不能绕过校验或覆盖正式安装来冒充通过。

## 覆盖范围与统计

| 模块 | 主用例数 |
| --- | --- |
| MCP 事实查询与匿名接入 | 17 |
| Bridge 登录与用户授权 | 10 |
| Bridge 运行时能力 | 10 |
| HTTP API 与认证 | 9 |
| 媒体上传与发布结果 | 3 |
| 心愿单 | 5 |
| 蓝牙 BLE | 5 |
| 普通音频 | 5 |
| OpenAPI 权限申请 | 6 |
| 环境项目 | 15 |
| 开发PRD | 12 |
| 账号登录 | 5 |
| 构建调试体验 | 22 |
| 后端运维 | 8 |
| 数据建模验收 | 8 |
| 软件升级 | 18 |
| 监控授权 | 22 |
| 产品规则 | 8 |
| 设计规则 | 10 |
| 入口路由 | 7 |
| 跨模块意图与多轮恢复 | 4 |

优先级：P0 73 条；P1 130 条；P2 6 条。P0 覆盖主路径、错误副作用和关键保护；P1 覆盖常见分支与恢复；P2 覆盖较低频兼容行为。

执行方式：人工会话 90 条；真实查询 12 条；故障注入 65 条；真机 42 条。故障注入用例需要隔离环境和可控桩/网络代理；不能通过反复请求不存在的线上接口、制造 WAF 封禁或破坏线上数据来准备故障。

## 环境与参数矩阵

| 维度 | 必测取值与展开方式 |
| --- | --- |
| 宿主 | Codex、Claude Code、Qoder；核心接入与监控/升级分支分别覆盖。宿主不提供某能力时记录阻塞或不适用及证据，不伪造命令。 |
| 本地系统与路径 | 当前 macOS 本地路径作为首轮；目标 Windows/Linux 宿主再做兼容性验收，覆盖空格/中文路径、项目根目录/子目录和多项目；不把 /workspace 当成本机已有目录。 |
| 工程状态 | 空目录、健康 EMP、旧配置待迁移、缺配置、多个项目、非 EMP/effuse、schema/PRD 已有或缺失。 |
| 后端语言 | Go 1.22、Node.js 22、Python 3.12；创建、配置、启动、依赖锁文件、打包和数据库 URI 场景按语言展开。 |
| 环境与账号 | prod/dev 分开配置；未登录、有效登录、过期、账号切换、有/无开发权限。prod 仅在专用测试应用与明确范围下执行外部写入。 |
| MCP 与网络 | 未配置、禁用、延迟发现、当前会话未加载、匿名成功、超时、CDN 故障、零/多匹配、契约不完整、分页、provider 独立快照。 |
| 设备与异步 | Bridge/真机相关用例分别在 iOS、Android、Harmony 上执行，并记录 App/SDK 版本；仅配置能力按声明补 Web。覆盖同步、回调、Promise、任务句柄、超时、离页和迟到结果。 |
| API 数据 | 准确 ID、路径、字段、错误码、权限和分页语义均取执行时的 CDN/MCP/业务结果，不复用历史夹具作为契约。 |

单条用例包含多个互斥前置或能力分支时，每个分支必须生成独立执行记录；cases.json 的 variants 及用例中的枚举不能只选其中一个便整条标通过。BRG-008 的位置、文件、节点、画布和 Socket 分别执行，所有语言/设备目标同理。

不执行所有维度的笛卡尔积。P0 必须覆盖其适用宿主/环境/目标设备；其余按风险选组合，至少覆盖每个适用分支。每次展开生成独立 runId，不能以一个平台通过代表其他平台。

## 按当前 API 清单展开查询覆盖

执行时保存完整 CDN 发现 JSON、获取时间和摘要，将当前可见 API 的 provider/id 作为参数清单。对每个条目用准确 ID 调用 get，记录结果的 provider、接口身份、snapshotId、契约及 coverage；对不匹配、缺失或不完整条目单独记录缺口。搜索、平台支持和业务调用使用对应场景用例验证，不把事实查询成功等同于业务调用成功。

这是一组运行时展开的查询用例，不在 Skill 或用例中冻结业务 API 目录。先记录 API 总量与请求/时间预算，按单个共享串行队列、默认相邻请求至少 1000ms 执行；达到预算或遇到停止条件保留断点，不自动重扫或扩充预算。

## 测试资源与证据

- 使用专用测试应用、测试账号和测试数据。按用例准备应用开发权限、已授权/未授权账号、已上传开发版本、可确认部署版本、媒体与 BLE 外设；清理动作计入该次运行授权和记录。
- 普通接口故障使用受控桩或隔离环境；真实回调/播放/设备连接等必须在目标设备获取证据。故障桩通过不等于真实环境通过。
- cases.json 中每条用例的 runTemplate 是单次执行模板，每个分支/设备/宿主组合复制一份并追加到 runs 数组，填写唯一 runId、variant 和本次 status；不得覆盖历史运行。用例顶层 status 仅汇总已声明适用分支的结果。
- 每次记录：runId、caseId、宿主与 OS、实际 Skill/CLI 路径和摘要、环境、脱敏应用/账号引用、设备/App/SDK 版本、provider 快照、请求预算与时间预算、起止时间、实际结果、证据位置和问题编号。
- 保存脱敏的用户对话、工具顺序、命令退出码、必要请求状态/业务码/requestId、文件差异与设备事件。避免在结果、截图或日志中保存 Token、appSecret、数据库密码、二维码会话凭据或个人资料。
- 待执行、通过、失败、阻塞、不适用为不同状态。不具备账号、设备、稳定制品或明确判定标准时记阻塞；不以构建成功、ready、工具返回成功或 HTTP 200 替代端到端证据。

## 执行顺序与通过标准

1. 先确认实际加载分支与版本摘要，审阅下方待裁决项；保留现有自动化测试作为回归基线，不能将其结果填写为真实环境用例通过。
2. 先执行只读接入、准确查询/检索、无关任务不触发 MCP 及不产生上报的拒绝分支。权限解耦先用隔离桩检查，实际短链创建放入外部写入批次；登录入口会产生临时会话，单独记录其生命周期。
3. 再执行本地项目/PRD/设计/schema、EMP 构建与配置迁移，随后执行目标设备上的 debug、授权、媒体、BLE 和音频。
4. 外部写入、上传体验版、后端发布/回滚和采集授权分批执行，逐批确认目标应用、环境与数据范围；本次用例设计请求不授权这些真实操作。
5. 在独立宿主配置和正式稳定制品上执行升级/监控场景；不为完成测试篡改版本、校验结果、授权或宿主信任。

P0 及本轮适用的 P1 全部通过，且没有未解决的错误副作用、身份/环境串用、写入自动重放、秘密泄露或待裁决阻塞，才能给出该测试范围的通过结论。P2 未测或不适用须列明；设备/宿主/接口展开未覆盖部分必须显示剩余数量和原因。

## 现有自动化回归与真实验收的分工

| 文件 | 已有自动化关注点 | 真实环境仍需验证 |
| --- | --- |
| test/api-migration.test.mjs | 历史资料/原测试保留、去静态业务调用、音频适配层生命周期 | 宿主真实工具路由、当前事实、原生回调及设备结果 |
| test/ensure-current.test.mjs 与 test/release-network.test.mjs | 安装来源、内容核验、事务恢复、发布发现与有界网络策略 | 实际宿主安装清单、正式稳定发布与重载结果 |
| test/monitor-flow.test.mjs 与 test/telemetry-distribution.test.mjs | 披露/授权顺序、绑定、制品校验、状态恢复 | 真实宿主 Hook、目录范围与脱敏落库证据 |
| 配套 CLI 的 test/devkitClient.test.js 与 test/openapiIndependence.test.js | 匿名查询、Token 不透传、权限流程不依赖 MCP | 当前 HTTP 服务、实际权限页与应用实时授权状态 |

## 待裁决问题与测试准备缺口

### F-API-001 纯 API 事实查询是否绕过主 Skill 的开发环境及项目选择前置

API 查询指引允许宿主匿名只读查询且不使用 CLI 兜底；主 Skill 的第零步规定开发业务前检查 CLI/pnpm，随后项目选择无项目时转创建。纯问接口参数不属于开发实现，但完整入口是否会错误套用通用前置需要真实会话验证。

- 依据一：[skills/qdmp-skill/knowledge/api-discovery.md](../../skills/qdmp-skill/knowledge/api-discovery.md)；行号 [3, 7, 25]。
- 依据二：[skills/qdmp-skill/SKILL.md](../../skills/qdmp-skill/SKILL.md)；行号 [105, 114, 115, 129, 135, 159]。
- 关联用例：API-017。
- 判定建议：devkit 匿名查询本身不应依赖平台登录、appId、项目或 CLI；是否对主 Skill 完整入口增加纯事实查询旁路尚未在源文档显式写出。若真实运行出现安装或项目创建阻塞，记录冲突，不记查询通过。

### WF-ISSUE-01 EMP判定规则对通用依赖给出相反结论

loader、模板来源与构建链已确认为EMP，但仅有flyio或tailwindcss时，主入口禁止据此单独判1.0，工作流却要求立即判1.0并停止，真实验收缺少唯一通过标准。

- 依据一：[skills/qdmp-skill/SKILL.md](../../skills/qdmp-skill/SKILL.md)；行号 [174]。
- 依据二：[skills/qdmp-skill/knowledge/project-workflows.md](../../skills/qdmp-skill/knowledge/project-workflows.md)；行号 [36, 39]。
- 关联用例：FLOW-006。
- 判定建议：统一为以loader、模板来源和真实构建链综合判断；若仅禁止某依赖，明确它是依赖规范违规而不是运行时身份。但裁决前此用例保持待裁决。

### WF-ISSUE-02 项目发现固定容器路径不能覆盖本地指定目录

用户明确指定本地绝对项目路径，但扫描/workspace无结果时规则直接进入新建项目，可能漏检已有项目并产生非预期目录。后端配置定位已支持从项目/父目录判定，入口未说明如何适配。

- 依据一：[skills/qdmp-skill/SKILL.md](../../skills/qdmp-skill/SKILL.md)；行号 [137, 139, 159]。
- 依据二：[skills/qdmp-skill/knowledge/backend-operations.md](../../skills/qdmp-skill/knowledge/backend-operations.md)；行号 [67, 71]。
- 关联用例：FLOW-007。
- 判定建议：用户指定路径优先，其次当前目录与工作区根；未识别到项目时先澄清新建意图。固定/workspace仅用于明确的容器环境。

### WF-ISSUE-03 Mongo凭据写入源码与环境变量规则冲突

新建后端要求通过平台环境变量传入配置且不硬编码凭据，Schema生成又要求把包含用户名密码的线上MongoURI直接写入模型源码；源码可能被后端打包上传，敏感主配置未提交仍不能避免泄漏。

- 依据一：[skills/qdmp-skill/knowledge/project-workflows.md](../../skills/qdmp-skill/knowledge/project-workflows.md)；行号 [111]。
- 依据二：[skills/qdmp-skill/knowledge/backend-operations.md](../../skills/qdmp-skill/knowledge/backend-operations.md)；行号 [239, 241]。
- 关联用例：FLOW-058。
- 判定建议：统一由服务端配置/环境变量注入MongoURI，模型只引用连接入口；本地/线上切换不改写含凭据源码。真实用例在规则统一前只审计、保持待裁决，不能用生产凭据执行。

### WF-ISSUE-04 运行版本落后不能单凭比较判定已回滚

版本落后可能是部署仍在进行、部署失败或实际回滚，当前status规则把所有落后一律显示已回滚；用户可能据此误判历史操作。

- 依据一：[skills/qdmp-skill/knowledge/backend-operations.md](../../skills/qdmp-skill/knowledge/backend-operations.md)；行号 [769, 782]。
- 关联用例：FLOW-052。
- 判定建议：分别展示当前运行与最新发布版本，落后原因需结合Pipeline/回滚历史；无证据时标明尚未运行最新版本，不能断言回滚。

### WF-ISSUE-05 本地联调仅有Debian容器命令缺少桌面适配

Mac/Windows真实本地环境不保证ss、GNU stat、system nginx和run_in_background参数可用；直接运行容器命令可能失败或修改用户系统nginx，而前端联调指引未注明适用环境。

- 依据一：[skills/qdmp-skill/knowledge/backend-operations.md](../../skills/qdmp-skill/knowledge/backend-operations.md)；行号 [788, 790]。
- 依据二：[skills/qdmp-skill/knowledge/project-workflows.md](../../skills/qdmp-skill/knowledge/project-workflows.md)；行号 [327, 368]。
- 关联用例：FLOW-032。
- 判定建议：先确定执行宿主，容器路径使用现有流程；桌面路径使用可用进程/端口工具与局部代理方案，未经授权不修改系统nginx。桌面流程尚未定义部分保持待裁决。

### WF-ISSUE-06 清理8080端口缺少进程归属判断

无条件kill -9监听8080的所有进程可能结束用户已有无关服务。当前仅说明清理端口，未区分当前项目进程与其他项目服务，真实环境执行存在非预期影响。

- 依据一：[skills/qdmp-skill/knowledge/backend-operations.md](../../skills/qdmp-skill/knowledge/backend-operations.md)；行号 [970, 972]。
- 关联用例：FLOW-030。
- 判定建议：仅复用或停止本测试项目确认归属的进程；占用者无关或无法确认时报告冲突，不默认杀进程。实际kill测试只能在隔离副本验证。

### GOV-F01 开发分支沿用正式版本号，正式维护验收不能把改造内容当已发布快照

当前工作树有未提交改造但版本仍为1.1.14；真实宿主启动维护会依据正式内容和安装渠道返回同版本内容差异或开发来源manual_required。若忽略该结果继续宣称正式更新/监控验收通过，会误报测试结论。此项是测试基线限制，不是维护逻辑缺陷。

- 依据一：[skills/qdmp-skill/references/skill-release.json](../../skills/qdmp-skill/references/skill-release.json)；行号 [3]。
- 依据二：[skills/qdmp-skill/references/upgrade.md](../../skills/qdmp-skill/references/upgrade.md)；行号 [25, 53, 57]。
- 关联用例：GOV-001、GOV-002、GOV-005、GOV-013、GOV-019、GOV-023。
- 判定建议：开发工作树行为测试与正式稳定发布渠道测试分开记录；遵循same_version_content_mismatch/manual_required与proceed_monitoring约束。需完整正式更新与监控链路验收时使用真实已发布校验快照，不能改版本收据、清缓存、跳过校验让用例变绿。

### GOV-F02 入口query值含保留字符或重复键时缺少内层构造契约

现有例子只有普通a=b&c=d，外层完整串一次encode可保证入口参数不被外层截断，但无法单独保证页面解析后仍保留单个值内部的&、=或%及重复键。不能为这一组合直接写死唯一正确编码结果或宣称现有文档已覆盖。

- 依据一：[skills/qdmp-entry-route/SKILL.md](../../skills/qdmp-entry-route/SKILL.md)；行号 [18, 19, 20, 21]。
- 依据二：[skills/qdmp-entry-route/SKILL.md](../../skills/qdmp-entry-route/SKILL.md)；行号 [25, 28, 34, 57]。
- 关联用例：GOV-064。
- 判定建议：作为待裁决用例：保留原始键值，记录外层解码与页面实际解析链路；先确认入口客户端与页面解析契约，再固定最终URL与断言。其他普通query和已编码query用例仍按现有规则验收，不对原始串盲目多次encode/decode。

### ISSUE-PRD 显式跳过 PRD 的入口与必做工作流口径冲突

主入口提供先设计、反向生成、跳过三个选择，工作流则写开发前必须完成 PRD；同一用户明确选择跳过时，Agent 可能反复要求确认或直接开发，缺少一致判定标准。

- 依据一：[skills/qdmp-skill/SKILL.md](../../skills/qdmp-skill/SKILL.md)；行号 180–220。
- 依据二：[skills/qdmp-skill/knowledge/project-workflows.md](../../skills/qdmp-skill/knowledge/project-workflows.md)；行号 117–119。
- 关联用例：FLOW-017。
- 判定建议：先明确并统一用户显式选择跳过的适用范围；裁决前该分支记录阻塞，不能仅按一处文案判通过。

这些项应先确认判定口径或修复源规则，再执行相关用例；用例库本身不修改业务实现。
