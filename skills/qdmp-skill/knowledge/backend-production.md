# 后端运行契约与正式发布

新建项目使用原模板仓库 `git@github.com:EchoTechFE/qdmp-taro-template.git` 提供的全栈模板，默认 Go 后端仅保留通用生产能力。已有 Node 后端保留业务实现，由 CLI 的 `nodejs22` 适配执行构建、配置注入和同一 MCP 发布链路。Go 的 `backend/backend-template.json` 只描述 `schemaVersion`、`runtime`、`environment`、`entrypoint`、`build` 和 `configMarker` 六项运行契约；Node 使用 package/lock/入口/helper 契约，不要求该 Go 元数据。初始化、打包、上传和 MCP 调用不需要浏览器、Playwright、Electron 或 workflow 的前端依赖。

## Skill、Agent、CLI 与平台的职责

发布范围、执行顺序、授权边界、可选 diff 审查和上线验收规则由 qdmp-skill 维护；Agent 读取本规范后识别项目形态、决定本次范围、调用工具并完成验收。CLI 提供模板生成、构建打包、上传和 MCP 调用能力，默认 deploy 一次完成当前代码的构建发布；归档与摘要是内部校验，不是用户审批步骤。backend deploy 成功只返回 Pipeline 事实与 acceptance_required，不自动调用 Aliyun/K8s 查询；部署版本、副本 Ready 和健康证据由 Agent 按 Skill 收集并判断，不能用 CLI 返回替代上线验收。两个副本 Ready、健康检查等验收条件只在 Skill 维护，不能在 CLI 中另立一份产品流程。

