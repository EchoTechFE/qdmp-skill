---
name: qdmp-skill
description: "千岛小程序开发助手（外部版），用于前后端开发、云服务接口调用与排查、云数据库与数据建模、心愿单、OSS 图片/视频 POST 上传、手机号授权、WebView 域名配置、数据验收、部署、真机扫码调试和设置体验版。涉及千岛云服务 404、接口不存在、频繁重试或 WAF 封 IP 时也使用。"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Skill,
                mcp__qdmp-gitlab__qdmp_gitlab_list_versions, mcp__qdmp-gitlab__qdmp_gitlab_get_version,
                mcp__qdmp-gitlab__qdmp_gitlab_diff, mcp__qdmp-gitlab__qdmp_gitlab_publish,
                mcp__qdmp-gitlab__qdmp_gitlab_pipeline_status, mcp__qdmp-gitlab__qdmp_gitlab_pipeline_logs,
                mcp__qdmp-gitlab__qdmp_gitlab_rollback, mcp__qdmp-gitlab__qdmp_gitlab_init_repo,
                mcp__qdmp-gitlab__qdmp_gitlab_repo_exists, mcp__qdmp-aliyun__qdmp_k8s_deployed_version,
                mcp__qdmp-aliyun__qdmp_k8s_logs]
---

# 千岛小程序开发助手（外部版）

帮助开发者快速创建、开发、调试和部署千岛小程序。发布范围、顺序、审查及验收规则由本 Skill 维护；Agent 按规则编排，CLI 执行模板、构建、上传和 MCP 调用并返回事实，MCP/API 服务由平台实现。完整前后端流程由 Agent 串联，不由某一条后端命令自动完成。

## 知识库

| 文档                                                       | 内容                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [development-guide.md](./knowledge/development-guide.md)   | 开发指南：项目结构、全局权限配置、屏幕方向、截图黑屏、服务端 API、调试发布                  |
| [bridge-api-guide.md](./knowledge/bridge-api-guide.md)     | Bridge API：用户授权查询与申请、原生能力调用、蓝牙、音频、文件下载、陀螺仪、发帖预填参数、IM 消息订阅、导航栏返回首页按钮、参数与返回值类型 |
| [openapi-user-authorization.md](./knowledge/openapi-user-authorization.md) | HTTP method + path → 用户授权 scope 映射，含 JSON |
| [bluetooth.md](./knowledge/bluetooth.md)                  | BLE 中心设备：发现、连接、GATT 读写与通知、MTU、断线清理与重连、Android 配对 |
| [inner-audio.md](./knowledge/inner-audio.md)              | 普通音频：创建、播放、暂停、停止、销毁、实例生命周期与真实调用结果记录 |
| [api-guide.md](./knowledge/api-guide.md)                   | 服务端 API：岛屿详情/加入状态/搜索、合作游戏价格、OSS 图片/视频 POST 上传与发布查询、帖子评论与回复（rcomment）、OpenAPI 错误码与原因（10001–10021） |
| [wishlist.md](./knowledge/wishlist.md)                     | 心愿单 OpenAPI：列表、详情、创建与条目修改、数量/心愿价语义、用户授权、分页及写入不重放 |
| [oss-upload.md](./knowledge/oss-upload.md)                 | OSS：OpenAPI 与存储容量权限、POST 直传/后端中转、两分钟超时、审核发布查询及凭据风险 |
| [phone-authorization.md](./knowledge/phone-authorization.md) | 手机号授权：平台 OpenAPI 申请、App 6.68.0+、原生 button、一次性 code 与后端应用令牌兑换 |
| [backend-production.md](./knowledge/backend-production.md) | Go / Node 后端运行契约、生产配置、内部归档校验、直接发布与可选 diff 审查、上线验收 |
| [backend-mcp.md](./references/backend-mcp.md) | 后端正式发布工具参数、master 合并副作用与 HTTP 上传边界 |
| [backend-operations.md](./knowledge/backend-operations.md) | 云服务使用规范、媒体存储与无效接口限制、通用子流程及操作 1-7                                            |
| [project-workflows.md](./knowledge/project-workflows.md)   | 项目工作流程：创建项目、开发调试、打包部署（真机调试与体验版另见开发指南）                                                |
| [prd-template.md](./knowledge/prd-template.md)             | PRD 模版：好的 PRD 应包含哪些内容 + 可直接使用的模版                                      |
| [skill-data-consent.md](./references/skill-data-consent.md) | Skill 运行数据采集授权文案、项目范围和用户控制入口                                      |

---

## 强烈建议开启运行监控

首次在当前工作目录使用本 Skill 时（包括空目录），先检查监控状态；需要授权时仅展示状态机返回的 `disclosure.display` 短文案及完整说明链接，并在同一次交互中让用户作出一个明确选择。不要在文案前另加推荐段落、`consent` 模板、版本/哈希等元数据清单或第二个授权问题。具体告知和状态处理见 [监控指引](./references/skill-data-consent.md)。已有有效授权或明确拒绝时不重复询问；没有状态证据时不得猜测。拒绝、引导工具不可用或监控失败均不阻塞本 Skill 原有业务。

