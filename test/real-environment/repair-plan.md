# qdmp-skill 规则缺口分类与修复准备

当前共 10 项：5 项明确规则矛盾或错误执行/推断，2 项本地兼容缺口，2 项待行为或解析契约确认，1 项正式测试基线限制。本轮只完成分类、修复落点、依赖和回归断言；原 209 条用例仍全部待执行。

基准：本地 `codex/mcp-api-facts`，HEAD `239e07fa3c96`，声明版本 `1.1.14`，包含未提交改造。

- [结构化修复清单](repair-backlog.json)
- [原测试计划](README.md)
- [209 条完整用例](cases.md)

## 分类总览

| 类别 | 问题 | 典型场景 | 修复重点 |
| --- | --- | --- | --- |
| 运行安全与凭据配置 | WF-ISSUE-03 | 生成模型后，数据库密码随源码进入发布包。 | 先核实配置注入，三语言连接模块改读服务端配置。 |
| 运行安全与凭据配置 | WF-ISSUE-06 | 8080被其他项目占用，启动时直接杀掉全部占用进程。 | 核对进程归属，复用或温和停止本项目进程。 |
| 意图路由与工程判定 | F-API-001 | 没有项目/CLI/appId，只想查接口参数。 | 主入口显式分流纯事实问答，跳过开发前置。 |
| 意图路由与工程判定 | ISSUE-PRD | 用户已明确跳过PRD，仍被要求再次确认或补文档。 | 一次显式选择生效，发布前检查单独保留。 |
| 意图路由与工程判定 | WF-ISSUE-01 | EMP工程含flyio或Tailwind，被直接判为1.0。 | 运行时身份与依赖合规分别判定。 |
| 意图路由与工程判定 | WF-ISSUE-02 | 已有本地工程不在/workspace，被漏检并进入新建。 | 优先指定路径/当前工作区，未发现不等于要新建。 |
| 本地兼容与状态诊断 | WF-ISSUE-04 | 最新版本尚在部署或部署失败，被说成已回滚。 | 展示两个版本，原因只按可核实证据说明。 |
| 本地兼容与状态诊断 | WF-ISSUE-05 | Mac/Windows直接执行Debian容器和系统nginx命令。 | 明确桌面/容器分流，复用项目启动与代理。 |
| 入口参数协议 | GOV-F02 | 入口参数值含&、%、空格或重复键，页面收参截断。 | 取得实际解析链路后定义分层编码与重复键语义。 |
| 正式发布测试基线 | GOV-F01 | 开发内容仍标1.1.14，被拿来验正式升级/监控。 | 区分开发与正式基线，保留内容校验与重载要求。 |

## 修复批次

1. **B1 运行安全**：先处理 Mongo 配置来源和端口进程归属。数据库修改必须先确认平台可用的配置注入方式，不能只改成读取环境变量却没有部署注入。
2. **B2 入口与判定**：统一纯事实查询路由、本地项目定位、EMP 判据和 PRD 显式跳过；共用一处事实定义，其他章节引用。
3. **B3 本地执行与状态**：桌面与容器按实际环境选择命令；部署状态只陈述可验证事实，回滚结论需要证据。
4. **B4 入口协议**：先取得入口解析与页面收参依据，再确定值内编码、外层编码、已有编码识别和重复键处理。
5. **GATE 正式验收**：开发行为测试完成后，统一正式发布版本声明并校验完整制品，再验升级/监控渠道。不修改维护保护逻辑来适配开发副本。

各批次先完成受影响规则的统一，再更新关联用例的判定说明；实际执行记录必须单独追加，准备修复不代表已修复或测试通过。

## 逐项修复准备

### WF-ISSUE-03 Mongo凭据写入源码与环境变量规则冲突

类别：运行安全与凭据配置；性质：明确规则矛盾；优先级：P0；批次：B1；状态：待修复。

**触发场景**

- 用户从已有PRD生成Go、Node.js或Python数据模型。
- 本地test-deploy后切回publish，连接地址包含用户名密码。
- 用户认为根qdmp-config.json未提交，因而后端源码和上传包也没有凭据。

**当前规则与影响**

- project-workflows要求平台环境变量注入且不硬编码凭据，backend-operations却要求把完整线上Mongo URI直接写入三种语言源码，并在本地/发布时编辑源码切换。后端zip包含这些源码，所以根敏感配置被忽略也不能避免凭据随包上传。当前可读CLI与qdmp-web源码没有证明每个小程序后端runtime的变量注入接口、键名和映射；qdmp-web服务自身的环境变量支持不能充当该证明。

**拟统一规则**

- 连接模块读取已确认的服务端运行配置，模型只依赖连接入口；凭据不写源码、不进入前端、日志或发布包。线上/本地通过运行配置选择连接，不通过编辑业务源码切换。必须先查清小程序后端现有配置注入链路，再确定实现，不能只替换为process.env或os.Getenv后宣称修复完成。

**修改落点**

