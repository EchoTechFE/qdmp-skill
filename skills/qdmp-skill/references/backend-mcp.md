# 后端正式发布 MCP 工具契约

本清单记录 QDMP 后端发布工具的参数与调用边界。MCP/API 服务由平台实现，CLI 可调用它们并返回事实；本 Skill 维护编排、审查和验收规则，不复制 MCP Server 实现，也不依赖浏览器或 workflow 的安装。CLI 仓库的 utils/backendMcp.js 与 utils/backendDeploy.js 是发布/Pipeline 客户端，不是 MCP/API 服务实现；CLI deploy 不自动调用 Aliyun/K8s，运行版本、日志与上线证据由 Agent 依 Skill 通过宿主 MCP 收集。运行时先检查工具可用性和实际 schema；缺失时报告具体工具，不虚构成功。

## 连接与凭据

| MCP 服务 | HTTP 地址 | 作用 |
| --- | --- | --- |
| `qdmp-gitlab` | `https://openapi.qiandao.com/gitlab/mcp` | 仓库、diff、版本、正式发布及 Pipeline |
| `qdmp-aliyun` | `https://openapi.qiandao.com/aliyun/mcp` | 运行版本和生产日志 |

在实际宿主分别配置。Claude Code：

```bash
claude mcp add --transport http qdmp-gitlab https://openapi.qiandao.com/gitlab/mcp
claude mcp add --transport http qdmp-aliyun https://openapi.qiandao.com/aliyun/mcp
```

Codex 的对应入口为 `codex mcp add qdmp-gitlab --url https://openapi.qiandao.com/gitlab/mcp` 和 `codex mcp add qdmp-aliyun --url https://openapi.qiandao.com/aliyun/mcp`；Qoder 使用其 MCP 配置入口。注册前检查当前宿主已有配置，避免重复创建。无需登录浏览器来完成这些后端调用。

所有工具的公共必填参数是 `appId: string`、`appSecret: string`，取自项目根目录受保护的真实 `qdmp-config.json`，可从 root/backend 定位或显式 --config 指定。模板自带的 AppID、AppSecret 为空，填写真实凭据前不可调用上传/发布。下表仅列额外字段；`?` 表示可选。实际宿主可能将 MCP 服务名中的 `-` 规范化为 `_`，按实际提供的工具标识调用。

## 工具清单

| 工具名 | 额外参数 | 行为与约束 |
| --- | --- | --- |
| `qdmp_gitlab_repo_exists` | 无 | 检查仓库初始化状态。 |
| `qdmp_gitlab_init_repo` | `appName: string`、`runtime: string` | 写入：初始化仓库。平台契约接受 `go` / `nodejs22` / `python312`；当前 CLI 发布适配支持 `go` / `nodejs22`，按规范化 `config.runtime` 传入。Python 尚无本 CLI 适配，不能自动改为 Go。默认遇到已有仓库 runtime 不符时停止；用户已明确授权语言切换时，可用此工具更新 runtime，随后回读确认并验收新部署。 |
| `qdmp_gitlab_list_versions` | 无 | 查询已发布版本，用于版本唯一性及并发检查。 |
| `qdmp_gitlab_get_version` | `version: string` | 获取指定 `vX.Y.Z` 的真实详情。 |
| `qdmp_gitlab_diff` | `ref?: string`、`version?: string` | 可选审查：比较已上传归档与远端；默认分别为 `master`、`temp-diff`，选用时显式传入。默认直接部署不调用。 |
| `qdmp_gitlab_publish` | `version: string`、`description?: string` | 写入：推送已上传代码并触发 CI/CD。Skill 必须传具体说明；只调用一次，结果不明先查状态。 |
| `qdmp_gitlab_pipeline_status` | `version: string` | 查询并推进发布状态；成功时会自动更新日志并合并分支，具有写入副作用，不能作为纯只读查询描述。 |
| `qdmp_gitlab_pipeline_logs` | `version: string` | 查询本次构建与部署日志；核对 build、deploy 和 rollout 证据。 |
| `qdmp_gitlab_rollback` | `version: string` | 写入：重新触发目标历史版本的 CI/CD，仍须验收正式 rollout。 |
| `qdmp_k8s_deployed_version` | 无 | 通过镜像 tag 查询运行版本；不能单独证明部署成功或两个副本均 Ready。 |
| `qdmp_k8s_logs` | `environment?: "production"`、`type?: string`、`duration?: string`、`limit?: number` | 正式流程显式传 `environment="production"`；`type` 为 `all` / `startup` / `error`，`duration` 为 `5m` / `30m` / `1h` / `6h` / `24h`，默认 `30m`；条数默认及最大均为 100。 |

本清单只描述生产参数，不将工具的开发环境扩展带入小程序生产模板。runtime 枚举仅确认 MCP 接口接受该运行时，不能代替某个应用的构建和启动验收。K8s Ready 检查没有独立工具在此清单中，使用实际 deploy Job 日志证据；工具未提供的字段不能自行补造。当前也没有通用 KENV / GitLab 变量写入 MCP，不能声称 `publish` 会自动配置全部运行变量。Go / Node 的变量由打包器分别注入私有 Go 副本或生成 `.qdmp-runtime-config.json`，与 MCP 发布同字节归档配合。

## 归档上传

归档上传是独立 HTTP 端点，**不是 MCP 工具**：

```text
POST https://openapi.qiandao.com/gitlab-mcp/upload
multipart/form-data: appId, appSecret, version, file
```

默认 `qdmp-cli backend deploy --description "<说明>" --json` 内部构建当前最新代码、生成并校验归档与配置摘要，再直接上传正式 `vX.Y.Z` 并 publish。默认不使用 `temp-diff` 或 reviewDigest；需要可选 diff 审查时才加 `--review`。高级独立上传支持 `temp-diff` 或已选定的正式版本，示例如下。

同一 AppID 的正式上传和 `temp-diff` 槽位均是共享远端状态，当前 API 不提供分布式锁或远端归档 hash；全流程须单发布者串行，reviewDigest 不能保证跨机器并发隔离。成功响应须为合法 JSON 且 `message="ok"`，按实际响应检查 `size`；HTTP 失败、非 JSON 或业务失败立即停止。CLI 内部核对归档 SHA-256 和 manifest 的 configSha256；AppSecret、MongoDB 或后端 variables 变化须重新构建，仅选用审查时才重新审查。避免将秘密直接放入 shell 参数：

```bash
qdmp-cli backend upload --archive <ZIP路径> --sha256 <已验证摘要> --version temp-diff --json
qdmp-cli backend upload --archive <同一ZIP路径> --sha256 <同一摘要> --version <vX.Y.Z> --json
```

用户命令固定使用上述正式平台端点；不提供服务地址切换参数，不能从项目 .mcp.json 推导其他上传主机并发送秘密。

完整编排与验收见 [稳定后端模板与正式发布](../knowledge/backend-production.md)。