MCP 和业务 API 的服务实现属于平台，Skill 维护参数和调用指引。CLI 不会因后端命令自动发布前端，也没有自动取得全部副本 Ready 和健康证据的完整能力。全栈项目由 Agent 按 [项目形态和范围分流](./project-workflows.md#流程四打包部署) 串联后端验收与前端上传/提审；纯前端不进入本后端流程。

CLI 后端发布适配支持 `runtime: "go"` 和 `"nodejs22"`。Go 要求 Go 1.24 或更新版本；Node 打包校验使用 Node 22，不能拿 Node 24 的语法检查冒充 Node 22 兼容。旧 `node` / `nodejs` 配置可规范为 `nodejs22`，保留业务语言。平台 MCP 的 `init_repo` 契约还接受 `python312`，但当前 CLI 没有 Python 发布适配；这只限制该后端的打包部署，不阻断目录/前端迁移或要求重写为 Go。旧项目按 [旧项目强制迁移](./project-workflows.md#旧项目强制迁移) 统一目录、公开配置和 EMP，只有本次需要后端操作时才执行本文件的 runtime 验收。

Node 适配已通过实际 MCP 生产发布验证：配置 JSON 随后端私有归档进入镜像，Node 22 进程成功启动，两个新副本 Ready，健康、就绪与配置证明接口均成功读取本次注入变量。该验证支持保留旧 Node 后端的方案，不把测试应用、固定变量或业务接口写成通用要求；后续每个应用仍须完成自身 Pipeline、启动、Ready 和健康验收，也不能据此声称研发功能已发布到 npm。

## 初始化与配置

创建命令沿用 `qdmp create <项目名>` 或 `qdmp create <项目名> -t default`，不增加后端选择参数。检查实际 CLI 支持完整模板结构校验及 backend init/package/upload/deploy；旧 CLI 不具备这些能力时，升级到包含这些命令的已发布版本并复检；研发验收直接使用当前仓库构建的 CLI。不要仅凭历史最低版本号放行，也不要把尚未发布的命令描述为已在线发布。

模板仓库的全栈布局变更须先合并到 CLI 默认拉取分支，再发布相应 CLI；旧 HEAD 只有前端时应结构校验失败，不能临时拼装后端来放行。目前相关模板改动在研发分支准备审查，不能据此声称主分支已经生效。

新建项目沿用原命令：

```bash
qdmp create myApp -t default
cd myApp
```

create 只克隆一次上述完整模板，校验 frontend/、backend/、运行契约与模板自带的空 qdmp-config.json，保留主配置内容，只设置 0600 权限及忽略规则。克隆流程会移除模板 .git，主配置在生成项目中未被跟踪；不移动模板目录、不拼装后端、不再克隆第二个仓库。默认新项目包含 frontend/、backend/ 和 qdmp-config.json。已有项目根目录存在 `qdmp.json` 时必须先完成强制迁移：无 `backend/` 为旧纯前端，有该目录为旧全栈；不存在纯后端项目。迁移后的纯前端明确需要增加后端时，在项目根目录执行：

```bash
qdmp backend init --runtime go --json
```

CLI 后端命令可从项目根目录或 `backend/` 定位同一份根 `qdmp-config.json`；显式 `--config` 只读取指定文件。Go 模板本地从 `../qdmp-config.json` 读取运行配置，`QDMP_CONFIG` 可指定受保护路径；生产配置嵌入私有构建副本。Node 本地和生产的 helper 规则见下文，不将项目根配置直接放入发布包。

`backend init --runtime go` 仍只从同一模板仓库临时提取 Go backend/，不提供另一份手写 Node 模板，也不覆盖已有后端；不要删除 Node 业务目录以绕过检查，或对已有项目重跑 create。旧项目使用 `qdmp config migrate --check --json` 先生成只读计划，再执行 `qdmp config migrate --json` 迁移目录和公开配置；`config init` 只补配置，不能代替迁移。顶层迁移状态只描述目录/前端，`backendReadiness` 单独描述后端。仅前端操作不因后端 pending 失败，也不自动生成 helper 或改造后端。需要后端操作时，再阅读现有 `backend/README.md`，按 pending 接入原 runtime 的配置、入口与发布契约，保留业务行为。

官方模板仓库直接跟踪空的 `qdmp-config.json`，只提交空的 AppID、AppSecret、MongoDB 字段和空的 variables 对象，不得写入实际凭据。直接 git clone 已有主配置，无需 config init。旧项目迁移时从根 `qdmp.json` 与后端受保护配置提取支持字段，权限设为 `0600` 并加入 `.gitignore`；已有主配置保留既有值，只补已核实的缺项。来源冲突时先报告字段与来源，不显示秘密值、不静默覆盖。包含后端的主配置字段如下；迁移纯前端仍创建主配置，但不要求填写 AppSecret、runtime、MongoDB 或 variables：

```json
{
  "appId": "",
  "appSecret": "",
  "runtime": "go",
  "environment": "production",
  "mongodb": { "uri": "", "database": "" },
  "variables": {}
}
```

登录示例要求用户在项目根目录的全局配置文件 `qdmp-config.json` 中填写真实 `appId`、`appSecret`；前端只提交授权码，由后端使用该配置换取 Token。AppSecret 变更后需重新打包部署。

这是待填写的真实配置文件，不是有效的发布凭据。AppID、AppSecret 和 MongoDB 凭据由用户在本地填写，禁止要求在聊天中粘贴。`appId` 须为实际应用身份；本地打包可以没有 AppSecret，上传和正式部署必须有真实 AppSecret，空值和示例占位不能放行。

旧根配置是迁移时的核心配置来源；已能确定的后端受保护配置也应安全提取 MongoDB、业务 variables 等支持字段，不能遗漏或公开秘密。静态工具不能可靠解析的后端动态配置由 Agent 在 `backendReadiness` 中记录待核对；明确仅前端时保留原配置和读取代码，不因此停止前端迁移。本次操作包含后端时，再检查其环境文件、实际加载代码和完整配置，无法确定则停止该后端操作并列出缺口。应用身份冲突、私密字段来源冲突或泄露风险仍在写入前停止，不因范围分流而静默覆盖。已迁移字段以根主配置为权威来源，前端后续变更不反向覆盖它。

MongoDB 可省略、设为 `null`，或保持 `uri` / `database` 都为空，此时为无持久化模式。只填写一项属于错误；启用时必须同时填写完整 `uri` 与等于 `appId` 的 `database`，保留 URI 路径和 `authSource` 等认证语义。无持久化模式不能将内存或文件数据宣称为跨副本持久化；需要共享状态时使用 MongoDB，禁止回退到 FileStore、混用有状态与无状态副本，或引入必须可用的 Redis。

`variables` 是后端专用 JSON 对象，可以保存业务变量；Go 模板按 `map[string]json.RawMessage` 接收，Node 从 helper 导出的 `config.variables` 读取，由业务代码显式使用。变量中的数值必须是有限数，整数须处于 JavaScript 安全整数范围；int64、超大整数等使用字符串，CLI 与 Go 会递归拒绝非有限数和超安全整数。它不会自动变为 `process.env`，不会导入前端，也不表示 CLI 已实现变量对应的业务功能。未知顶层字段会保留在源文件中，但不保证被运行时或打包器注入；只使用已实现的契约字段。

### Node 配置加载与运行契约

Node 后端使用 `runtime: "nodejs22"`，保留 CommonJS / ESM 业务实现。要求 `backend/package.json` 的 `main="index.js"`、`scripts.start="node index.js"`，存在一致的 `package-lock.json`；使用构建工具时，入口加载本次生成的产物。Go 的工具链、注入声明和 `backend-template.json` 不作为 Node 门禁。

无秘密的 `backend/qdmp-runtime-config.cjs` 契约由 CLI 维护，可在本次后端适配时加入源码；单独迁移前端不自动生成它。接入示例：

```js
// CommonJS
const config = require('./qdmp-runtime-config.cjs')
const serviceMode = config.variables?.serviceMode
```

```js
// ESM
import config from './qdmp-runtime-config.cjs'
const serviceMode = config.variables?.serviceMode
```

helper 导出配置对象：生产优先读取同目录 `.qdmp-runtime-config.json`，本地回退根 `../qdmp-config.json`。生产 JSON 由打包器在私有 staging 生成，源工作区不得有已填值的该文件，也不得复制到 frontend。Node 业务需要显式接入 helper；CLI 不通过 preload 或正则替换任意业务代码来伪装接入。原私有配置提取后，Agent 还须处理旧读取引用并保留可恢复副本。

端口 8080、健康/就绪检查、依赖初始化和优雅退出按现有 Node 业务实现验证。对于新补齐的健康路由可使用 `/healthz`、`/readyz`，已有路由按真实契约验收，不仅凭文件存在或字符串引用报告可运行。

### 配置优先级与前端兼容

新 create 默认生成全栈工程，不提供另一个纯前端创建分支；旧纯前端强制迁移为根 `qdmp-config.json + frontend/`，保持无 `backend/`。CLI 日常命令优先读取主配置的公开字段；前端 qdmp.json 中旧 AppID 不构成手动同步前置。主配置损坏或所选环境 appId/devAppId 缺失时报告错误，不能回退根式旧配置。只读身份查询可读取旧身份用于诊断，不构成旧结构继续构建、调试或部署的通道。OpenAPI apply-url 显式 --app-id 沿用参数优先，不要求与当前主配置一致。

前端构建由 `qdmp build` 在内部生成/同步公开 qdmp.json，以适配 Taro/EMP；打包和上传直接使用权威主配置中的公开字段，不复制 AppSecret、MongoDB、variables、runtime 或 environment。`qdmp config sync --json` 只是可选的本地兼容文件更新工具，日常发布不必先执行，也不构建、上传或部署。

旧项目先通过 `qdmp config migrate --check --json` 检查分类、移动清单与配置冲突，再执行 `qdmp config migrate --json`。前端工程必须移入 `frontend/` 并满足 EMP；全栈保留 `backend/` 的原语言和业务。CLI 负责可确定的目录和公开配置迁移，后端 readiness 独立报告，不能把它作为仅前端操作的前置。`backend_runtime_unsupported` 仅表示该后端的 CLI 发布适配缺口，不自动转换语言。已有分离结构不重复搬动，重复执行不得覆盖已有文件。这是一次性迁移，不建立长期双向同步。

`qdmp init -a <实际AppID>` 只初始化空目标身份：已有主配置时仅填写所选环境中空的 appId/devAppId，已有目标值就拒绝；旧项目先完成迁移。它不改绑已有身份，不改 MongoDB。编译产物身份不属于当前主配置对应环境的有效身份映射时，必须重新 `qdmp build`，不能只改 ZIP 身份；这是构建产物校验，不是 config sync 要求。非 EMP 的旧源码仍须按实际依赖和构建链迁移，不能靠主配置 loader 覆盖冒充 EMP。

迁移后的纯前端需要根主配置与 `frontend/`，但不要求 AppSecret、Go 或数据库，不自动生成后端。前端源码只使用公开设置，不得导入根主配置或通过构建变量暴露秘密。

`qdmp-config.json`、`.env*`、私有发布目录、旧 ZIP、密钥和证书必须忽略，不能作为源码再次入包；本次经过验证的发布 ZIP 只上传到已授权的正式服务。`frontend/qdmp.json` 只保留 `appId`、`loader: "EMP"` 等非敏感前端字段。旧项目迁移验证目录与前端规范；仅后端操作再验证实际后端运行契约，不执行前端构建，但仍须识别为包含前端的全栈项目，不能以独立后端目录绕过项目门禁。

生产模板不包含 workflow 的开发存储模式、Collector、Run / Session、发布 Token、测试媒体或 GridFS 业务。媒体只保存 OSS 引用，继续遵守 [云服务使用规范](./backend-operations.md#云服务使用规范)。

## 构建与内部归档校验

在理解工作区实际改动后，先执行对应 runtime 的针对性验证。Go 使用 `go test ./...`，Node 使用 Node 22 运行现有业务测试和配置读取 smoke。已获正式部署授权时，直接执行下一节的 `qdmp backend deploy`；它内部构建最新代码、生成归档和 manifest 并校验摘要，无需用户先执行 package 或传递摘要。只需构建检查、不发布时可独立打包，例如 Go：

```bash
cd backend
go test ./...
cd ..
qdmp backend package --json
```

Node 的独立打包同样使用 `qdmp backend package --json`。打包器在私有 staging 运行 `npm ci --include=dev --no-audit --no-fund`，存在 build 脚本时运行 `npm run build`，再校验入口及 JavaScript。旧 dist/build 不复用，node_modules 不发布；当前构建生成的产物按运行契约进入归档。依赖安装先于秘密注入，构建失败不产生可发布包；这些是 CLI 本地打包步骤，不据此猜测平台内部 Dockerfile 的安装命令。

独立 package 需要指定配置或制品位置时使用 `--config <配置文件路径>`、`--output <ZIP路径>`。归档与 `.manifest.json` 一起保留；manifest 的 `configSha256` 绑定规范化生产配置，包含 AppID、AppSecret、已启用的数据库配置和后端 variables。默认 deploy 内部使用本次生成的归档和摘要，不复用历史包。显式归档仅用于高级调用或可选审查继续；从本次 JSON 结果读取路径和摘要，不猜路径、不手改 manifest。配置改变后必须重新构建；仅选用审查流程时才需要重新审查。

Go 镜像只编译 `main.go`。新增代码必须被该入口真实引用；`go build .` 成功不能代替单入口验证。`package` 在私有临时目录复制源码，只对该副本嵌入生产配置，按平台的 `go build main.go` 验证。Node 将规范化生产配置写入 staging 的 `.qdmp-runtime-config.json`，通过 helper 读取。两种 runtime 均只对私有副本注入，源工作区无秘密生成物；打包失败必须停止。

这是从 workflow 提取的零 KENV 兼容路径：发布包及后续镜像中含运行所需配置，必须按秘密制品保护。它不要求把密钥提交源码，也不表示所有平台都必须嵌入配置。已有受控环境注入方案须按自身部署契约核验；现有 QDMP MCP 没有通用 KENV 写入工具，不能伪造已配置环境变量。

不要使用通用 `zip -r backend`、直接上传源码目录或手工编辑 ZIP；不得在源文件写入密钥，Go 不得生成额外 `init` 文件绕过单入口约束。归档只含后端运行所需文件与本次私有配置投影，排除原始主配置、依赖缓存、旧构建产物、浏览器文件、Dockerfile 和 CI 文件；后两者由平台维护。manifest 的 runtime 必须与规范化主配置、归档和远端仓库一致。输出只展示脱敏证据、路径和 SHA-256，不打印连接串、AppSecret 或 ZIP 正文。

## 正式发布与 master 合并

发布前读取 [后端 MCP 工具契约](../references/backend-mcp.md)，实际工具 schema 优先于文档中的简写。凭据从本地配置读取，禁止放入 shell 参数、日志、说明或 Git。`qdmp upload` 是前端上传；后端使用 `qdmp backend deploy`。

### 自动部署命令

同一 AppID 必须由单一发布者串行操作，从上传到 publish 完成期间不允许其他 Agent、进程、机器或用户同时上传/发版。正式版本上传和可选审查使用的 `temp-diff` 都是远端共享状态，现有 API 没有分布式锁，也不返回可绑定远端上传字节的 hash。无法确定单发布者时先协调串行窗口，不把 CLI 的 Pipeline 冲突检查当成跨机器发布锁。

Agent 根据本次实际改动生成具体中文说明，传入必填的 `--description`。未指定版本时，CLI 查询版本历史并自动选择未占用、递增的不可变 `vX.Y.Z`：首次默认 `v1.0.0`，最新为 `v1.2.3` 则默认 `v1.2.4`。用户指定版本时传入 `--version` 并校验该版本，不再要求用户确认版本。远端镜像构建或推送开始后绝不复用版本，失败修复也增加 patch。

用户已明确授权当前目标和范围的正式部署时，在项目根目录执行：

```bash
qdmp backend deploy --description "<本次说明>" --json
```

默认命令内部构建当前工作区最新代码、校验归档及生产配置，检查仓库（缺少时按 `config.runtime` 初始化 Go 或 Node 仓库）、版本和最新 Pipeline 冲突，然后直接上传正式版本、调用 publish 并有界跟踪 Pipeline。默认不上传 `temp-diff`、不调用 MCP diff、不返回强制的 `diff_review_required`。无需用户提供 archive、sha256 或 reviewDigest，也不应为常规部署先准备旧包。远端 runtime 不同、未结束的 Pipeline、已占用或过低版本、无法确认的返回结构均阻断发布，不自动重建已有仓库。

用户明确授权将已有应用从一种语言切换为另一种语言时，Agent 可先调用 MCP `init_repo(runtime=<目标运行时>)` 更新平台运行时，再回读 `repo_exists` 确认匹配，核对原版本仍可查询后继续新版本部署。本轮 Go→Node 实测支持更新 runtime 并保留已有 tags；这不是目录迁移的默认动作，也不意味着换一个本地目录就隔离了服务。相同 AppID 指向同一个线上后端，语言切换必须在授权范围内，之后完整验收新 Pipeline、启动、副本和健康结果。

### 可选 diff 审查

用户要求先看远端差异，或本次确实需要审计时，显式选用 `--review`。该模式构建当前代码、上传 `temp-diff` 并返回脱敏 diff、`reviewDigest`、`archivePath`、`sha256` 和选定版本，不 publish：

```bash
qdmp backend deploy --review --description "<本次说明>" --json
```

只有选用该模式才有两阶段流程。结果为 `status="diff_review_required"` 时检查脱敏 diff；Go 私有 `main.go` 注入或 Node `.qdmp-runtime-config.json` 投影属于预期，秘密正文须脱敏。发现原始凭据文件、无关文件或异常删除时先处理。仅查看 diff 不构成生产发布授权。已有正式发布授权且检查通过时，使用返回的同一归档、摘要、版本和说明继续，不再询问版本：

```bash
qdmp backend deploy --archive <同一ZIP> --sha256 <同一SHA256> --version <同一vX.Y.Z> --description "<同一说明>" --review-digest <本次reviewDigest> --json
```

审查继续时先校验归档字节与 manifest 的 configSha256，再重新核验远端 diff；匹配才上传同一归档字节并 publish。配置或源码改变后重新构建，选用审查时重新审查；远端 diff 改变则返回新的待审查结果，不 publish。`reviewDigest` 只绑定本次观察到的 diff 和本地制品，不提供跨机器并发隔离。不要在选用审查后跳过实际检查。

| 返回状态 | 处理 |
| --- | --- |
| `diff_review_required` | 仅可选审查模式；尚未正式发布，检查本次 diff 和授权后提交匹配的 reviewDigest。 |
| `pipeline_pending` | 已触发发布但轮询预算用尽；保留版本、归档摘要并查询已有 Pipeline，不重新 deploy/publish。 |
| `acceptance_required`、`deploymentAccepted=false` | 仅返回 Pipeline 事实；Agent 通过宿主 MCP 查询版本、Job/副本证据并验证健康状态，不能报告上线成功。 |
| configSha256 不匹配 | 本地配置已漂移，在发布前拒绝；重新构建，选用审查时重新审查，不能修改 manifest 或重试旧包。 |
| 请求失败、返回结构无法识别或写入结果未知 | 保留脱敏错误；按 `uploading` 进度事件中的目标版本查询远端版本、Pipeline 和日志，不盲目重放有副作用的命令。 |

CLI 通过原生 HTTP MCP 客户端完成发布与 Pipeline 跟踪，不依赖浏览器或 pnpm；用户命令固定使用正式 https://openapi.qiandao.com 端点，不提供服务地址切换参数，也不从项目配置推导其他上传主机。

### 使用宿主 MCP 编排

CLI 因远端返回契约变化而拒绝继续时，先核对真实 schema；可以使用宿主已连接的正式 MCP 按同样约束完成，不绕过无法确认的状态。

1. `qdmp_gitlab_repo_exists` 检查仓库，不存在才 `init_repo(runtime=config.runtime)`；CLI 支持值为 `go` 或 `nodejs22`。已存在且 runtime 不符时停止报告，不自动重置或换语言。
2. 查询版本和最新 Pipeline，`running`、`pending`、`waiting_for_resource` 等未结束状态禁止并发，未知状态先查清。
3. 使用 `qdmp backend package --json` 构建当前最新代码并读取本次归档、摘要和 manifest。仅用户选用 diff 审查时，才上传 `temp-diff` 并调用 `qdmp_gitlab_diff(ref="master", version="temp-diff")`。
4. 核对实际发布授权，使用本次经过内部校验的 ZIP / SHA-256 上传正式版本，再调用 `qdmp_gitlab_publish`，传选定版本和具体说明。可选审查须使用被审查的同一字节；源码或配置改变后重新构建，选用审查时重新审查。
5. 默认间隔 10 秒、最多 60 次调用 `qdmp_gitlab_pipeline_status`。它在 Pipeline 成功后会自动更新日志并合并发布分支，具有写入副作用；通过平台流程完成正式 `master` 合并，不直接 push master。超时保留状态并继续查询，不重新 publish。

上传使用独立 [HTTP multipart 端点](../references/backend-mcp.md#归档上传)，不是 MCP 工具。使用 CLI 从配置读取秘密，禁止退回 `curl -F appSecret=...` 的秘密进程参数示例。同 AppID 单发布者串行、同字节、配置摘要、版本不可变、授权和完整验收在两种执行方式下都保留；diff 审查是可选项，不能由 fallback 重新变为必经流程。

## 上线验收与失败处理

CLI 不自动查询运行版本、Ready 副本或健康结果。Agent 按本 Skill 调用宿主 MCP 获取实际部署版本及 deploy/生产日志，并请求已实现的健康接口；证据缺失时保留未验收状态。发布完成必须同时具备以下证据：

- 本次 Pipeline 的 `build` 和 `deploy` Job 成功。
- 正式部署的两个新副本均 Ready；`1 out of 2 new replicas` 仍未完成。
- Agent 通过宿主 MCP 调用 qdmp_k8s_deployed_version，确认运行版本等于目标版本。
- 单次请求实际实现的健康和就绪接口均通过；默认 Go 模板为 `/healthz`、`/readyz`，Node 按其已核对路由验收。前者证明进程存活，后者证明配置及启用的数据库依赖就绪。不要把 workflow 专用存储能力写成通用模板保证。

Job、Ready 数量或健康证据缺失时，报告“发布已触发 / 验收未完成”及缺少的证据，不能仅凭镜像 tag、HTTP 200 或 Pipeline 总状态宣称上线完成。MCP 不返回所需 Ready 证据时，先查实际 deploy 日志，仍缺失则如实保留未验证。

失败时读取 `qdmp_gitlab_pipeline_logs`，以及显式 `environment="production"` 的 K8s `all` / `startup` / `error` 日志。遵守云服务的停止与限速规范，禁止对 404、WAF 或权限错误持续探测。发布请求结果不明时先查版本和 Pipeline，不能盲目重放。

等待失败 Pipeline 结束，修正后用新 patch 发布并重做全部验收。保留健康旧副本，不强删旧 Pod、不强制流量进入故障副本。用户要求回滚时先展示当前与目标版本、按授权调用 `qdmp_gitlab_rollback`，同样核对 build/deploy、两个 Ready、版本及健康检查；回滚不修改历史版本内容。

只有验收全部通过，才继续全量部署的前端上传并核对其使用的服务地址为 `https://{appId}.qiandaomp.com`；默认模板从公开 AppID 推导地址，无需新增或替换常量，旧项目按实际地址配置处理。最终报告版本、Pipeline / Job、Ready 数量、运行版本和健康结果；归档摘要保留在脱敏机器记录中，无需用户核对。秘密 ZIP 用完后及时清理，保留脱敏记录供排查。