- skills/qdmp-skill/knowledge/backend-operations.md：Schema前提、Go/Node/Python连接模板、完成提示、publish Mongo检查、test-deploy配置切换
- skills/qdmp-skill/knowledge/project-workflows.md：后端配置规范与启动说明
- test/real-environment/cases.json：FLOW-058裁决后的断言和分支；新增三语言配置缺失/注入/打包回归
- test/real-environment/cases.md：随结构化用例同步

**修复前准备**

- 只读核对平台后端部署模板或管理能力：配置注入方式、受支持键名、秘密存储与runtime映射；不请求或输出真实凭据。
- 使用占位凭据和隔离工程保存三语言生成前后源码/打包清单，确认根配置与sourceDir的实际边界。
- 盘点已有工程的连接入口，区分生成代码与用户自定义模块，不做全仓URI字符串替换。

**实施步骤**

- 先形成一份已核实的服务端配置契约和本地加载优先级，明确配置缺失时的启动错误。
- 按三种语言复用各自现有配置入口与Mongo连接封装，移除生成模板中的凭据字面量。
- 把test-deploy和publish从源码地址替换改为相同配置入口的环境选择；Go URI的database/query处理在解析配置时完成。
- 同步打包排除、错误脱敏和完成提示；只迁移明确识别的生成连接模块，保留业务调用逻辑。
- 补回归后更新FLOW-058判定口径；真实专用环境再验连接，不将文档修改当真实部署已通过。

**依赖与待核实点**

- 先核实小程序后端部署配置注入链路，不能以qdmp-web控制服务的KENV规则替代。
- 与WF-ISSUE-05本地启动配置方案衔接。

**回归验收**

- 关联用例：FLOW-058、FLOW-009、FLOW-011、FLOW-012、FLOW-029、FLOW-047、FLOW-055。
- Go/Node/Python源码及发布包均不含测试凭据字面量，前端不获得服务端Mongo配置。
- 确认过的线上配置与本地配置都能被相同连接入口读取；配置缺失给出清晰脱敏错误，不能默默连错环境。
- test-deploy到publish过程中业务源码摘要不因Mongo地址切换而改变。
- 包含用户名密码特殊字符和带query的Go URI按驱动要求解析，database位置正确。
- 真实运行验收使用专用数据库；现有查询、模型与测试逻辑保留。

依据：[skills/qdmp-skill/knowledge/project-workflows.md：[109, 111, 115]](../../skills/qdmp-skill/knowledge/project-workflows.md)；[skills/qdmp-skill/knowledge/backend-operations.md：[239, 241, 272, 291, 420, 424, 525, 530, 531]](../../skills/qdmp-skill/knowledge/backend-operations.md)；[skills/qdmp-skill/knowledge/backend-operations.md：[188, 193, 194, 195, 196, 197, 616, 617, 955, 957, 968]](../../skills/qdmp-skill/knowledge/backend-operations.md)。

### WF-ISSUE-06 清理8080端口缺少进程归属判断

类别：运行安全与凭据配置；性质：明确危险执行规则；优先级：P0；批次：B1；状态：待修复。

**触发场景**

- 用户启动后端时8080被其他项目或未知进程占用。
- 当前任务以前启动的服务仍在运行，需要复用或重启。
- 停止/重启过程中PID已变化或被其他进程复用。

**当前规则与影响**

- 清理步骤无条件对lsof返回的全部8080进程kill -9，既不限定监听TCP，也不核对PID命令、cwd与项目范围；可能杀死无关服务并丢失正在处理的任务。固定强杀还跳过正常关闭和连接释放。

**拟统一规则**

- 先检查占用者归属。确认属于当前项目且已在用户启动/重启授权范围内时，优先复用，确需重启则温和停止并等待；仅对归属仍一致且确需清理的本任务进程使用有界升级终止。无关或无法确认的占用者不自动结束，报告冲突；若项目支持可配置端口，按一致代理配置选择可用端口，否则等待用户处理占用。

**修改落点**

- skills/qdmp-skill/knowledge/backend-operations.md：test-deploy Step5端口清理和服务启动/停止规则
- skills/qdmp-skill/knowledge/project-workflows.md：已监听前端服务的归属/复用判断
- test/real-environment/cases.json：FLOW-030分支与进程归属验收
- test/real-environment/cases.md：同步对应步骤

**修复前准备**

- 只读记录监听端口、PID、命令行、工作目录和本任务启动会话；不得为查看状态提前杀进程。
- 准备三个隔离进程：本项目、其他项目、无法确定归属；另准备PID变化/端口释放的受控场景。
- 沿用用户已明确授权的本项目启动/重启，不为每次可逆步骤重复索要相同确认。

**实施步骤**

- 移除无条件kill -9命令，改为先识别监听进程与当前项目的关系。
- 已属本项目且可复用则复用；需要重启时发送正常终止并有界等待。
- 升级终止前重新检查PID/命令/项目归属，防止PID复用；不要杀同端口的所有相关进程。
- 不明/无关进程保持运行并报告冲突，端口替代只在项目确实支持并同步关联配置时执行。
- 用隔离受控进程验证重启与停止，无关服务继续可达，最后更新FLOW-030断言。

