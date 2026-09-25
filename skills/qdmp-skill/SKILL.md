---
name: qdmp-skill
description: "千岛小程序开发助手（外部版），支持前后端开发、部署、真机扫码调试和设置体验版。"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Skill,
                mcp__qdmp-monitor-bootstrap__telemetry_install_status, mcp__qdmp-monitor-bootstrap__install_telemetry,
                mcp__qdmp-gitlab__qdmp_gitlab_list_versions, mcp__qdmp-gitlab__qdmp_gitlab_get_version,
                mcp__qdmp-gitlab__qdmp_gitlab_diff, mcp__qdmp-gitlab__qdmp_gitlab_publish,
                mcp__qdmp-gitlab__qdmp_gitlab_pipeline_status, mcp__qdmp-gitlab__qdmp_gitlab_pipeline_logs,
                mcp__qdmp-gitlab__qdmp_gitlab_rollback, mcp__qdmp-gitlab__qdmp_gitlab_init_repo,
                mcp__qdmp-gitlab__qdmp_gitlab_repo_exists, mcp__qdmp-aliyun__qdmp_k8s_deployed_version,
                mcp__qdmp-aliyun__qdmp_k8s_logs,
                mcp__agent-runtime-telemetry__grant_consent, mcp__agent-runtime-telemetry__consent_status,
                mcp__agent-runtime-telemetry__register_project, mcp__agent-runtime-telemetry__revoke_consent,
                mcp__agent-runtime-telemetry__record_checkpoint, mcp__agent-runtime-telemetry__record_artifacts,
                mcp__agent-runtime-telemetry__record_skill_event, mcp__agent-runtime-telemetry__telemetry_status]
---

# 千岛小程序开发助手（外部版）

帮助开发者快速创建、开发、调试和部署千岛小程序。

## 知识库

| 文档                                                       | 内容                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [development-guide.md](./knowledge/development-guide.md)   | 开发指南：项目结构、全局权限配置、屏幕方向、截图黑屏、服务端 API、调试发布                  |
| [bridge-api-guide.md](./knowledge/bridge-api-guide.md)     | Bridge API：原生能力调用、蓝牙、音频、文件下载、陀螺仪、发帖预填参数、IM 消息订阅、导航栏返回首页按钮、参数与返回值类型 |
| [bluetooth.md](./knowledge/bluetooth.md)                  | BLE 中心设备：发现、连接、GATT 读写与通知、MTU、断线清理与重连、Android 配对 |
| [inner-audio.md](./knowledge/inner-audio.md)              | 普通音频：创建、播放、暂停、停止、销毁、实例生命周期与真实调用结果记录 |
| [api-guide.md](./knowledge/api-guide.md)                   | 服务端 API：场景化接口文档、OSS 上传流程、帖子评论与回复（rcomment）、OpenAPI 错误码与原因（10001–10021） |
| [backend-operations.md](./knowledge/backend-operations.md) | 后端操作详情：通用子流程 + 操作 1-7 的完整步骤                                            |
| [project-workflows.md](./knowledge/project-workflows.md)   | 项目工作流程：创建项目、开发调试、打包部署                                                |
| [prd-template.md](./knowledge/prd-template.md)             | PRD 模版：好的 PRD 应包含哪些内容 + 可直接使用的模版                                      |
| [skill-data-consent.md](./references/skill-data-consent.md) | Skill 运行数据采集授权文案、项目范围和用户控制入口                                      |

---

## Skill 运行数据采集授权入口

涉及当前项目的开发、调试、部署、运维或 Skill 生命周期记录时，先调用 `telemetry_install_status` 检查当前项目、当前宿主的监控插件安装状态。Bootstrap 会从 Codex、Claude Code 或 Qoder 的插件环境自动识别宿主；只有调用方明确知道宿主时才传 `host`，不得猜测。未安装时读取 [项目级监控插件安装提示](./references/skill-data-consent.md)，只询问是否下载安装监控插件。只有用户明确回复“同意安装监控插件”后，才调用 `install_telemetry`，参数 `accepted` 必须为 `true`；拒绝、取消、无回复时继续提供 qdmp-skill 的正常能力，不安装任何监控组件。

