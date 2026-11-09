# 后端运行契约与正式发布

Agent 负责识别范围、补齐配置和上线验收。CLI 执行构建、打包和正式发布。全栈发布先验收后端，再处理前端。按 [项目形态和范围](./project-workflows.md#流程四打包部署) 分流。

## 初始化与配置

旧项目先按 [旧项目迁移](./project-workflows.md#旧项目强制迁移) 处理。已有纯前端项目明确需要新增后端时，在项目根目录执行 `qdmp-cli backend init --runtime go --json`，保留已有后端实现。后端部署前检查实际使用的 CLI 是否支持 `qdmp-cli backend deploy --help`。不支持时，使用指定的研发 CLI 或升级到支持该命令的版本后复检。旧 CLI 的限制不阻断配置引导。

后端发布支持 Go 和 Node.js 22。Go 使用 1.24 或更新版本，并按项目的单入口契约验证。Node 使用 Node 22 和下文的配置加载契约。其他 runtime 的发布限制单独报告，保留现有业务语言。

### 凭据引导与自动写入

先复用项目已有的受保护配置。缺项时在当前对话中一次列出实际所需信息，说明 AppID、AppSecret 可从[千岛开放平台](https://open.qiandao.com)获取，MongoDB 使用业务实际选定的数据源。前端只需目标环境的 AppID，后端换票或发布还需 AppSecret。实际使用 MongoDB 时才询问连接信息。用户可回复所需信息或提供受保护的本地文件路径，Agent 收到后合并写入根 `qdmp-config.json` 并复检，无需用户手改文件。已有本次部署授权时，补齐后继续执行。

- MongoDB 优先接收平台提供的完整 URI 与 database；用户分开提供用户名、密码、主机和端口时，依据实际信息组装 URI，用户名和密码按 URI userinfo 规则分别编码。不猜测主机、账号或认证库，保留用户提供的路径、`authSource` 和其他连接参数。账号和密码保存在 `mongodb.uri` 中，不新增运行时不识别的顶层字段；database 按平台约定等于 AppID。
- 写入前校验字段类型和完整性，保留已有 variables、未知字段和其他环境配置；已配置身份或凭据与新值冲突时先确认替换，不静默覆盖。未提供的信息保持待补充，不伪造凭据。
- 写入秘密前确认 `qdmp-config.json` 在业务项目中未被 Git 跟踪且已被忽略，文件权限为 `0600`。直接克隆时，模板的空配置可能仍被跟踪，需先处理跟踪状态。读取和校验只输出字段名与状态，禁止打印整个配置文件、密钥或完整 URI。

用户暂不提供必要凭据时，继续可独立完成的工作，涉及该凭据的连接或发布保持待完成。仅有 Schema 数据定义、模板自带驱动或可选 Ping，不构成要求提供 MongoDB 凭据的依据。

MongoDB 配置应保留原认证语义。仅声明 Schema 或模板自带驱动，不构成要求用户提供 MongoDB 凭据的依据。实际使用数据库时，由 Agent 核对真实业务调用并验证读写。生产库名为 AppID，迁移既有数据库时先确认数据迁移方案。

`variables` 是后端专用 JSON 对象，由业务代码显式读取。大整数用字符串表示。前端只使用公开配置。

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

`qdmp-config.json` 是项目主配置。Agent 修改目标应用身份后重新构建；前端只使用公开配置。发现主配置无效或目标环境 AppID 缺失，先补齐该环境配置。直接调用原生 Taro 命令需要预先导出公开字段时，可用 `qdmp-cli config sync --json`。

## 构建与内部归档校验

先运行对应 runtime 的业务测试。Go 测试在 `backend/` 运行 `go test ./...`。只检查构建时用 `qdmp-cli backend package --json`；已授权部署时直接执行下一节的命令。打包结果含私有运行配置，按秘密制品处理。使用 CLI 生成归档，源码中不得写入凭据。已有归档在源码或配置变化后须重新打包。

## 正式发布与 master 合并

发布前读取 [后端 MCP 工具契约](../references/backend-mcp.md)，实际工具 schema 优先于文档中的简写。凭据从本地配置读取，禁止放入 shell 参数、日志、说明或 Git。`qdmp-cli upload` 是前端上传；后端使用 `qdmp-cli backend deploy`。

### 自动部署命令

同一 AppID 必须由单一发布者串行操作，从上传到 publish 完成期间不允许其他 Agent、进程、机器或用户同时上传/发版。正式版本上传和可选审查使用的 `temp-diff` 都是远端共享状态，现有 API 没有分布式锁，也不返回可绑定远端上传字节的 hash。无法确定单发布者时先协调串行窗口，不把 CLI 的 Pipeline 冲突检查当成跨机器发布锁。

Agent 根据本次改动填写 `--description`。CLI 默认选择版本，用户指定版本时传入 `--version`。

用户已明确授权当前目标和范围的正式部署时，在项目根目录执行：

```bash
qdmp-cli backend deploy --description "<本次说明>" --json
```

默认使用当前代码直接发布。正式部署无需提前打包或单独审查 diff。遇到运行时不匹配、发布冲突或结果未知时，先核实对应状态。

### 可选 diff 审查

用户要求先看远端差异，或本次确实需要审计时，显式选用 `--review`。该模式构建当前代码、上传 `temp-diff` 并返回脱敏 diff、`reviewDigest`、`archivePath`、`sha256` 和选定版本，不 publish：

```bash
qdmp-cli backend deploy --review --description "<本次说明>" --json
```

只有选用该模式才有两阶段流程。结果为 `status="diff_review_required"` 时检查脱敏 diff；Go 私有 `main.go` 注入或 Node `.qdmp-runtime-config.json` 投影属于预期，秘密正文须脱敏。发现原始凭据文件、无关文件或异常删除时先处理。仅查看 diff 不构成生产发布授权。已有正式发布授权且检查通过时，使用返回的同一归档、摘要、版本和说明继续，不再询问版本：

```bash
qdmp-cli backend deploy --archive <同一ZIP> --sha256 <同一SHA256> --version <同一vX.Y.Z> --description "<同一说明>" --review-digest <本次reviewDigest> --json
```

审查继续时先校验归档字节与 manifest 的 configSha256，再重新核验远端 diff；匹配才上传同一归档字节并 publish。配置或源码改变后重新构建，选用审查时重新审查；远端 diff 改变则返回新的待审查结果，不 publish。`reviewDigest` 只绑定本次观察到的 diff 和本地制品，不提供跨机器并发隔离。不要在选用审查后跳过实际检查。

| 返回状态 | 处理 |
| --- | --- |
| `diff_review_required` | 仅可选审查模式；尚未正式发布，检查本次 diff 和授权后提交匹配的 reviewDigest。 |
| `pipeline_pending` | 已触发发布但轮询预算用尽；保留版本、归档摘要并查询已有 Pipeline，不重新 deploy/publish。 |
| `acceptance_required`、`deploymentAccepted=false` | 仅返回 Pipeline 事实；Agent 通过宿主 MCP 查询版本、Job/副本证据并验证健康状态，不能报告上线成功。 |
| configSha256 不匹配 | 本地配置已漂移，在发布前拒绝；重新构建，选用审查时重新审查，不能修改 manifest 或重试旧包。 |
| 请求失败、返回结构无法识别或写入结果未知 | 保留脱敏错误；按 `uploading` 进度事件中的目标版本查询远端版本、Pipeline 和日志，不盲目重放有副作用的命令。 |

## 上线验收与失败处理

CLI 不自动查询运行版本、Ready 副本或健康结果。Agent 按本 Skill 调用宿主 MCP 获取实际部署版本及 deploy/生产日志，并请求已实现的健康接口；证据缺失时保留未验收状态。发布完成必须同时具备以下证据：

- 本次 Pipeline 的 `build` 和 `deploy` Job 成功。
- 正式部署的两个新副本均 Ready；`1 out of 2 new replicas` 仍未完成。
- Agent 通过宿主 MCP 调用 qdmp_k8s_deployed_version，确认运行版本等于目标版本。
- 单次请求实际实现的健康和就绪接口均通过；默认 Go 模板为 `/healthz`、`/readyz`，Node 按其已核对路由验收。前者证明进程存活，后者检查已启用的 MongoDB；未配置数据库时的 200 不能证明数据库连通。业务使用数据库时另须验证真实读写。不要把 workflow 专用存储能力写成通用模板保证。

Job、Ready 数量或健康证据缺失时，报告“发布已触发 / 验收未完成”及缺少的证据，不能仅凭镜像 tag、HTTP 200 或 Pipeline 总状态宣称上线完成。MCP 不返回所需 Ready 证据时，先查实际 deploy 日志，仍缺失则如实保留未验证。

失败时读取 `qdmp_gitlab_pipeline_logs`，以及显式 `environment="production"` 的 K8s `all` / `startup` / `error` 日志。遵守云服务的停止与限速规范，禁止对 404、WAF 或权限错误持续探测。发布请求结果不明时先查版本和 Pipeline，不能盲目重放。

等待失败 Pipeline 结束，修正后用新 patch 发布并重做全部验收。保留健康旧副本，不强删旧 Pod、不强制流量进入故障副本。用户要求回滚时先展示当前与目标版本、按授权调用 `qdmp_gitlab_rollback`，同样核对 build/deploy、两个 Ready、版本及健康检查；回滚不修改历史版本内容。

只有验收全部通过，才继续全量部署的前端上传并核对其使用的服务地址为 `https://{appId}.qiandaomp.com`；默认模板从公开 AppID 推导地址，无需新增或替换常量，旧项目按实际地址配置处理。最终报告版本、Pipeline / Job、Ready 数量、运行版本和健康结果；归档摘要保留在脱敏机器记录中，无需用户核对。秘密 ZIP 用完后及时清理，保留脱敏记录供排查。