**依赖与待核实点**

- 与WF-ISSUE-05共享最小宿主适配，不引入全局进程清理器。

**回归验收**

- 关联用例：FLOW-030、FLOW-028、FLOW-029、FLOW-032、CROSS-003。
- 其他项目或归属不明进程不会收到终止信号；端口冲突被如实报告。
- 当前项目服务复用或重启与用户授权范围一致，无重复同意要求。
- 先温和停止；只有满足已确认归属和超时条件才可能升级，PID变化时停止升级终止。
- 前端已监听服务也核对归属，不把同端口任意服务当作本项目成功。
- 用户停止任务仅释放本任务端口/会话，不清理其他项目。

依据：[skills/qdmp-skill/knowledge/backend-operations.md：[970, 972]](../../skills/qdmp-skill/knowledge/backend-operations.md)；[skills/qdmp-skill/knowledge/project-workflows.md：[327, 329, 332]](../../skills/qdmp-skill/knowledge/project-workflows.md)。

### F-API-001 纯 API 事实查询是否绕过主 Skill 的开发环境及项目选择前置

类别：意图路由与工程判定；性质：需真实行为验证；优先级：P0；批次：B2；状态：待明确入口规则并验证。

**触发场景**

- 空目录、没有appId/qdmp-cli/pnpm，但宿主已有匿名devkit；用户只问接口参数、返回或平台支持。
- 用户只要求查事实，不要求创建项目、生成调用代码或执行接口。

**当前规则与影响**

- 查询指南明确匿名、按需发现；主入口的开发依赖和项目选择没有显式排除纯事实问答。源码存在误路由风险，但尚未真实观察到强制安装/建项目，不能把风险称为已确认运行故障。

**拟统一规则**

- 在主入口列出纯API事实问答路由：共享启动维护/监控检查保持原有非阻断约束，随后直接按api-discovery发现并调用MCP；不进入CLI/pnpm安装、项目选择、appId或PRD检查。不改业务调用所需登录、权限和项目规则。

**修改落点**

- skills/qdmp-skill/SKILL.md
- skills/qdmp-skill/knowledge/api-discovery.md

**修复前准备**

- 准备无项目和无CLI/pnpm的隔离目录及已连接匿名MCP的宿主会话。
- 为当前目录准备可核实的监控状态，避免把监控披露与API查询依赖混为一件事。
- 保留API-017的待执行/待裁决状态；只保存修复提案，不提前填通过。

**实施步骤**

- 在主入口紧邻登录优先路由处增加简短的纯事实查询分流，明示适用意图和跳过哪些开发前置。
- 将第零步、项目选择的适用范围限定到确需CLI/项目的动作，引用统一分流，不另写复杂状态机。
- 检查问接口与接入接口实现两种意图：前者仅MCP，后者仍按项目开发流程生成适配层。
- 确认没有重新引入CLI MCP客户端、Token要求或权限申请MCP前置校验。

**依赖与待核实点**

- 先确认意图分流口径，建议遵循已经采纳的匿名按需查询方案；无需更改devkit认证协议。
- 真实行为复核须从完整主Skill入口发起，不能只单独阅读api-discovery后宣称入口已通过。

**回归验收**

- 关联用例：API-017、API-002、API-003、API-006、CROSS-001。
- 纯事实查询可在没有项目、appId和CLI/pnpm时完成真实MCP查询，不发起安装、创建项目或PRD请求。
- MCP缺失时只给匿名接入指引；查询失败不会被解释成未登录。
- 需要改业务代码的请求仍正确执行相关项目检查；运维只读请求继续使用原工具。
- 监控拒绝、未完成或维护的proceed_monitoring=false不会阻断不依赖它的事实问答。

依据：[skills/qdmp-skill/SKILL.md：[21, 103, 105, 107, 114, 115, 129, 135, 137, 159]](../../skills/qdmp-skill/SKILL.md)；[skills/qdmp-skill/knowledge/api-discovery.md：[3, 7, 14, 21, 23, 29]](../../skills/qdmp-skill/knowledge/api-discovery.md)。

### ISSUE-PRD 显式跳过 PRD 的入口与必做工作流口径冲突

类别：意图路由与工程判定；性质：明确规则矛盾；优先级：P1；批次：B2；状态：待修复。

**触发场景**

- 已有EMP项目没有doc/prd.md，用户明确选择跳过或直接说本次跳过PRD。
- 用户已在主入口选择跳过，又进入项目工作流时被再次劝导/要求相同确认。
- 用户只查日志、版本或启动真机调试，不应进入开发PRD检查。

**当前规则与影响**

- 主入口允许跳过，项目工作流标题和开头却写开发前必做；同一项目工作流后文又提供确认跳过并直接操作的分支，开发调试也允许坚持跳过。Agent可能重复询问、强行生成PRD或错误阻断。

**拟统一规则**

- PRD是开发建议和可选设计工作流，不是用户已经明确跳过后的硬前置。首次缺PRD可一次展示先设计/反向生成/跳过；已有明确跳过决定直接继续本次已授权开发，不重新问相同决定、不虚构PRD。用户要求设计/已有PRD需确认目标时继续原设计流程；发布阶段的现有一致性检查独立保留。