本 Skill 只提供提示和调用指引，不内置监控脚本或 Bootstrap MCP，不实现安装、授权、平台适配、日志采集或上传。这些能力及其协议由 agent-runtime-telemetry 独立维护。首次授权后的普通对话与重启恢复由该插件的原生 Hook 和后台服务处理，不要求再次调用 qdmp-skill。

冷启动展示状态机返回的 `disclosure.display`，其中包含完整说明链接；`consent` 模板、固定下载来源/版本、当前目录等 `disclosure` 字段用于内部绑定和校验，不再重复展示。用户明确确认后才下载、校验并执行外部 onboarding。核对中央入口返回的动作与已授权范围一致后自动继续，不重复询问相同业务授权。范围变化则重新确认；宿主执行审批不能绕过。具体步骤见监控指引，不能将工具成功或无上下文的“同意”视为授权。

## 规范依赖

涉及后端初始化、模板、配置、打包、正式发布或相关代码 Review 时，先读取 [后端运行契约与正式发布](./knowledge/backend-production.md)；调用部署工具前再读 [后端 MCP 契约](./references/backend-mcp.md)。新建默认 Go 模板由原模板仓库统一提供，CLI 拉取并校验。旧项目迁移只强制新版前端目录、EMP 和公开配置规范，保留已有后端语言与业务，不以新模板的 Go 后端替换旧实现。当前 CLI 后端发布适配支持 `go` / `nodejs22`；Python 或未知 runtime 只影响该后端的打包部署，不阻断前端迁移、构建或上传，也不能改标为 Go 放行。生产流程不依赖浏览器或 workflow 的开发运行栈。