qdmp-skill 的安装授权不等于数据采集授权。安装成功后停止当前监控激活流程，根据返回的 `restart_host` 提示用户完全重启对应宿主并在当前项目中新建任务。若 `activation` 为 `tracked_domain_work_after_restart`，新任务中调用 `/agent-runtime-telemetry:tracked-domain-work`；若为 `qdmp_telemetry_tools_after_restart`（Qoder 桌面版无插件 CLI 的回退模式），新任务中再次调用 qdmp-skill，读取安装回执 `local_source` 下的 `docs/legal/skill-data-consent.md` 并完整展示授权说明。两种模式都必须等待用户明确回复“同意采集”或“不同意”。只有取得“同意采集”后，才能调用 telemetry MCP 的 `grant_consent` 和 `register_project`；`register_project` 成功后 Collector 才能启动采集和上报。

授权只适用于系统识别出的当前项目。项目根目录按 QDMP 项目根目录、Git 仓库根目录或用户启用采集时注册的文件夹确定，子目录沿用该项目授权，其他项目必须重新询问。当前项目的授权控制入口为：

- “同意安装监控插件”：仅调用 qdmp bootstrap 的 `install_telemetry`，不授予数据采集权限。
- telemetry 安装后的“同意采集”：优先由 `/agent-runtime-telemetry:tracked-domain-work` 展示 telemetry 包内的法律文案；Qoder 桌面回退模式由 qdmp-skill 从安装回执的 `local_source` 读取同一份文案。随后调用遥测 MCP 的 `grant_consent`，成功后调用 `register_project`。
- “关闭数据采集”：调用 `revoke_consent`，撤回事件成功上报前保持撤回流程，之后停止当前项目的采集。
- “开启数据采集”：展示完整说明并再次取得“同意采集”，不得把历史同意状态当作新的明确授权。
- “查看数据采集状态”：调用 `consent_status`，只返回当前项目状态。
- “删除已收集的数据”：记录用户申请并转人工处理，不向用户承诺已删除，联系 `openqiandao@echo.tech`。

即使用户要求 Agent 访问项目外内容，仍须遵守当前项目采集边界；工具调用参数和结果可能进入当前项目运行记录，文案中的敏感信息提示必须一并展示。

## 规范依赖

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

**登录优先路由**：用户要求登录、查询当前账号，或命令提示需要登录时，先读 [Agent 对话登录](./knowledge/agent-login.md)。查询当前账号应先执行 `qdmp getMe --env <env>`，只有明确需要登录时才发起登录，不把网络或应用配置错误当成未登录。此类任务不需要项目选择、创建项目或 PRD 检查；收到登录入口后先在对话展示，不要等待用户登录完成才回复。

### 第零步：环境依赖检查

在执行任何操作前，必须先确认开发环境就绪：

```bash
# 检查 qdmp-cli 是否可用
qdmp-cli --version 2>/dev/null
```

- **命令成功**（输出版本号） → 开发、创建或前端构建/上传前，运行 `node <实际 Skill 目录>/scripts/check-cli.mjs`，要求 CLI ≥0.1.29。旧版本按 [升级说明](./references/upgrade.md) 更新并复检，不仅凭命令存在放行。纯后端操作、账号查询和登录不受该前端版本门槛限制。
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

同时检查 pnpm 是否可用（创建和开发项目需要）：
```bash
pnpm --version 2>/dev/null
```
- 不可用则执行 `npm install -g pnpm`，安装失败同样停止并报告。

### 第一步：项目选择

扫描 `/workspace` 下的小程序项目（同时识别新结构 `qdmp-config.json` 与旧结构 `qdmp.json`，确保开发到一半的旧项目也能被发现并触发迁移）：
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

执行项目操作前检查前端 loader、依赖和源码引用；仅允许 EMP。搜索 effuse / echo-effuse / effues（含 npm 别名、锁文件、导入与构建脚本），发现有效引用则停止并说明需迁移到官方 2.0 模板。不要删除字符串或改 loader 冒充迁移。配置文件布局调整不等于运行时升级。

详细步骤见 [backend-operations.md](./knowledge/backend-operations.md) 的「通用子流程: 读取项目配置」。

关键变量：
- `projectRoot`：小程序根目录
- `sourceDir`：`{projectRoot}/backend/`
- `mongoUri` / `mongoDatabase`：来自 `qdmp-config.json` 的 `mongodb` 字段（可选，仅后端使用）

### 第三步：PRD 检查（仅开发意图时执行）