**修改落点**

- skills/qdmp-skill/knowledge/project-workflows.md
- skills/qdmp-skill/SKILL.md
- skills/qdmp-skill/knowledge/backend-operations.md

**修复前准备**

- 准备无PRD、有PRD、明确跳过、要求反向生成及纯运维五类隔离会话。
- 保存用户最新明确选择和当前范围，不创建永久授权文件或改变已有PRD内容。
- 保留FLOW-017待执行/待裁决，规则实施后重跑；不将方案采纳视为真实测试通过。

**实施步骤**

- 把项目工作流的必做标题和无条件要求改为按用户意图进入PRD设计；引用主入口一次选择。
- 删除主入口已取得明确跳过后的重复确认，允许用户直接表达跳过；保留未明确时的一次选择。
- 将开发调试、数据建模的缺PRD提示统一为同一选择语义，保留原业务建模确认。
- 检查发布前PRD反向生成/一致性检查的独立范围，不因开发阶段跳过而默默取消发布检查，也不提前生成虚构需求。

**依赖与待核实点**

- 建议按主入口和工作流已有跳过分支统一，避免重新引入用户审批。
- 不变更产品底线检查、部署授权或schema业务确认等无关约束。

**回归验收**

- 关联用例：FLOW-017、FLOW-016、FLOW-018、FLOW-019、FLOW-055、CROSS-001。
- 用户明确跳过后一次决定生效，本次不反复询问、不强制生成PRD、可继续已授权开发。
- 用户选择设计或反向生成时仍读取相应来源并由真实需求/代码生成，不伪造已确认信息。
- 纯运维/真机/体验版任务不被开发PRD检查阻断。
- 发布前现有一致性检查单独验收；已有PRD和用户最新需求发生变化时正确处理。

依据：[skills/qdmp-skill/SKILL.md：[176, 183, 184, 186, 200, 204, 205, 206]](../../skills/qdmp-skill/SKILL.md)；[skills/qdmp-skill/knowledge/project-workflows.md：[117, 119, 144, 148, 158, 168, 169, 173, 282]](../../skills/qdmp-skill/knowledge/project-workflows.md)；[skills/qdmp-skill/knowledge/project-workflows.md：[407, 409, 411, 413, 441, 443]](../../skills/qdmp-skill/knowledge/project-workflows.md)；[skills/qdmp-skill/knowledge/backend-operations.md：[1056]](../../skills/qdmp-skill/knowledge/backend-operations.md)。

### WF-ISSUE-01 EMP判定规则对通用依赖给出相反结论

类别：意图路由与工程判定；性质：明确规则矛盾；优先级：P1；批次：B2；状态：待修复。

**触发场景**

- loader、模板来源及实际构建链已经证明为EMP，但package.json含flyio或tailwindcss。
- 只有旧依赖字符串、锁文件残留或别名，Agent需判断是否真实使用effuse运行时。

**当前规则与影响**

- 主SKILL和upgrade禁止用通用依赖单独判1.0，工作流grep命中flyio/tailwindcss却直接判1.0并停止；EMP项目可能被错误要求迁移。Tailwind本身仍被设计规范禁止引入，不能用修复代际误判来放开设计约束。

**拟统一规则**

- 分开判断工程运行时与依赖合规：EMP身份依据loader、模板来源、真实构建链及有效effuse引用；通用依赖或package版本不单独判代际。依赖不符合现有Taro/设计规范时单独报告和整改，不称为1.0工程，不直接改loader冒充迁移。

**修改落点**

- skills/qdmp-skill/knowledge/project-workflows.md
- skills/qdmp-skill/SKILL.md

**修复前准备**

- 准备健康EMP、真实effuse/SPA、EMP加通用依赖、仅锁文件残留/别名等隔离工程副本。
- 保留现有源码与锁文件，禁止通过删除字符串或改loader制造通过。
- 按设计规范保留不引入Tailwind的要求，确保修复只消除错误代际结论。

**实施步骤**

- 替换工作流中grep任一项即1.0的规则，复用主入口的综合运行时判断。
- 将明确effuse有效引用的停止条件和一般依赖规范整改条件写成不同结果。
- 检查新建后自检、已有项目、开发调试和绑定上传是否都引用同一判据。
- 保留无法读取配置/构建链时的真实缺口，不将读取失败当通过。

**依赖与待核实点**

- 按现有主SKILL和upgrade的综合判据统一即可；flyio具体整改要求若需新增，应作为单独依赖规范决策，不夹带进运行时判定。

**回归验收**

- 关联用例：FLOW-006、FLOW-005、FLOW-013、FLOW-014、GOV-053。
- 仅flyio/tailwindcss存在不能把已证实EMP项目称为1.0。
- 真实effuse/SPA仍停止并保留原工程，不通过改loader硬转EMP。
- Tailwind等规范违规被按正确原因提示，且不会因此自动放行不符合现有前端规范的代码。
- 所有入口给出一致的工程身份结论，失败时展示证据而非猜测。