涉及数据建模、媒体存储、云服务接口调用、联调、故障排查、全量点位 / 图片等数据验收或相关代码 Review 时，必须先读取并遵守 [云服务使用规范](./knowledge/backend-operations.md#云服务使用规范)。该要求同样适用于运维排查，不以进入数据建模或部署流程为前提。

本 skill 负责千岛小程序的项目、开发、调试、部署主流程；产品边界和前端设计规范由独立 skill 维护。开发类任务必须按需调用：

| 依赖 skill                 | 使用时机                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/qdmp:qdmp-product-rules` | 新建/改造小程序、页面、路由、登录、权限、SPU/资料、内容回流、社区相关能力、留存机制、脚手架或代码 Review 前     |
| `/qdmp:qdmp-design-rules`  | 设计页面、生成/更新 `DESIGN.md`、编写/审查 Taro Vue/CSS、维护 `app.css` token/组件类、HTML 设计稿移植到 Taro 前 |

执行顺序：

1. 所有开发类需求，先使用 `/qdmp:qdmp-product-rules` 检查产品底线。
2. 涉及前端页面、组件、样式或视觉落地时，再使用 `/qdmp:qdmp-design-rules`。
3. 运维类任务（日志、版本、回滚、部署状态、仅后端发版）不需要调用这两个规范 skill，除非用户同时要求改代码或 Review。

若 `/qdmp:qdmp-product-rules` 标记为黄灯场景，暂停最终实现，先输出需要产品确认的问题；产品确认后再继续技术方案和代码生成。

---

## 启动步骤（每次 skill 触发时必须先执行）

### 软件版本与实际加载来源

先执行软件维护入口，`--skill-dir` 必须是本次实际加载的 Skill 目录，宿主必须明确使用 `codex` / `claude-code` / `qoder`，不能用另一 IDE 的清单判断当前 IDE：

```bash
node <实际 Skill 目录>/scripts/ensure-current.mjs ensure --host <实际宿主> --cwd <实际绝对工作目录> --skill-dir <实际 Skill 目录>
```

入口只维护当前宿主已有的官方安装，不更新或激活 Telemetry、不变更采集同意或 Hook 信任。`reload_required` 时先重新加载实际宿主并读取新 Skill；`proceed_monitoring=false` 时说明具体阻塞原因，不执行监控引导，原业务可继续。不能以重启代替失败处理或重放旧引导。三端更新能力、安装范围、旧客户端升级及备份恢复见 [升级说明](./references/upgrade.md#三类旧入口的诊断与自动更新)。

### 启动前置：当前目录的监控推荐与授权指引

**没有 telemetry MCP 是首次安装的正常状态，不是“监控入口不可用”。** 先读取本 Skill 的 `references/skill-data-consent.md` 和 `references/telemetry-distribution.json`，再决定以下分支；禁止通过在业务目录 `find *telemetry*` / `find *monitor*` 无结果来判定不可安装。

1. 有 telemetry MCP：只读检查当前目录状态；已有效授权或明确拒绝按状态处理。
2. 无 MCP、或需要首次安装/当前目录激活：使用 [脚本状态机](./references/monitor-flow.md)，先查已有流程，再开始新告知：

   ```bash
   node <实际 Skill 绝对目录>/scripts/monitor-flow.mjs list --cwd <实际绝对工作目录> --host codex
   node <实际 Skill 绝对目录>/scripts/monitor-flow.mjs begin --cwd <实际绝对工作目录> --host codex
   ```

   宿主按实际情况使用 `codex` / `claude-code` / `qoder`。有已有流程时先查询 status 并恢复，不能无条件运行 begin。仅展示 begin 返回的 `disclosure.display`，取得一次真实决定后，按状态机的 `allowed_actions` 逐步执行 authorize → fetch → inspect → execute → verify。其余 disclosure 字段只供内部校验，不逐项输出。未授权不下载，版本/目录/目标变化停止，执行前再次核对实时状态，失败不自动重放。安装仍由固定 telemetry 入口执行；不得绕过状态机直接运行 enable 或手改状态文件。

不得要求用户先手动安装 MCP。只有清单/完整告知无效、下载或校验失败、范围/版本冲突或宿主安全限制等真实证据，才能报告具体阻塞；“无 MCP”“本地未找到组件”本身不构成阻塞。已获完整告知下的明确同意后连续执行已授权步骤，不能仅回复“授权已记录，待入口可用”。单独回复“开启监控”而此前未完整告知时，先补全告知与确认，不虚构完成授权。

每次触发先读取 [监控指引](./references/skill-data-consent.md)，检查当前实际工作目录的状态，再进入下面的登录路由和环境检查。仅输入 `@qdmp-skill`、空目录、没有小程序项目或尚未登录，也执行此步骤；不需要先创建项目或提供 appId。

入口不可用或安装失败时，如实说明状态和原因，继续原业务，不展示无法执行的授权问题。已有当前目录有效授权或明确拒绝证据时不重复询问。目录差异按监控指引核实，不自动扩大授权，也不把正常项目根目录识别一律判成错误。

“可选”指用户可拒绝监控，不代表可以省略状态检查。只有当前目录已有有效授权或明确拒绝的状态证据时才跳过询问；其他目录的授权、全局已安装插件或缺少 MCP 工具均不能代替此证据。需要授权时仅展示 `disclosure.display`，并一次性询问是否同意安装并开启当前目录监控与正式上报；用户明确选择后不再重复问同一业务授权。没有回复、暂不决定或要求继续业务时，不启用监控、不视为明确拒绝，并按原业务流程继续。不能把监控选择变成开发、账号查询或登录的必答前置。入口或清单不可用时明确说明“监控引导尚不可用”及原因，再继续原业务；不替用户同意，不启动监控。

**登录优先路由**：用户要求登录、查询当前账号，或命令提示需要登录时，先读 [Agent 对话登录](./knowledge/agent-login.md)。查询当前账号应先执行 `qdmp getMe --env <env>`，只有明确需要登录时才发起登录，不把网络或应用配置错误当成未登录。此类任务不需要项目选择、创建项目或 PRD 检查；收到登录入口后先在对话展示，不要等待用户登录完成才回复。

### 第零步：环境依赖检查

完成上述监控指引处理后，在执行开发业务操作前，必须先确认开发环境就绪：

先用 `node --version` 核对 [CLI 运行时要求](./docs/使用指南.md#前置条件)；运行时不兼容时使用受支持的环境，不自动修改用户全局 Node。历史项目源码兼容不放宽新版 CLI 的运行时要求。

```bash
# 检查 qdmp-cli 是否可用
qdmp-cli --version 2>/dev/null
```

- **命令成功**（输出版本号） → 开发、创建或前端构建/上传前，运行 `node <实际 Skill 目录>/scripts/check-cli.mjs`，要求 CLI ≥0.1.29。旧版本按 [升级说明](./references/upgrade.md) 更新并复检，不仅凭命令存在放行。全栈项目中的仅后端操作、账号查询和登录不受该前端版本门槛限制。
- **命令失败**（command not found 或报错） → 执行自动安装：

```bash
npm install -g qdmp-cli
```

安装完成后再次验证：
```bash
qdmp-cli --version 2>/dev/null
```

- **验证通过** → 按上述任务范围执行版本检查后继续第一步
- **仍然失败** → 停止流程，向用户报告错误信息，提示可能原因（npm 未安装、网络问题、权限不足等），并建议用户手动排查后重试。**严禁在 qdmp-cli 不可用的状态下执行创建项目或发布操作。**

仅创建项目、前端开发或前端构建时检查 pnpm；全栈项目中的仅后端初始化、打包、上传和正式部署不检查、不安装 pnpm，也不依赖浏览器：
```bash
pnpm --version 2>/dev/null
```
- 本次需要 pnpm 且不可用时才执行 `npm install -g pnpm`；安装失败仅阻断依赖它的前端步骤，不阻断全栈项目中独立执行的后端流程。

### 第一步：项目定位与选择

用户已明确当前或指定的已有项目，且能按根 `qdmp-config.json` 或旧项目的根 `qdmp.json` 定位时，直接进入第二步读取该目录，不扫描 `/workspace`、不重复询问项目，也不进入创建流程。`package.json` 缺失属于迁移完整性问题，不能改变旧项目分类。小程序项目始终包含前端，不存在纯后端项目形态；用户要求“仅后端”表示只操作一个全栈项目的 `backend/`，不能据此跳过项目识别或把独立后端目录识别为小程序项目。

只有没有明确项目且本次确实需要选择或创建前端/完整项目时，才扫描 `/workspace` 下的小程序项目（同时识别新结构 `qdmp-config.json` 与旧结构 `qdmp.json`，确保开发到一半的旧项目也能被发现并触发迁移）：
```bash
find /workspace -maxdepth 3 \( -name "qdmp-config.json" -o -name "qdmp.json" \) 2>/dev/null
```

对结果按项目去重（同一项目可能同时匹配到 `qdmp-config.json` 和 `frontend/qdmp.json`，视为一个项目；`projectRoot` 按「读取项目配置」子流程的规则确定）。

**找到至少 1 个项目** → AskUserQuestion 让用户选择：
```yaml
questions:
  - question: "请选择要操作的项目"
    header: "选择项目"
    multiSelect: false
    options:
      - label: "{项目名1}"
        description: "/workspace/{项目名1}  appId: {appId1}"
      - label: "新建项目"
        description: "在 /workspace 下创建一个新的小程序项目"
```
- 选择已有项目 → 切换到该目录，继续第二步
- 选择"新建项目" → 执行流程一：创建项目，完成后继续第二步

**未找到任何项目** → 直接执行流程一：创建项目，完成后继续第二步

### 第二步：读取项目配置

先检查项目根目录是否存在 `qdmp.json`。存在即为旧项目：同级存在 `backend/` 目录时判定为旧全栈，否则判定为旧纯前端；不再通过后端入口是否完整、目录是否为空或依赖是否可构建改变这个旧项目分类。前端开发、构建、真机调试、上传前，先按 [旧项目强制迁移](./knowledge/project-workflows.md#旧项目强制迁移) 完成新版目录、公开配置和 EMP 改造，不能继续使用根式旧前端。原后端语言、源码和运行方式保留；后端就绪状态单独记录，仅在本次操作包含后端时检查其配置和发布契约。

目录/前端迁移完成后只允许两种项目形态：`qdmp-config.json + frontend/` 为纯前端，再包含 `backend/` 为全栈。纯前端也必须有根主配置和分离的 `frontend/`，但不要求填写 AppSecret、Go、MongoDB，也不自动创建后端。全栈也按本次范围读取配置：明确仅前端时，不要求后端 runtime、Go 元数据、Node helper/锁文件或后端构建通过；明确仅后端时，仍须确认当前项目是包含 `frontend/` 的全栈项目，再检查实际后端运行契约。

迁移后检查 `frontend/` 的 loader、依赖和源码引用；仅允许 EMP。搜索 effuse / echo-effuse / effues（含 npm 别名、锁文件、导入和构建脚本），发现有效引用时执行真实的前端运行时迁移，不能只删除字符串或修改 loader 冒充完成。配置布局调整不等于运行时升级。

本次范围包含后端时，读取配置详情见 [backend-operations.md](./knowledge/backend-operations.md)；纯前端在 `frontend/` 按 CLI 构建/关联流程操作，跳过后端凭据和 runtime 要求。

关键变量：
- `projectRoot`：小程序根目录
- `sourceDir`：`{projectRoot}/backend/`
- `mongoUri` / `mongoDatabase`：来自主配置的 mongodb；省略/null/双空表示未启用，部分填写错误，启用后 database=AppID
- `variables`：主配置中的后端专用 JSON 对象，不作为 process.env 或前端变量；变化后重新打包

### 第三步：PRD 检查（仅开发意图时执行）

涉及前端开发前必须先执行 [依赖栈兜底检查（不通过必须停止）](./knowledge/project-workflows.md#依赖栈兜底检查不通过必须停止)，新建和已有项目均适用。结合 loader、模板来源和实际构建链判断工程类型；通用依赖或 package.json.version 不能单独作为 1.0 判据。绑定和上传前核对本地与平台 loader 一致，新建 2.0 项目必须为 EMP。

**判断用户意图**：若当前请求属于以下开发类意图，执行 PRD 检查；否则跳过直接进入操作路由。

开发类意图（需检查 PRD）：
- 新建功能、开发某个页面/接口、实现需求
- 触发流程二（PRD 设计）、流程三（开发调试）
- 数据建模（操作 7）

运维类意图（跳过 PRD 检查）：
- 查日志、查版本、回滚、查状态、部署/发版、后端模板初始化/打包、仅启动真机调试、设置体验版

**PRD 检查逻辑**：检查 `{projectRoot}/doc/prd.md` 是否存在：
- 存在 → 继续，PRD 将在后续流程中按需读取
- 不存在 → 提示用户，并 AskUserQuestion 确认：

```yaml
questions:
  - question: "当前项目还没有 PRD，建议先完成需求设计再开发，可以避免后期返工。"
    header: "PRD"
    multiSelect: false
    options:
      - label: "先设计 PRD（推荐）"
        description: "执行流程二：PRD 设计"
      - label: "从现有代码生成 PRD"
        description: "扫描已有前后端代码，自动反向生成 doc/prd.md"
      - label: "跳过，直接开发"
        description: "不推荐，后续发布前仍会检查 PRD 一致性"
```

- 选择"先设计 PRD" → 执行流程二：PRD 设计（见 project-workflows.md）
- 选择"从现有代码生成 PRD" → 执行流程二 Step 3 代码反向扫描（见 project-workflows.md）
- 选择"跳过" → 继续进入操作路由

---

## 操作路由

用户明确要求“真机调试 / 手机扫码运行”或“上传体验版 / 设置体验版”时，先运行 `node <实际 Skill 目录>/scripts/check-cli.mjs 0.1.32`，再按意图读取 [真机调试](./knowledge/development-guide.md#真机调试) 或 [设置体验版](./knowledge/development-guide.md#设置体验版)。这两类请求是前端操作，不自动部署后端。普通上传仍保持原有行为。

后端正式发布按 [backend-production.md](./knowledge/backend-production.md) 执行，其余操作见 [backend-operations.md](./knowledge/backend-operations.md)。已有当前范围的明确发布授权时连续执行；仅初始化或分析不授权生产写入。

根据用户意图匹配操作：

| 关键词                                                                 | 操作                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| 真机调试、手机扫码运行、真机日志                                      | `qdmp debug`，见 development-guide.md 的真机调试 |
| 上传体验版、上传当前代码给体验人员扫码                                | 构建后 `qdmp upload --experience`，见 development-guide.md 的设置体验版 |
| 将已上传版本设为体验版、切换体验版本                                  | `qdmp experience --version <实际版本号>`，无需重新构建上传 |
| 部署、打包部署、上线、发布、release（未指定范围） | 流程四：先识别实际项目形态，纯前端仅前端、全栈先后端再前端 |
| 全栈发布、前后端一起上线 | 流程四：核对两侧有效，后端通过 Skill 验收后再前端上传/提审 |
| 初始化后端、生成稳定后端模板 | `qdmp backend init --runtime go`，见 backend-production.md |
| 部署后端、发版后端、后端上线、只部署后端、后端 release | 操作 1: publish（仅后端）                           |
| 部署前端、上传前端、前端上线、只部署前端                               | 流程四：打包部署（仅前端，见 project-workflows.md） |
| 查看版本、版本列表、版本历史、发布记录                                 | 操作 2: versions                                    |
| 回滚、回退、恢复到某版本、rollback                                     | 操作 3: rollback                                    |
| 查看日志、服务日志、启动失败、报错、logs、排查问题                     | 操作 4: logs                                        |
| 部署状态、当前版本、线上版本、运行状态、status                         | 操作 5: status                                      |
| 部署后端测试环境、本地跑后端、调试后端、跑一下后端、test-deploy        | 操作 6: test-deploy（仅后端）                       |
| 部署测试环境、本地测试、本地运行、本地调试、启动开发环境 | 流程三：按实际形态选择纯前端或全栈；纯前端不自动生成后端 |
| 数据建模、设计数据、我要存什么数据、数据库设计、定义数据结构、管理数据 | 操作 7: schema                                      |

只说“设置体验版 / 给体验人员扫码”且上下文无法判断目标时，确认是上传当前代码还是使用已上传版本；不要默认重复上传。其他意图不明确时，使用 AskUserQuestion 让用户选择。

工作流程（创建项目、开发调试、打包部署）见 [project-workflows.md](./knowledge/project-workflows.md)。

---

## 操作触发规则

只有用户已明确授权相应操作时才执行，不因完成代码修改就自行衔接发布。仅要求分析、生成模板、打包或查看 diff，不构成正式发布授权。功能修复或开发完成且用户尚未要求后续操作时，在本地检查通过并报告结果后，主动一次性询问是否需要真机测试，以及是否部署本次变更涉及的前端、后端或两者；真机测试与部署是两个独立选择，未获明确授权不执行。

用户明确要求“修改后部署”“部署最新版本”“自动正式发布”且目标、环境、范围与发布内容清楚时，授权覆盖本次编排；Agent 使用完成修改后的当前工作区最新代码，执行检查并生成具体说明，直接调用 `qdmp backend deploy --description "<说明>" --json`。CLI 内部构建、校验归档和配置摘要、自动选择下一未占用 patch，并连续上传发布；不要求用户提供摘要、确认版本或逐步重发指令。默认不调用 diff，不进入强制两阶段部署；只有用户要求或本次需要审计时选用 `--review`，按后端发布文档完成该可选流程。范围变化、构建失败或缺少必要决定时才停止，不能用 CLI 执行成功替代 Skill 的上线验收。

---

## MongoDB 访问边界

**强制约束**：MongoDB 只能由后端服务（`backend/`）访问。

- `frontend/` **严禁**直接连接 MongoDB，所有数据操作必须通过后端 API 接口
- 生成前端代码时，不得引入任何 MongoDB 客户端库或连接逻辑
- 操作 7 生成的 model 代码只写入 `backend/models/`，不涉及 `frontend/`

---

## 代码编写规则

开发类代码生成或 Review 必须先按「规范依赖」调用对应 skill。产品底线、设计系统和 Taro 视觉落地规则不在本节重复维护，避免规范漂移。

用户 `openId` **必须从 `/auth/v1/token` 的 `AUTHORIZATION_CODE` 成功响应 `data.openId` 获取**。禁止从 `user.me`（`GET /user/v1/me`）获取、转换或兜底 `openId`，也不得用其 `id` 替代。登录 code 只交给自身后端换票；`appSecret` 只保存在后端，不放入前端环境变量、构建产物或响应。登录/用户模型实现前读取 [用户 openId 与换票](./knowledge/api-guide.md#21-获取-token)。

涉及帖子评论、回复、评论列表或评论点赞（rcomment）时，必须读取 [api-guide.md](./knowledge/api-guide.md) 的「Lifestyle：评论与回复（Comment / RComment）」；严格区分一级评论列表的 `offset` 分页与回复列表的 `cursor` 分页，并将帖子、评论和回复 ID 保持为 int64 字符串。

涉及心愿单（Folder）列表、详情、创建或条目修改时，读取 [wishlist.md](./knowledge/wishlist.md)；使用 `/folder/v1/*` 与 `user.folder.read`、`user.folder.write`，不要混用单个商品“想要”的 `user.wish.*`。`join` 的数量为绝对覆盖、`num=0` 移出条目，发送后任何失败均不自动重放；完整字段、授权及分页规则见该指南。

涉及千岛 OpenAPI 报错排查或错误处理时，读取 [api-guide.md 的「错误与排查」](./knowledge/api-guide.md#13-错误与排查)，根据业务 `code`、`message` 和 HTTP 状态定位原因；区分应用权限、用户授权、Token 无效或过期、限流与配额耗尽。

千岛 HTTP OpenAPI 对应的用户授权 scope 见 [method/path 映射](./knowledge/openapi-user-authorization.md) 或 [JSON 数据](./references/openapi-user-scopes.json)。

涉及 OSS 文件上传时，读取 [oss-upload.md](./knowledge/oss-upload.md)；除了申请实际使用的 `quota/prepare/result` OpenAPI，还须在平台「能力权限」开通 OSS 存储容量。沿用用户选择的 POST 直传或应用后端中转，说明临时凭据可被抓包复用的风险，进一步优化由用户决定。multipart 中 `file` 必须最后；仅 `result` 返回 `COMMITTED` 且 `cdnUrl` 有效时认定发布成功，无效 POST 凭据不能回退 PUT。

涉及手机号授权时，读取 [phone-authorization.md](./knowledge/phone-authorization.md)；平台须开通“授权码兑换手机号”OpenAPI，千岛 App 须为 6.68.0+。使用原生 `button open-type="getPhoneNumber"` 与 `getphonenumber` 事件，code 交给自己的后端，以应用 `CLIENT_CREDENTIALS` 令牌的 `Access-Token` 调用兑换，不混用登录码或用户 token。

可复用的接入说明和参考代码只保留技术契约，不把某个示例项目的布局、固定文案或展示方式变成统一要求。示例使用占位值，不携带真实项目名称、应用 ID、密钥、token、Cookie、授权码、完整签名或用户资料；运行配置从目标项目安全读取。

### 前端（`frontend/`）

修改前端代码前，必须先读取 `frontend/README.md`（如果存在），确保代码风格、目录结构、命名约定与项目现有规范一致。

涉及以下能力时，必须读取对应指南后再实现：

- 系统级权限声明：读取 [development-guide.md](./knowledge/development-guide.md) 的「小程序全局权限配置」，修改 `frontend/src/app.config.js`，不要把声明误写成运行时 Bridge 调用。
- WebView / `web-view`：读取 [WebView 域名白名单](./knowledge/development-guide.md#webview-域名白名单)，先在千岛开放平台目标小程序的「域名管理」配置允许访问的网页域名。代码或 `app.config.js` 不能替代平台白名单，也不能把普通请求域名配置当作 WebView 已获准。
- OpenAPI 用户授权（`user.*`）：先从 [method/path 映射](./knowledge/openapi-user-authorization.md) 确定 scope，再读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md#一授权-auth) 的「授权 (auth)」，使用 `qd.getEchoAuthorize` 查询、`qd.requireEchoAuthorize` 申请；区分原生回调与业务 `10021`，按需参考首次操作引导和单次业务恢复流程。
- 横屏与自动旋转：读取 [development-guide.md](./knowledge/development-guide.md) 的「屏幕方向配置（SDK 1.0）」；按作用域修改全局 `app.config.js` 或页面 `index.config.js`，不要把 `pageOrientation` 当成运行时 Bridge API。
- 截图黑屏或页面隐私模式：读取 [development-guide.md](./knowledge/development-guide.md) 的「截图黑屏（页面隐私模式）」；在目标页面配置 `screenShotForbidden: true`，Android、iOS、Harmony、Web 均支持。该字段是页面配置，不是 `qd.*` 方法，也不需要注册截屏监听。
- 打开帖子发布页：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「`qd.openPost` — 打开帖子发布页」；保留原有 `islandId`、`appId`、`files` 调用方式，按需新增 `title`、`content`、`labels`、`bizData`。其中 `files` 和 `labels` 必须分别进行 JSON 序列化与 UTF-8 Base64 编码，`bizData` 只进行 JSON 序列化、不进行 Base64 编码；保留 `ShowTitle`，用 `path` 和由开发者自定义的 `query` 替代原有的 `DaoLink`。图案详情场景可将 `path` 设为 `pages/view/index`、`query` 设为 `patternId=${normalizedPatternId}`。不要直接传数组或继续生成 `spuIds`、`tagIds`。
- 取消想要或删除标记：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「`qd.cancelWish` — 取消一条想要记录」和「`qd.cancelMark` — 删除一条 Mark 记录」；传列表或详情返回的记录 ID，不要误传 SPU ID，也不要改用同名 HTTP 接口。
- IM 订阅消息：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「IM 消息订阅」，使用业务提供的模板 ID，并处理每个模板的订阅结果。
- 顶部导航栏返回首页按钮：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「导航栏」，确认页面栈场景后调用 `qd.hideHomeButton`；不要把它当成隐藏普通返回箭头的接口。
- 同步获取系统信息：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「`qd.getSystemInfoSync` — 同步获取系统信息」；直接同步调用并使用返回值，不要传回调、包装成 Promise 或添加 `await`。
- 下载文件：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「`qd.downloadFile` — 下载文件」；API 名称是小写 `d` 的 `downloadFile`，用 `success` / `fail` 或明确返回的最终结果判断下载是否完成，不要把返回的 `DownloadTask`、`undefined` 或仅表示派发完成的 Promise 当成下载成功。
- 陀螺仪：读取 [bridge-api-guide.md](./knowledge/bridge-api-guide.md) 的「陀螺仪」；使用同一个监听函数注册和解绑，先监听再启动，并在页面隐藏或卸载时同时调用 `stopGyroscope` 和 `offGyroscopeChange` 清理资源。
- 蓝牙 / BLE：读取 [bluetooth.md](./knowledge/bluetooth.md)，统一使用 `qd.*` 完成中心设备流程；先监听再扫描或读写，设备、服务和特征 ID 必须来自真实结果，按特征能力选择操作，断线后重建会话状态。
- 普通音频播放：读取 [inner-audio.md](./knowledge/inner-audio.md)，使用 `qd.createInnerAudioContext()` 和实例的 `play()`、`pause()`、`stop()`、`destroy()`；实例保存在普通变量或闭包中，暂停后沿用同一实例和音源，方法返回与实际播放事件分别记录。

涉及页面、组件、样式、`DESIGN.md`、`app.css` token/公共组件类时，必须同时使用 `/qdmp:qdmp-design-rules`：

- 小程序样式严禁使用 `:root` 定义 CSS 变量；全局 token 必须定义在 `src/app.css` 的 `page { ... }` 中。生成、移植和 Review 时发现存量 `:root` 必须迁移并删除。
- 有 `DESIGN.md` 时先读取并延续设计系统。
- 无 `DESIGN.md` 且是全新页面/成块 UI 时，先走设计规范中的页面设计和设计系统生成流程。
- 无 `DESIGN.md` 但已有页面时，照现有页面和 `app.css` 保持一致，不凭空引入新 token。

使用 `qd.navigateTo` 传递 query 参数时，URL 参数值不得直接拼接中文、空格、`&`、`?`、`=` 等特殊字符。若参数可能包含中文或特殊字符，必须使用 `encodeURIComponent` 编码：

```javascript
qd.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${encodeURIComponent(cat.name)}`,
})
```

禁止写法：

```javascript
qd.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${cat.name}`,
})
```

### 后端（`backend/`）

默认新项目从官方模板取得空的 qdmp-config.json，CLI 保留内容并设置 0600 权限与忽略规则；克隆流程移除模板 .git，主配置在生成项目中未被跟踪。旧项目先提取受支持的根配置并把前端工程移动到 `frontend/`，只向 `frontend/qdmp.json` 投影公开字段。`backend/` 的原语言、源码和业务继续保留，前端迁移不自动生成 Node helper、不补齐 Go 模板或重写后端配置引用。需要打包部署该后端时，再按实际 runtime 接入配置和运行契约并验收；CLI 不支持的语言报告后端工具缺口，不阻断前端操作。秘密和后端 variables 不得进入前端。

修改前读取 `backend/README.md` 和 [生产运行契约](./knowledge/backend-production.md)。保留对应 runtime 的构建、启动、健康/就绪检查和配置加载；Go 源码嵌入配置保持为空，Node helper 不含秘密，密钥只进入打包器的私有副本。数据库模型复用现有后端入口，不硬编码凭据或自动改写线上 URI。

修改后端代码前，若项目根目录存在 `qdmp-schema.json`，必须先读取它，确保代码直接引用已定义的数据模型，不重复定义字段。新增数据存储需求时，先更新 `qdmp-schema.json`，再生成对应 model 代码。

后端调用千岛 OpenAPI 时，可以使用官方 [qdmp-server-sdk](https://github.com/EchoTechFE/qdmp-server-sdk) 简化认证授权、Token 生命周期管理和类型安全的业务接口调用，安装及用法见仓库 README。

---

## 命令速查

Agent 对话中需要登录或用户要求登录时，先读 [Agent 对话登录](./knowledge/agent-login.md)，使用 `qdmp login --agent --env <prod|dev>`，立即将真实登录链接和 PNG 图片展示给用户，并保持命令等待登录结果。此入口不需要扫描/创建小程序项目或检查 PRD。

| 命令                              | 说明                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `qdmp-cli list`                   | 查看可用模板                                                                  |
| `qdmp create <项目名>` / `qdmp create <项目名> -t default` | 单次拉取全栈模板，保留自带空主配置并设置权限/忽略规则，必须自检 |
| `qdmp backend init --runtime go --json` | 为已迁移的新结构纯前端添加官方 Go 后端；已有后端时拒绝覆盖 |
| `qdmp backend package --json` | 独立构建检查；按 go / nodejs22 注入私有配置，生成归档与内部校验摘要，不发布 |
| `qdmp backend upload --archive <zip> --sha256 <摘要> --version <版本> --json` | 同字节上传 temp-diff / 正式版本 |
| `qdmp backend deploy --description "<说明>" --json` | 默认构建最新代码、内部校验归档、自动选择新 patch 并直接发布；Agent 继续完成上线验收 |
| `qdmp backend deploy --review --description "<说明>" --json` | 可选：构建后仅返回脱敏 diff 和继续参数，不发布；完整流程见 backend-production.md |
| `qdmp config init --json` | 低层配置初始化；旧项目仍须完成目录、公开配置和 EMP 前端迁移，后端 readiness 单独报告 |
| `qdmp config migrate --check --json` | 旧项目只读盘点：按根 qdmp.json 与 backend/ 目录分类，输出目录/配置迁移计划与阻塞项 |
| `qdmp config migrate --json` | 迁移旧项目前端目录和公开配置；frontend_migration_required 阻止前端操作，backendReadiness 单独报告后端状态 |
| `qdmp config sync --json` | 可选：更新本地公开兼容文件；日常命令直接读取主配置，无需先执行 |
| `qdmp-cli init -a <id>`           | 初始化空目标身份；已配置时拒绝覆盖，保留 MongoDB                                                                    |
| `pnpm install`                    | 安装依赖                                                                      |
| `pnpm run dev`                    | 开发模式                                                                      |
| `pnpm run build`                  | 打包构建（本地调试）                                                          |
| `qdmp build`                      | 打包构建（发布上传前必须使用）                                                |
| `qdmp getMe`                      | 在项目目录检查 CLI 登录态；失效时自动提供扫码、登录 URL、账号密码三种方式 |
| `qdmp login`                      | 主动打开三选一登录流程；扫码或 URL 登录成功后自动轮询并保存 Token |
| `qdmp login --agent --env prod`   | Agent 登录：输出链接与 PNG 路径的 JSON 事件，等待浏览器回调或 App 扫码成功 |
| `qdmp-cli upload -d "<版本描述>"` | 上传部署；skill 自动总结当前版本变化并传入描述                                |
| `qdmp upload --experience -d "<版本描述>"` | CLI ≥0.1.32；上传后自动设置本次版本为体验版并输出二维码，无需手填版本号 |
| `qdmp experience --version <实际版本号>` | CLI ≥0.1.32；将已上传的开发版本设为体验版，不重新构建上传 |
| `qdmp review --version <前端版本号> --auto-publish --json` | 当前 CLI 支持时提审并选择审核通过后平台自动发布；提审成功不代表已上线 |
| `qdmp debug` | CLI ≥0.1.32；构建后启动 EMP 真机扫码调试，持续输出日志 |
| `qdmp debug --no-build --json` | 使用已有 EMP 产物，输出二维码和设备日志的 NDJSON 事件 |

新创建沿用原命令，默认从 `git@github.com:EchoTechFE/qdmp-taro-template.git` 获取唯一全栈模板，不增加后端选择参数；可省略 -t 或显式指定 default。创建后检查 frontend/backend 布局、EMP 实际依赖和后端运行契约。上游全栈变更须先合并后再发布 CLI。根目录仍有旧 `qdmp.json` 的项目必须先强制迁移，不能继续兼容根式构建、临时拼装后端或手改 loader 放行。完整步骤见 [创建项目](./knowledge/project-workflows.md#流程一创建项目)。

## 常见问题

| 问题             | 解决方案                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| 依赖安装 401/404 | 配置 npm Token                                                                              |
| qdmp-cli 未找到  | `npm install -g qdmp-cli`                                                                   |
| pnpm 未找到      | `npm install -g pnpm`                                                                       |
| 登录命令一直等待 | 在支持用户输入的前台交互终端执行；也可选择手动登录 URL，完成后 CLI 会自动继续 |
| 图片 403         | index.html 加 `<meta name="referrer" content="no-referrer">`                                |

## OpenAPI 权限申请流程

编码涉及千岛 HTTP OpenAPI 时，从实际代码调用收集接口路径和方法，并通过 qdmp-cli 的 OpenAPI 能力清单查询每个接口唯一的 `id/key`，只记录真实使用的接口。

待申请的多个 key 按稳定顺序编码为可逆的 `requiredApis` 短字符参数，并使用 `qdmp-cli openapi apply-url --env <env> --json` 生成申请链接。显式传入 --app-id 时沿用原参数优先规则，不要求与当前项目主配置一致，也不因主配置损坏而拒绝该显式目标。解码后 key 的数量、值和对应关系必须完全一致，参数需进行 URL 编码。

权限页检测到合法 `requiredApis` 后，解析唯一 key，加载对应清单，默认勾选用户尚未拥有且需要申请的接口并主动打开申请能力弹框。没有 `requiredApis` 时保持原有页面行为，不触发额外的全量 OpenAPI/ability 分页请求。

查找全部 OpenAPI 复用前端现有全量接口，不新增 BFF 接口。Redis 仅作为可选缓存，连接失败不得阻断 BFF 启动；实体及 Redis 读写逻辑放在 `model/redis`，service 层只做业务编排。