开发前必须先执行 [依赖栈兜底检查（不通过必须停止）](./knowledge/project-workflows.md#依赖栈兜底检查不通过必须停止)，新建和已有项目均适用。结合 loader、模板来源和实际构建链判断工程类型；通用依赖或 package.json.version 不能单独作为 1.0 判据。绑定和上传前核对本地与平台 loader 一致，新建 2.0 项目必须为 EMP。

**判断用户意图**：若当前请求属于以下开发类意图，执行 PRD 检查；否则跳过直接进入操作路由。

开发类意图（需检查 PRD）：
- 新建功能、开发某个页面/接口、实现需求
- 触发流程二（PRD 设计）、流程三（开发调试）
- 数据建模（操作 7）

运维类意图（跳过 PRD 检查）：
- 查日志、查版本、回滚、查状态、部署/发版

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

用户明确要求“真机调试 / 手机扫码运行”或“上传体验版 / 设置体验版”时，先运行 `node <实际 Skill 目录>/scripts/check-cli.mjs 0.1.32`，再读取 [真机调试与体验版](./knowledge/development-guide.md#真机调试)。这两类请求是前端操作，不自动部署后端。普通上传仍保持原有行为。

根据用户意图匹配操作，详细步骤见 [backend-operations.md](./knowledge/backend-operations.md)：

| 关键词                                                                 | 操作                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| 真机调试、手机扫码运行、真机日志                                      | `qdmp debug`，见 development-guide.md 的真机调试 |
| 上传体验版、设置体验版、给体验人员扫码                                | 构建后 `qdmp upload --experience`，见 development-guide.md 的设置体验版 |
| 部署、打包部署、上线、发布（无前端/后端限定）                          | 流程四：打包部署（全量，见 project-workflows.md）   |
| 部署后端、发版后端、后端上线、只部署后端、部署新版本、release          | 操作 1: publish（仅后端）                           |
| 部署前端、上传前端、前端上线、只部署前端                               | 流程四：打包部署（仅前端，见 project-workflows.md） |
| 查看版本、版本列表、版本历史、发布记录                                 | 操作 2: versions                                    |
| 回滚、回退、恢复到某版本、rollback                                     | 操作 3: rollback                                    |
| 查看日志、服务日志、启动失败、报错、logs、排查问题                     | 操作 4: logs                                        |
| 部署状态、当前版本、线上版本、运行状态、status                         | 操作 5: status                                      |
| 部署后端测试环境、本地跑后端、调试后端、跑一下后端、test-deploy        | 操作 6: test-deploy（仅后端）                       |
| 部署测试环境、本地测试、本地运行、本地调试、启动开发环境               | 流程三：开发调试（全量，见 project-workflows.md）   |
| 数据建模、设计数据、我要存什么数据、数据库设计、定义数据结构、管理数据 | 操作 7: schema                                      |

意图不明确时，使用 AskUserQuestion 让用户选择。

工作流程（创建项目、开发调试、打包部署）见 [project-workflows.md](./knowledge/project-workflows.md)。

---

## 操作触发规则

**所有操作只能由用户明确、主动发出指令时才触发，严禁自动触发：**
- 用户只是在修改代码，没有说"发版"、"部署"等关键词 → 不触发
- AI 完成代码编写、bug 修复后 → **绝对禁止**自动衔接发版、部署、调试部署
- 用户说"帮我改一下然后部署" → 代码改完后**停下来汇报**，等用户再次明确发出部署指令

**判断标准**：用户当前这条消息的核心意图必须是执行上述操作之一。即使同一句话中同时提到代码修改和部署，也必须分步执行：先改代码，停下来汇报，等确认后再部署。

---

## MongoDB 访问边界

**强制约束**：MongoDB 只能由后端服务（`backend/`）访问。

- `frontend/` **严禁**直接连接 MongoDB，所有数据操作必须通过后端 API 接口
- 生成前端代码时，不得引入任何 MongoDB 客户端库或连接逻辑
- 操作 7 生成的 model 代码只写入 `backend/models/`，不涉及 `frontend/`

---

## 代码编写规则

开发类代码生成或 Review 必须先按「规范依赖」调用对应 skill。产品底线、设计系统和 Taro 视觉落地规则不在本节重复维护，避免规范漂移。

涉及帖子评论、回复、评论列表或评论点赞（rcomment）时，必须读取 [api-guide.md](./knowledge/api-guide.md) 的「Lifestyle：评论与回复（Comment / RComment）」；严格区分一级评论列表的 `offset` 分页与回复列表的 `cursor` 分页，并将帖子、评论和回复 ID 保持为 int64 字符串。

涉及千岛 OpenAPI 报错排查或错误处理时，读取 [api-guide.md 的「错误与排查」](./knowledge/api-guide.md#13-错误与排查)，根据业务 `code`、`message` 和 HTTP 状态定位原因；区分应用权限、用户授权、Token 无效或过期、限流与配额耗尽。

涉及 OSS 文件上传时，读取 [api-guide.md 的「OSS 图片上传流程」](./knowledge/api-guide.md#oss-图片上传流程)；区分平台 `quota/prepare` OpenAPI 与应用自建 relay，不要将 multipart 直接发送到 OSS 签名 URL。

### 前端（`frontend/`）

修改前端代码前，必须先读取 `frontend/README.md`（如果存在），确保代码风格、目录结构、命名约定与项目现有规范一致。

涉及以下能力时，必须读取对应指南后再实现：

- 系统级权限声明：读取 [development-guide.md](./knowledge/development-guide.md) 的「小程序全局权限配置」，修改 `frontend/src/app.config.js`，不要把声明误写成运行时 Bridge 调用。
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

修改后端代码前，若项目根目录存在 `qdmp-schema.json`，必须先读取它，确保代码直接引用已定义的数据模型，不重复定义字段。新增数据存储需求时，先更新 `qdmp-schema.json`，再生成对应 model 代码。

后端调用千岛 OpenAPI 时，可以使用官方 [qdmp-server-sdk](https://github.com/EchoTechFE/qdmp-server-sdk) 简化认证授权、Token 生命周期管理和类型安全的业务接口调用，安装及用法见仓库 README。

---

## 命令速查

Agent 对话中需要登录或用户要求登录时，先读 [Agent 对话登录](./knowledge/agent-login.md)，使用 `qdmp login --agent --env <prod|dev>`，立即将真实登录链接和 PNG 图片展示给用户，并保持命令等待登录结果。此入口不需要扫描/创建小程序项目或检查 PRD。

| 命令                              | 说明                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `qdmp-cli list`                   | 查看可用模板                                                                  |
| `qdmp-cli create <项目名> -t default` | 创建 2.0 项目；创建后必须通过模板自检和依赖栈检查                              |
| `qdmp-cli init -a <id>`           | 关联小程序                                                                    |
| `pnpm install`                    | 安装依赖                                                                      |
| `pnpm run dev`                    | 开发模式                                                                      |
| `pnpm run build`                  | 打包构建（本地调试）                                                          |
| `qdmp build`                      | 打包构建（发布上传前必须使用）                                                |
| `qdmp getMe`                      | 在项目目录检查 CLI 登录态；失效时自动提供扫码、登录 URL、账号密码三种方式 |
| `qdmp login`                      | 主动打开三选一登录流程；扫码或 URL 登录成功后自动轮询并保存 Token |
| `qdmp login --agent --env prod`   | Agent 登录：输出链接与 PNG 路径的 JSON 事件，等待浏览器回调或 App 扫码成功 |
| `qdmp-cli upload -d "<版本描述>"` | 上传部署；skill 自动总结当前版本变化并传入描述                                |
| `qdmp upload --experience -d "<版本描述>"` | CLI ≥0.1.32；上传后自动设置本次版本为体验版并输出二维码，无需手填版本号 |
| `qdmp debug` | CLI ≥0.1.32；构建后启动 EMP 真机扫码调试，持续输出日志 |
| `qdmp debug --no-build --json` | 使用已有 EMP 产物，输出二维码和设备日志的 NDJSON 事件 |

创建命令禁止省略 `-t`（CLI ≤0.1.11、0.1.13、0.1.15 的默认模板就是 1.0）；禁止使用 `-t qdmp`（指向 `frontend/miniapp-taro-template`，即 effuse 版 1.0）。创建后必须读取 `qdmp.json` 确认 `loader` 为 `EMP`，并确认模板信息没有「默认模版(1.0)」或 `miniapp-taro-template`；不通过就停止并报告，禁止手改配置硬转。完整步骤见 [创建项目](./knowledge/project-workflows.md#流程一创建项目)。

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

待申请的多个 key 按稳定顺序编码为可逆的 `requiredApis` 短字符参数，并使用 `qdmp-cli openapi apply-url --env <env> --json` 生成申请链接。解码后 key 的数量、值和对应关系必须完全一致，参数需进行 URL 编码。

权限页检测到合法 `requiredApis` 后，解析唯一 key，加载对应清单，默认勾选用户尚未拥有且需要申请的接口并主动打开申请能力弹框。没有 `requiredApis` 时保持原有页面行为，不触发额外的全量 OpenAPI/ability 分页请求。

查找全部 OpenAPI 复用前端现有全量接口，不新增 BFF 接口。Redis 仅作为可选缓存，连接失败不得阻断 BFF 启动；实体及 Redis 读写逻辑放在 `model/redis`，service 层只做业务编排。