依据：[skills/qdmp-skill/SKILL.md：[163, 174]](../../skills/qdmp-skill/SKILL.md)；[skills/qdmp-skill/knowledge/project-workflows.md：[31, 36, 39, 274, 276]](../../skills/qdmp-skill/knowledge/project-workflows.md)；[skills/qdmp-skill/references/upgrade.md：[94, 95, 96, 97]](../../skills/qdmp-skill/references/upgrade.md)；[skills/qdmp-design-rules/references/design-spec.md：[171]](../../skills/qdmp-design-rules/references/design-spec.md)。

### WF-ISSUE-02 项目发现固定容器路径不能覆盖本地指定目录

类别：意图路由与工程判定；性质：本地环境兼容缺口；优先级：P0；批次：B2；状态：待修复。

**触发场景**

- 用户明确指定/Users/...或其他本地绝对目录，项目不在/workspace。
- 当前目录是项目根、frontend子目录、多根工作区或同时有新旧配置；用户要求使用已有项目。
- 工作区没有项目，但用户尚未要求新建。

**当前规则与影响**

- 主入口固定扫描/workspace，未发现就直接新建；本地指定项目可能被漏检，并在错误目录创建无关工程。后端配置子流程已有根/前端/父目录识别，但入口没有复用其定位能力。

**拟统一规则**

- 项目操作先使用用户明确指定路径，其次当前目录及已知工作区根；按统一配置定位子流程确认projectRoot并去重。只在宿主确为容器且工作区为/workspace时使用该路径。未发现项目不等于新建意图；仅用户明确新建时创建，其他情况说明缺少的路径/配置并澄清。

**修改落点**

- skills/qdmp-skill/SKILL.md
- skills/qdmp-skill/knowledge/backend-operations.md

**修复前准备**

- 准备当前本地路径、中文/空格路径、项目子目录、双配置和多项目夹具，均不使用业务生产工程做可变操作。
- 记录用户传入路径、解析后的projectRoot和配置依据；对敏感配置只保留路径及字段存在性，不输出值。
- 不扫描整个用户目录，不新建/workspace或伪造.git改变识别结果。

**实施步骤**

- 移除默认强制/workspace及选项中写死的路径，改用已确定的实际工作区/项目路径。
- 把项目根解析与去重指向现有读取项目配置子流程，补充当前目录和用户指定路径的优先级。
- 将未找到项目分支从无条件创建改为按用户意图区分；明确新建仍按原创建流程。
- 保持新旧配置识别和幂等迁移，不把配置迁移视为运行时升级。

**依赖与待核实点**

- 需要确认宿主传入的实际工作目录/工作区根；本地路径要求已由用户明确，/workspace不能作为通用默认。
- 对符号链接/跨工作区路径可记录实际解析依据；不扩大任务授权范围。

**回归验收**

- 关联用例：FLOW-007、FLOW-008、FLOW-009、FLOW-010、FLOW-013。
- 明确指定的本地工程被正确选中，不扫描无关/workspace后误建项目。
- 从frontend子目录识别父项目，新旧配置对应同一工程只展示一次。
- 多工程只在确需选择时询问，已明确路径不重复要求选择。
- 无工程且未表达新建时不产生目录、模板下载或平台写入；明确新建仍能按原2.0模板规则执行。

依据：[skills/qdmp-skill/SKILL.md：[137, 139, 142, 152, 154, 159]](../../skills/qdmp-skill/SKILL.md)；[skills/qdmp-skill/knowledge/backend-operations.md：[67, 68, 69, 70, 71]](../../skills/qdmp-skill/knowledge/backend-operations.md)。

### WF-ISSUE-04 运行版本落后不能单凭比较判定已回滚

类别：本地兼容与状态诊断；性质：明确错误推断；优先级：P1；批次：B3；状态：待修复。

**触发场景**

- 最新版本已发布但Pipeline仍运行，当前实例仍跑旧版。
- 最新部署失败，用户查看线上是否最新。
- 用户确实执行过回滚，需要确认运行版本与回滚记录。

**当前规则与影响**

- status只查询当前部署版本与版本清单，只要当前落后于最新版本便显示已回滚。版本差异不能证明回滚动作，可能误报部署历史并影响下一次发布/排障决策。

**拟统一规则**

- 始终分别展示当前运行版本与最新发布版本。相同可描述已运行最新；当前为空仅在真实响应明确无部署时描述未部署。当前不同先描述尚未运行最新，只有Pipeline和明确回滚结果/历史证据足够时再解释原因；查询失败、版本格式不明或证据不足应显示未知，不能等价为未部署或已回滚。

**修改落点**

- skills/qdmp-skill/knowledge/backend-operations.md：status对比示例和状态判断；与Pipeline跟踪、rollback结果口径统一
- test/real-environment/cases.json：FLOW-052判定与状态组合
- test/real-environment/cases.md：同步对应段落

**修复前准备**

- 确认现有部署版本、版本清单和Pipeline工具返回字段；从本地现有声明或受控响应检查，不能凭名称假设有回滚历史字段。
- 准备受控响应：相同、旧版+running、旧版+failed、明确回滚成功、无部署、查询失败。

**实施步骤**

- 先修改status的最小可靠结论，移除落后等于已回滚。
- 仅在用户询问原因且已有证据不足时复用现有Pipeline/回滚查询能力补充；无该能力时明确未知，不发明新接口。
- 统一Pipeline仍运行、失败和结果未知的展示，不自动触发发布或回滚。
- 补状态组合回归与FLOW-052真实只读验收。

**依赖与待核实点**

- 确认现有工具能提供哪些状态证据；最小修复不依赖新增工具或服务。

**回归验收**

- 关联用例：FLOW-052、FLOW-048、FLOW-050、FLOW-051、FLOW-054、CROSS-001。
- 旧版本加running或failed都不会显示为已回滚。
- 只有明确回滚证据才显示回滚，并保留当前与目标版本。
- 部署查询失败不显示未部署，证据不足不伪造原因。
- 查询全程只读，日志/版本调用不改变线上运行版本。

依据：[skills/qdmp-skill/knowledge/backend-operations.md：[769, 770, 771, 779, 782]](../../skills/qdmp-skill/knowledge/backend-operations.md)；[skills/qdmp-skill/knowledge/backend-operations.md：[225, 227, 229, 230, 231]](../../skills/qdmp-skill/knowledge/backend-operations.md)。

### WF-ISSUE-05 本地联调仅有Debian容器命令缺少桌面适配

类别：本地兼容与状态诊断；性质：本地环境兼容缺口；优先级：P1；批次：B3；状态：待修复。

**触发场景**

- Mac或Windows用户要求在本机启动后端或全量前后端联调。
- 宿主没有ss、GNU stat、system nginx或Claude的run_in_background参数。
- 用户本机已有nginx配置和其他开发服务。

**当前规则与影响**

- test-deploy明确假设Debian12容器，但入口无桌面分流，前端联调直接使用Linux端口命令、/etc/nginx系统路径和特定宿主后台参数。若在当前本地桌面执行，可能命令失败、改错系统代理或将容器端口入口误称本机可达。它是未覆盖执行环境，并非声明容器路径本身错误。

**拟统一规则**

- 先识别实际执行环境与宿主工具，保留明确容器场景的既有流程；桌面场景复用项目已有启动与代理配置，使用当前宿主能保活和读取输出的后台工具。端口、数据库主机及访问地址根据实际执行位置确定，host.docker.internal仅用于适用的容器到宿主场景。仅改本项目确有需要的配置，不默认修改系统nginx。

**修改落点**

- skills/qdmp-skill/knowledge/backend-operations.md：打包体积检测、test-deploy环境前置、数据库连通性和启动说明
- skills/qdmp-skill/knowledge/project-workflows.md：前端启动、端口检查、nginx代理与结果模板
- skills/qdmp-skill/knowledge/agent-login.md：复用已有宿主工具适配模式，必要时引用不重复维护
- test/real-environment/cases.json：FLOW-032与各宿主/平台展开

**修复前准备**

- 只读记录OS、当前是否容器、项目现有dev/start/proxy配置及可用端口/后台能力。
- 确认本地目标范围：真实桌面直接运行，或用户已有容器；不为适配测试自动安装nginx或重建用户环境。
- 读取同项目已有代理配置后设计局部改动；保留配置摘要与还原路径。

**实施步骤**

- 把通用步骤与Debian容器专用步骤分开，以用户实际环境和项目脚本选路径。
- 端口/文件体积检查使用实际可用工具；后台运行按当前宿主工具能力传参，避免把Claude参数传给Codex。
- 桌面优先项目级dev代理；只有任务实际需要且已授权系统代理时才修改相应配置，不能删除默认站点作为通用前置。
- 动态展示前端/后端/代理实际监听与用户可达地址；对无法提供保活或转发能力的宿主明确限制。
- 在隔离macOS、Windows及明确Debian容器各跑正常启动、已运行复用、失败和停止清理回归。

**依赖与待核实点**

- 桌面支持边界与现有项目代理能力需先确认；不要求新增通用安装器或跨平台大框架。
- 依赖WF-ISSUE-06的端口归属规则；与WF-ISSUE-03运行配置选择对齐。

**回归验收**

- 关联用例：FLOW-026、FLOW-027、FLOW-028、FLOW-029、FLOW-032、FLOW-035、FLOW-050、CROSS-003。
- Mac/Windows不会无条件执行ss、stat -c或写/etc/nginx；容器路径仍可按其已知工具运行。
- 不同宿主使用各自实际后台接口，保存同一会话并读取真实ready/失败输出。
- 仅前端不自动启动后端，全量模式后端失败不继续前端；真机debug不被转到nginx联调。
- 展示的地址与执行位置一致，容器localhost不冒充手机可达地址。
- 联调完成或用户停止后只清理本任务资源，用户现有代理配置与无关进程保持不变。

依据：[skills/qdmp-skill/knowledge/backend-operations.md：[204, 790, 824, 826, 977]](../../skills/qdmp-skill/knowledge/backend-operations.md)；[skills/qdmp-skill/knowledge/project-workflows.md：[327, 329, 333, 339, 345, 348, 368, 381, 382]](../../skills/qdmp-skill/knowledge/project-workflows.md)；[skills/qdmp-skill/knowledge/agent-login.md：[27, 29, 30, 31, 32, 33, 34]](../../skills/qdmp-skill/knowledge/agent-login.md)。

### GOV-F02 入口query值含保留字符或重复键时缺少内层构造契约

类别：入口参数协议；性质：缺少解析契约依据；优先级：P1；批次：B4；状态：待取得解析契约。

**触发场景**

- 瓷片区入口的页面参数值包含中文、空格、&、=、?、%、+，或同名键重复；用户提供原始键值、已有内层查询串或已编码外层query时，Agent需要生成可复制链接并保证页面收参正确。

**当前规则与影响**

- 入口Skill只给出普通a=b&c=d以及完整query字符串一次外层编码，未定义原始值中的分隔符如何处理、是否允许重复键、页面最终解析的首值/末值/数组语义。单凭外层编码不能证明原始键值可往返。已只读检索miniapp-h5和qdmp-web，找到的是不带path/query的二维码链接生成及开放平台/API路由，未找到qiandao.com/miniapp入口到小程序页面的实际解析实现，不能据此拍板具体内层编码算法。

**拟统一规则**

- 先确认真实入口提取query、解码、透传到页面以及页面解析的完整链路，再定义原始键值与已有编码字符串的输入类型。值内编码与外层完整query编码属于不同层，不能把正确两层编码误称为重复编码；同一外层字符串重复encode才是需要避免的情况。重复键策略以真实实现与产品约定为准，未知时不默认保留、覆盖或转数组。

**修改落点**

- skills/qdmp-entry-route/SKILL.md（取得实现依据后补最小必要构造规则和往返示例）
- test/real-environment/cases.json（GOV-060至GOV-064的输入分支、预期与证据）
- test/real-environment/cases.md（与结构化用例同步）
- 入口URL构造/解析回归测试文件（实现依据确认后新增；不预先把猜测算法固化为测试）

**修复前准备**

- 准备原始键值测试向量：普通值、中文/空格、&/=/?/%/+、空值、字符串0、已有百分号序列、重复键；为每个向量保留输入类型。
- 取得qiandao.com/miniapp实际入口和目标小程序页面解析代码或已核验契约，并记录版本；当前两个本地仓库不是该解析实现的证据。
- 为真实测试准备只读展示最终收参的专用页面，逐层记录外层query取值、解码/透传结果和页面最终键值。

**实施步骤**

- 定位并核验入口客户端/落地页提取、解码和路由透传实现，以及目标页面的解析方式。
- 明确三种输入：原始键值对、待嵌入的内层查询串、已完成外层编码的query；无法判断输入类型时只澄清该点，不按是否含%猜测。
- 按真实链路确定值内编码规则、空值及重复键策略，约定哪些输入应拒绝而不是默默改写。
- 精简更新入口Skill：保留普通参数示例，补一个含分隔符值的正确往返示例，明确两层编码与同层重复编码的区别。
- 将往返向量做成有实现依据的确定性回归；再在实际入口到页面链路独立执行每个向量，确认原始键值或已约定的拒绝结果。

**依赖与待核实点**

- 尚需qiandao.com/miniapp实际入口/客户端解析和页面透传实现或经过核验的等价契约。
- 重复键语义需明确约定；不是通过一般URL语法即可推导的平台保证。
- 真实入口回读需要专用测试应用与目标设备，当前仅准备，不执行。

**回归验收**

- 关联用例：GOV-060、GOV-061、GOV-062、GOV-063、GOV-064。
- 普通参数示例保持兼容，无参数时省略query，path与参数仍分离。
- 对每个支持的原始键值向量，实际页面回读符合已确认契约，不截断、串参或意外多解码。
- 已完成外层编码的输入不再次同层encode；字面百分号或值内编码不会仅因包含%而被误判为已完成外层编码。
- 重复键有明确保留/覆盖/数组或拒绝策略并与真实解析链路一致；尚无依据时GOV-064保持待裁决。
- 确定性URL测试通过不能代替真实入口到页面收参链路的验收。

依据：[skills/qdmp-entry-route/SKILL.md：[18, 19, 20, 21, 28, 34, 57]](../../skills/qdmp-entry-route/SKILL.md)；[../miniapp-h5/src/pages/apps/components/VersionCard.vue：[383, 384, 385]](../../../miniapp-h5/src/pages/apps/components/VersionCard.vue)；[../miniapp-h5/src/components/QRModal.vue：[134, 135]](../../../miniapp-h5/src/components/QRModal.vue)；[../miniapp-h5/src/router.ts：[15, 17, 21, 86, 91, 104]](../../../miniapp-h5/src/router.ts)；[../qdmp-web/routes/routes.go：[88, 89, 90, 167, 177, 178]](../../../qdmp-web/routes/routes.go)。

### GOV-F01 开发分支沿用正式版本号，正式维护验收不能把改造内容当已发布快照

类别：正式发布测试基线；性质：测试基线限制；优先级：发布门槛；批次：GATE；状态：待准备正式发布基线。

**触发场景**

- 将当前有未提交改造、但仍声明1.1.14的本地分支当作正式1.1.14安装，随后执行启动维护、升级或监控引导验收。

**当前规则与影响**

- 七份插件与独立Skill版本声明均为1.1.14；维护入口会将实际加载内容与正式发布快照比较。同版本内容不同或本地开发来源可能返回same_version_content_mismatch/manual_required，proceed_monitoring=false。这是预期保护；忽略该结果可能把开发工作树当成稳定发布并误报升级、Hook或采集验收通过。

**拟统一规则**

- 开发工作树行为测试与正式发布渠道测试使用独立基线。前者记录实际加载路径、HEAD及未提交内容摘要；后者使用真实已发布且完整校验的稳定标签。保留内容比较、手工处理和proceed_monitoring边界，不为测试绕过或修改校验结果。

**修改落点**

- test/real-environment/README.md（补充两类验收基线与运行记录）
- test/real-environment/cases.json（将开发工作树与正式发布运行分开记录）
- .claude-plugin/plugin.json（后续正式版本准备时同步）
- .codex-plugin/plugin.json（后续正式版本准备时同步）
- .qoder-plugin/plugin.json（后续正式版本准备时同步）
- skills/qdmp-skill/references/skill-release.json（后续正式版本准备时同步）
- skills/qdmp-product-rules/references/skill-release.json（后续正式版本准备时同步）
- skills/qdmp-design-rules/references/skill-release.json（后续正式版本准备时同步）
- skills/qdmp-entry-route/references/skill-release.json（后续正式版本准备时同步）

**修复前准备**

- 保存当前分支、HEAD、工作树差异摘要、七份版本声明和实际加载来源；现有cases.json已有基准摘要，可作为开发测试起点。
- 准备独立宿主测试配置与目录，避免覆盖日常正式安装和监控状态。
- 列出正式发布前所需版本一致性、完整包、内容校验与重载检查，不现在修改版本收据、宿主配置或发布标签。

**实施步骤**

- 先完成其他业务规则修复并固定可复现的候选快照；开发行为测试始终明确其不是正式发布验收。
- 正式版本准备时查询当前真实稳定Release并选择新语义版本，同步三份plugin.json和四份skill-release.json，保留原版本一致性测试。
- 对候选快照运行既有发布/分发检查；在获准发布后才生成真实稳定标签和制品。仅改版本号不等于正式发布。
- 在独立宿主配置使用该正式发布完整快照执行安装/升级，核对实际加载内容与重载结果，再进行监控端到端验收。
- 保留同版本被篡改、本地开发市场、更新结果不明等负向回归；这些情况继续按原维护规则停止监控引导，而业务任务可继续。

**依赖与待核实点**

- 其他规则修复形成固定候选快照。
- 正式版本准备时的真实稳定Release信息与获准发布范围。
- 独立宿主测试配置；真实监控相关运行仍需对应有效授权和真实证据。

**回归验收**

- 关联用例：GOV-001、GOV-002、GOV-005、GOV-013、GOV-019、GOV-023。
- 三份插件和四份独立Skill版本一致，且正式安装所用版本真实存在于稳定发布中。
- 开发工作树、正式安装与当前会话加载来源分别可查，不能仅凭相同版本号判定同一内容。
- 同版本内容差异依旧返回人工处理或内容差异状态，proceed_monitoring=false；不自动覆盖现场或重放旧引导。
- 正式升级需完整包校验和宿主重载；更新命令本身不改变采集同意、Hook信任或扩大目录范围。
- 业务功能测试通过不被写成正式升级或真实Hook/落库通过。

依据：[skills/qdmp-skill/references/skill-release.json：[2, 3, 4]](../../skills/qdmp-skill/references/skill-release.json)；[skills/qdmp-skill/references/upgrade.md：[25, 53, 57]](../../skills/qdmp-skill/references/upgrade.md)；[skills/qdmp-skill/scripts/ensure-current.mjs：[415, 418, 423, 425, 427, 428]](../../skills/qdmp-skill/scripts/ensure-current.mjs)；[test/ensure-current.test.mjs：[244, 246, 248, 251, 255, 257, 264, 267, 273]](../../test/ensure-current.test.mjs)。

## 修复完成的判定

- 相关章节不再给出相反规则，且没有新增无关的登录、项目创建、安装或确认前置。
- 原有调用顺序、权限边界和历史测试保留；仅更新因规则澄清而改变的用例预期，不将待执行直接改为通过。
- 数据库配置、本地进程和编码修复先在隔离样本/受控服务验证，再按测试计划进行真实环境验收。
- 版本基线项保持独立：规则修好不等于已发布，开发源码可加载不等于正式更新或监控链路通过。
