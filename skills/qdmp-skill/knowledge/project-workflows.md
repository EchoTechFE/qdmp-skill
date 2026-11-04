# 项目工作流程

## 流程一：创建项目

### Step 1: 在后台创建小程序

访问 [千岛开放平台](https://open.qiandao.com) 创建小程序，获取 appId。凭据写入本地受保护配置，不要求在聊天中粘贴 AppSecret。

### Step 2: 使用 CLI 创建稳定前后端模板

先读取 [稳定后端模板与正式发布](./backend-production.md)，检查实际 CLI 支持本次后端命令。执行 create 前核对 `qdmp create --help` 的完整全栈模板能力及 `qdmp backend --help` 的 init/package/upload/deploy 命令；旧 CLI 须升级到包含这些能力的已发布版本，当前研发验收使用本地打包 CLI，不能假定 npm latest 已支持或仅凭版本号放行。新项目使用：

```bash
qdmp-cli list
qdmp create <项目名> -t default
cd <项目名>
```

也可省略 -t，沿用 `qdmp create <项目名>`。CLI 只从 `git@github.com:EchoTechFE/qdmp-taro-template.git` 克隆一次完整全栈模板，校验并保留自带空主配置的内容，只设置 0600 权限与忽略规则；克隆流程移除模板 .git，主配置在生成项目中未被跟踪。默认包含 frontend/、backend/ 和 qdmp-config.json，不新增后端选择参数、不移动目录或拼装第二份模板。历史纯前端保持兼容；确需升级时再执行 `qdmp backend init --runtime go --json`，从同一仓库临时提取后端，源码位置和已有配置保持。

稳定后端模板目前只支持 Go。不要为了语言选项让 Agent 手写 Node.js / Python 模板；已有其他语言项目按自身经过验证的生产工程维护，不能声称使用本稳定模板。

当前默认模板统一为该全栈仓库，`-t default` 可显式指定，省略时沿用默认。旧 CLI 或旧模板仍只有前端布局时应停止并报告不兼容，不能临时拼接后端、改变 loader 或改用旧 effuse 模板。模板变更须先合并到上游默认分支，再发布相应 CLI；研发分支改动不代表上游主分支已生效。

#### 创建后自检（不通过必须停止）

创建完成后、安装依赖或修改项目文件前，必须：

1. 新创建读取 `frontend/qdmp.json`，确认 loader 为 EMP；历史根式前端维护时读取实际目录的 qdmp.json。
2. 核对 `qdmp-cli list` 和创建输出中的模板信息，确认没有「默认模版(1.0)」或 `miniapp-taro-template`。
3. 新创建必须同时阅读 `backend/README.md` 与 `backend/backend-template.json` 的 runtime、环境、入口和构建契约，确认存在 `main.go`、`go.mod` 及 `/healthz`、`/readyz`。后端不带开发存储模式、Collector 或浏览器依赖。

本次需要的入口文件、运行契约或 loader 无法确认时立即停止；禁止手改 loader 或契约标记伪装迁移。历史纯前端维护按实际范围检查，不自动补建后端。

#### 依赖栈兜底检查（不通过必须停止）

在实际前端目录执行；分离结构为 `frontend/`：

```bash
rg -n '"(echo-effuse|flyio|tailwindcss)"' package.json
```

结合 loader、模板来源和实际构建链判断工程类型，通用依赖或 package.json.version 不能单独作为 1.0 判据。发现 effuse / echo-effuse / effues 有效引用（含别名、锁文件、导入和构建脚本）立即停止，不能在 EMP 工程混用旧运行时。退出码 1 表示无命中；文件缺失或执行错误不能视为通过。

检查通过后，在前端目录执行 `pnpm install`，按后端 README 安装 Go 依赖。依赖失败先修复，不退回旧模板。

### Step 3: 填写受保护配置

以下后端配置仅适用于本次包含后端的项目；纯前端不要求新建主配置或提供 AppSecret、Go。已有主配置时，前端命令只取其公开字段；没有时沿用实际 qdmp.json。

官方模板直接跟踪空 qdmp-config.json，AppID、AppSecret、MongoDB 字段为空，variables 为 {}；直接 git clone 也无需 config init，模板中禁止提交实际凭据。旧项目升级/配置初始化仅在主配置缺失时本地生成（0600、gitignore），一次性从实际根式或 frontend/ 的 qdmp.json 继承 appId/devAppId/loader/name/latest 并保全支持的旧私密字段；已有主配置逐字保留，不做长期反向同步。旧版已有 backend/ 但缺少主配置时可用 `qdmp config init --json` 补齐。主配置兼容顶层 appId/appSecret/runtime/mongodb，并包含 environment、后端专用 variables。实际 AppID、发布 AppSecret 由用户本地填写，空值不得发布；完整契约见 [初始化与配置](./backend-production.md#初始化与配置)。

MongoDB 省略、null 或 uri/database 同时为空时无持久化；部分填写错误，启用后 database 必须等于 AppID。variables 是后端 JSON 对象，不自动变环境变量、不进前端，修改后必须重新打包。不能用 FileStore 冒充生产持久化。配置文件、秘密 ZIP 和发布目录必须被 `.gitignore` 忽略，不能作为源码内容再次入包；已验证的发布 ZIP 仅用于受控后端上传。

主配置存在时，CLI 日常命令直接优先读取其中的公开字段；旧前端 AppID 不同不要求先 sync。build 内部更新实际前端的公开 qdmp.json，打包不复制秘密；主配置坏或所选环境身份缺失不能回退。编译产物身份不属于当前主配置对应环境的有效身份映射时，需重新 build，不能只改 ZIP 身份。`qdmp config sync` 是可选工具，详见 [配置优先级](./backend-production.md#配置优先级与前端兼容)。

### Step 4: 验证后端模板

纯前端跳过本步骤。后端代码统一由同一个全栈模板仓库提供，CLI 负责拉取、校验及主配置保护，不从本指引复制拼接模板。按 [构建并冻结发布包](./backend-production.md#构建并冻结发布包) 执行 `go test ./...` 和 `qdmp backend package --json`，确认平台单入口构建通过、源嵌入配置仍为空；打包产物含配置，按秘密制品保护。

认证路由的前端请求体只接受 `{ code }`。默认 Go 模板由后端从根 `qdmp-config.json` 的受保护配置读取 `appId`、`appSecret`，正式发布由 CLI 注入私有构建副本，固定使用 `AUTHORIZATION_CODE` 请求平台 `/auth/v1/token`；不接收客户端指定的应用凭证或授权类型，不将密钥放入前端环境变量、产物或响应。登录成功须核对 HTTP、业务码及完整会话字段，用户 `openId` 只取换票成功响应的 `data.openId`，禁止从 `user.me`（`GET /user/v1/me`）或手机号响应读取、映射或补齐。缺少有效身份时按响应不完整处理，不调用其他接口兜底，也不自动重放授权码；刷新保留换票身份，退出或切号时清理旧会话。完整规则见 [用户登录换票与 openId](./development-guide.md#用户登录换票与-openid)。

本步骤仅本地初始化和构建，不上传、不创建远端仓库、不触发正式发版。用户要求正式发布时再走后端发布流程。

---

## 流程二：PRD 设计（开发前必做）

在进入开发调试之前，必须先完成 PRD 设计。如果用户跳过直接要求开发，需引导其先完成 PRD。

### Step 1: 判断是否已有 PRD

用 Read 工具尝试读取 `{projectRoot}/doc/prd.md`：

- 读取成功 → 跳到 Step 3
- 文件不存在 → 执行 Step 2

### Step 2: 引导用户描述需求

AskUserQuestion 询问产品方向：

```yaml
questions:
  - question: "在开始开发之前，我们先把需求梳理清楚。你的小程序主要解决什么问题？目标用户是谁？"
    header: "产品定位"
    multiSelect: false
    options:
      - label: "我来描述需求"
        description: "用自然语言描述你的想法，我来帮你整理成 PRD"
      - label: "我已有 PRD 草稿"
        description: "把你的草稿内容告诉我，我来补全和规范化"
      - label: "从现有代码生成 PRD"
        description: "扫描已有前后端代码，自动反向生成 doc/prd.md"
      - label: "跳过，直接开发"
        description: "不推荐，可能导致开发方向偏差，后期返工"
```

用户选择"跳过，直接开发"时，提示：
```
建议先完成 PRD 设计，这样可以：
- 避免开发到一半发现方向错了
- 让数据模型设计更合理
- 减少后期返工

如果你已经想清楚了，可以简单描述核心功能，我来快速生成一份 PRD。
```

然后 AskUserQuestion 确认：

```yaml
questions:
  - question: "要继续跳过 PRD 设计吗？"
    header: "确认跳过"
    multiSelect: false
    options:
      - label: "简单描述一下，快速生成 PRD"
        description: "告诉我核心功能，我来帮你整理成 PRD，不会花太多时间"
      - label: "确认跳过，直接开发"
        description: "跳过 PRD，发布前仍会通过代码反向生成 PRD"
```

- 选择"简单描述" → 用户描述后继续 Step 3 生成 PRD
- 选择"确认跳过" → 直接进入操作路由

用户选择"从现有代码生成 PRD"时，执行代码反向扫描：
1. 按已确定的项目形态和本次范围扫描；包含后端时，从实际入口与其引用代码提取 HTTP 路由及处理逻辑，Go 模板从 `backend/main.go` 开始；纯前端跳过后端扫描
2. 包含后端时，读取实际存在的数据模型或仓储代码，提取数据字段与集合名，不要求存在 `backend/routes/` 或 `backend/models/`
3. 包含前端时，读取实际 `frontendDir/src/pages/` 下的页面文件，提取页面功能与 API 调用；根式项目的 frontendDir 为项目根目录
4. 包含前端时，读取 `frontendDir/src/app.config.js`，提取路由结构
5. 基于扫描结果，AskUserQuestion 补充无法从代码推断的信息：

```yaml
questions:
  - question: "这个小程序主要解决什么问题？目标用户是谁？（已从代码中识别到以下角色：{从代码推断的角色列表}，请确认或补充）"
    header: "产品定位"
    multiSelect: false
    options:
      - label: "符合，继续生成"
        description: "使用代码推断的角色定义"
      - label: "我来补充说明"
        description: "补充背景、目标用户或业务场景描述"
```

6. 结合用户确认/补充的信息 + 代码扫描结果，参考 `prd-template.md` 生成 `doc/prd.md`：
   - 背景与目标：使用用户提供/确认的描述（不纯推断）
   - 用户角色：使用用户确认后的角色定义
   - 核心功能模块：每个路由组对应一个模块，含接口说明、数据流、状态流转
   - 数据关系：从 model 字段中的外键/引用关系推断
7. 写入 `doc/prd.md` 后展示核心模块摘要，进入 Step 3 确认

### Step 3: 确认或生成 PRD

**已有 PRD（来自 Step 1）**：读取 `doc/prd.md`，展示核心功能模块摘要，AskUserQuestion 确认：

```yaml
questions:
  - question: "已找到 PRD，核心功能是否仍符合当前开发目标？"
    header: "PRD 确认"
    multiSelect: false
    options:
      - label: "符合，继续开发"
        description: "直接进入开发流程"
      - label: "需要更新 PRD"
        description: "告诉我哪里需要修改，我来更新 doc/prd.md"
```

**无 PRD（来自 Step 2）**：根据用户描述，参考 `prd-template.md` 中的模板，生成 `doc/prd.md`：

```bash
mkdir -p doc
```

PRD 内容要求：
- **背景与目标**：明确为什么做、解决什么问题
- **用户角色**：列出所有角色及其典型场景
- **核心功能模块**：每个模块包含操作流程、异常情况、涉及数据、验收标准
- **数据关系**：实体间的关联关系

生成后展示 PRD 摘要，并 AskUserQuestion 确认：

```yaml
questions:
  - question: "PRD 已生成，请确认核心功能是否符合你的预期？"
    header: "PRD 确认"
    multiSelect: false
    options:
      - label: "符合，继续开发"
        description: "进入开发调试流程"
      - label: "需要调整"
        description: "告诉我哪里需要修改"
```

### Step 4: PRD 驱动开发

PRD 确认后，后续所有开发工作都应基于 PRD：
- 后端 API 设计参考 PRD 中的"用户操作流程"
- 前端页面开发参考 PRD 中的"核心功能模块"
- 验收时对照 PRD 中的"验收标准"逐项检查

### Step 5: 数据建模（可选）

PRD 确认后，如果小程序需要存储数据，AskUserQuestion 询问：

```yaml
questions:
  - question: "你的小程序需要存储数据吗？（比如用户信息、商品、订单等）"
    header: "数据存储"
    multiSelect: false
    options:
      - label: "需要，帮我设计"
        description: "基于 PRD 自动抽取数据对象，生成数据模型"
      - label: "暂时不需要"
        description: "跳过，后续可随时通过「数据建模」触发"
```

用户选择"需要，帮我设计" → 执行操作 7: schema（数据建模），操作 7 会自动读取 `doc/prd.md` 作为建模输入。

---

## 流程三：开发调试

**真机扫码与体验版分流**：明确要求真机扫码、查看真机日志或设置体验版时，分别执行 [真机调试](./development-guide.md#真机调试) 或 [设置体验版](./development-guide.md#设置体验版)，要求 CLI ≥0.1.32；这类前端操作不触发下面的全量后端部署，也不自动把业务 API 改成 `/api`。手机端业务请求应使用实际可访问的服务地址。

**前置检查：依赖栈**

先执行流程一中的「依赖栈兜底检查（不通过必须停止）」，通过后才继续开发调试；已有项目同样适用。

**前置检查：PRD**

检查 `{projectRoot}/doc/prd.md` 是否存在：
- 存在 → 继续
- 不存在 → 提示用户建议先完成流程二（PRD 设计），用户坚持跳过则继续

**调试部署顺序规则（强制执行）**：

- 未明确指定范围时先按 [项目形态与范围规则](#step-1-判断项目形态与部署范围) 识别：纯前端仅前端、全栈先后端再前端、纯后端仅后端；不自动补建后端
- 明确说"后端" → 仅执行后端测试环境部署
- 明确说"前端" → 仅执行前端测试环境部署

### Step 1: 判断调试部署范围

| 用户意图关键词 | 部署范围 | 执行流程 |
|---|---|---|
| 部署测试环境、本地测试、本地运行、本地调试、启动开发环境（无前后端限定） | 按实际形态 | 仅全栈先后端再前端 |
| 部署后端测试环境、本地跑后端、调试后端、跑一下后端、test-deploy | 仅后端 | 仅后端 |
| 部署前端测试环境、启动前端、调试前端、跑一下前端、启动开发服务器 | 仅前端 | 仅前端 |

无法判断时 AskUserQuestion 询问。

### Step 2: 部署后端服务测试环境

执行操作 6: test-deploy。

全量模式下：后端健康检查通过才继续前端；失败则停止：
```
后端测试环境部署失败，已停止部署流程。请先修复后端问题后重新部署。
```

操作 6 只启动并验证本地后端，不自动改写前端地址。默认模板的 `getBackendBase()` 从公开 AppID 推导正式域名，登录示例仍需已部署的正式后端；已有项目仅在具备受控本地代理且本次明确需要时使用其既有配置，不能把启动本地后端等同于前端已接入本地 API。

### Step 3: 部署前端服务测试环境

**仅本次范围包含前端时执行**：纯前端直接进入；全栈先通过后端验收；纯后端跳过本节。

#### 前置检查（仅"仅前端"模式执行）

按实际 `frontendDir` 检查源码使用的后端地址配置；仅对已有 `BACKEND_BASE` 执行搜索：
```bash
rg -n "BACKEND_BASE" <frontendDir> -g '*.js' -g '*.ts' -g '*.vue'
```

- 默认模板使用 `getBackendBase()` 时，核对公开 AppID 与实际正式服务，不添加不存在的 `BACKEND_BASE`。
- 已有本地地址（`/api` 或 `localhost`）时，核对既有代理和目标可达性；不自动将正式地址切到 `/api`。

#### 部署步骤

直接运行原生 Taro 命令前，主配置存在时先在项目根目录执行 `qdmp config sync --json` 导出公开字段，再进入实际 `frontendDir`；没有主配置的旧纯前端沿用原配置。

检查前端 dev server 是否已在监听 10086：
```bash
ss -tlnp | grep ':10086'
```

- 已监听 → 跳过（watch 模式自动 reload）
- 未监听 → **必须使用 `run_in_background: true` 后台启动**，不得以"长期运行进程"为由拒绝执行：
  ```bash
  BROWSER=none pnpm run dev
  ```
  启动后轮询等待最多 30 秒：
  ```bash
  for i in $(seq 1 15); do ss -tlnp | grep ':10086' && break; sleep 2; done
  ```

#### nginx 配置与启动

```bash
rm -f /etc/nginx/sites-enabled/default
```

写入 `/etc/nginx/conf.d/qdmp-dev.conf`：
```nginx
server {
    listen 80;
    location /api/ {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location / {
        proxy_pass http://localhost:10086/;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
pgrep nginx > /dev/null 2>&1 && nginx -s reload || nginx
```

展示结果（**强制约束：必须以此完整模板输出，不得用摘要或状态列表代替；若流程中途发生任何修复/重启，完成后必须重新输出此完整模板**）：
```
本地测试环境已就绪

  前端 dev server: http://localhost:10086
  后端 API:        http://localhost:8080
  nginx 统一入口:  http://localhost:80
    /      → 前端 dev server
    /api/  → 后端 API

宿主机访问（需 docker 已映射端口 -p 8888:80）:
  http://localhost:8888
```

用户要求真机调试时，按 [真机调试指南](./development-guide.md#真机调试) 执行 `qdmp debug`；已有本次改动的 EMP 编译产物可用 `qdmp debug --no-build`。收到二维码后使用千岛 App 扫码，保持 CLI 进程运行。

---

## 流程四：打包部署

发布范围、顺序、审查和验收由本 Skill 规定，Agent 负责执行；CLI 只执行本次调用并返回事实。没有后端实现的纯前端项目，不得因用户说“部署”而自动生成、初始化或发布后端。

### Step 1: 判断项目形态与部署范围

先读取用户指定目录或当前项目的实际代码/入口，识别项目形态，再结合本次指令决定范围。配置、依赖和构建完整性决定该部分能否发布，不用于把已有后端代码的工程降级为纯前端：

| 实际形态 | 判定依据 | 未指定前后端范围时 |
| --- | --- | --- |
| 纯前端 | 根目录 `qdmp.json` + `package.json`，或 `frontend/` 中有这两文件，且没有实际后端实现（空 backend 目录不算） | 仅执行前端步骤，跳过后端配置、AppSecret、Go、打包和 MCP。 |
| 全栈 | 有前端工程，也有可识别的后端业务入口/源码；发布时再验证依赖、runtime 配置与构建 | 先执行后端发布和 Skill 验收，再执行前端步骤。 |
| 纯后端 | 有可识别的后端业务入口/源码，且无前端工程 | 只执行后端步骤，跳过前端 loader、构建、登录和 PRD 检查。 |

`backend/` 空目录不算后端实现；已有前后端源码但后端配置缺失时，标记“全栈，后端待配置”，默认发布须报告具体缺口，不能跳过后端声称成功。Go 后端发布前应有 `backend/main.go`、`go.mod` 及 `qdmp-config.json` 中匹配的 `runtime="go"`，新稳定模板还需核对 `backend-template.json` 的生产运行契约，并在打包时验证 `go build main.go`。已有 Node.js / Python 后端按其真实入口、依赖、runtime 与受控构建流程识别，不套用 Go 门禁。仅有零散文件或过期模板标记不能证明存在可发布后端；已识别的后端因配置/依赖/编译失败应标记待完善，而非改判纯前端。

明确说“仅前端”时，不运行 Go 或后端构建来证明另一侧有效；明确说“仅后端”时，不检查前端 loader。用户明确要求全栈/后端但对应代码或配置不完整时报告具体缺口，不自动补建后端，也不静默降为前端成功。文件或用户意图仍不足以判定范围时才询问。

| 本次指令 | Agent 执行范围 |
| --- | --- |
| 部署/发布/上线，未指定范围 | 按上表的实际形态决定。 |
| 全栈/前后端一起发布 | 核对两侧工程完整后，后端发布及验收 → 前端上传；正式前端上线再完成提审/发布。 |
| 仅后端/后端上线 | 只运行后端工具；`qdmp backend deploy` 不发布前端。 |
| 仅前端/上传前端 | 只运行前端工具；不要求 AppSecret、Go、MongoDB 或后端初始化。 |

实际前端目录记为 `frontendDir`：根式工程为项目根目录，分离结构为 `{projectRoot}/frontend`。后续读取配置、构建和上传均在该目录执行，不能假定所有项目都有 `frontend/`。

全栈工具调用由 Agent 串联：后端 `go test` → `qdmp backend package` → `qdmp backend deploy` 获取 diff → Agent 审查后追加 `--review-digest` → 由 Agent 通过宿主 MCP 获取日志/实际部署版本及副本证据，并验证真实健康结果 → 前端 `qdmp build` / 按需 `qdmp getMe` 或登录 → `qdmp upload`。正式前端上线再按实际版本执行 `experience` / `review --auto-publish` 并等待平台结果。已有 Node.js / Python 后端使用该工程受控后端流程替换 Go 部分。CLI 的每条后端命令只处理后端，不会替 Agent 完成这条全栈链路。

### Step 2: PRD 与代码一致性检查

纯后端运维发布跳过本节。涉及前端或全栈时，仅对本次范围做 PRD 一致性检查：纯前端只扫描 `frontendDir`，不因缺少后端代码、AppSecret 或 Go 停止；全栈才同时核对前后端。先检查 `doc/prd.md` 是否存在：

**`doc/prd.md` 不存在**：对本次范围内代码进行反向扫描，提取已实现的功能，参考 `prd-template.md` 模板生成 `doc/prd.md`，写入后展示完整内容，并告知用户"已根据代码自动生成 PRD"。然后继续部署。

**`doc/prd.md` 存在**：进行双向 review：

**正向检查（PRD → 代码）**：读取 `doc/prd.md`，逐模块检查代码是否有对应实现：
- 前端：`frontendDir` 下的页面和组件是否覆盖了本次范围内的用户操作流程
- 后端：`backend/` 下的接口是否覆盖了 PRD 中涉及的数据操作

**反向检查（代码 → PRD）**：扫描代码中实现的功能，对照 PRD 判断是否有未记录的功能：
- 前端：`frontendDir` 的页面、路由、组件中是否有 PRD 未提及的功能入口
- 后端：接口路由中是否有 PRD 未描述的接口

输出检查结果：

```
PRD 一致性检查结果

✅ 已实现且有记录：
  - [模块名]：[简述代码中对应的实现]
  ...

⚠️ PRD 有要求但代码未实现：
  - [模块名]：[说明缺失的地方]
  ...

📝 代码已实现但 PRD 未记录：
  - [功能描述]：[代码位置]
  ...
```

若存在"代码已实现但 PRD 未记录"的项，自动将这些功能补充到 `doc/prd.md` 对应模块中，然后展示补充后的完整 PRD 内容，并告知用户已更新了哪些内容。

若存在"PRD 有要求但代码未实现"的项，AskUserQuestion 确认：

```yaml
questions:
  - question: "发现以下功能在 PRD 中有要求但代码中未找到实现，是否继续部署？"
    header: "发布确认"
    multiSelect: false
    options:
      - label: "继续部署"
        description: "已知晓，接受当前状态发布"
      - label: "先补全再部署"
        description: "返回开发，补全缺失功能后再发布"
```

若两项检查均无问题，直接输出"PRD 与代码一致，准备部署"并继续。

### Step 3: 部署后端服务

本次范围包含后端时进入操作 1: publish，先核对配置、依赖和构建；缺失或失败则报告并停止后续发布。纯前端直接跳到 Step 4，不创建后端。

全栈范围内：CLI 返回 acceptance_required 后，由 Agent 使用宿主 MCP 和真实健康请求完成 [正式后端上线验收](./backend-production.md#上线验收与失败处理)，确认 build/deploy、两个新副本 Ready、运行版本和健康检查均通过后才继续前端；失败或证据缺失则停止：
```
后端部署失败，已停止部署流程。请先修复后端问题后重新部署。
```

#### Step 3.1: 确认前端后端地址

仅本次全栈范围的后端验收通过后执行，纯后端不修改前端：
1. 线上后端地址固定为 `https://{appId}.qiandaomp.com`
2. 默认模板的 `getBackendBase()` 从公开 AppID 推导该域名，核对目标即可，不新增地址常量；CLI 构建会准备公开配置
3. 旧项目确有 `BACKEND_BASE` 等地址配置时，按其实际接入契约更新并展示结果；找不到该常量本身不构成配置缺失

### Step 4: 部署前端服务

**仅本次范围包含前端时执行**：纯前端直接进入；全栈先通过后端验收；纯后端跳过本节。

#### 前置检查 1：后端地址检查（仅"仅前端"模式执行）

仅当前端源码确实调用已有后端时检查 `BACKEND_BASE`；没有该配置或不依赖后端的纯前端直接继续，不生成后端地址。
- 本地地址（`localhost`/`127.0.0.1`/`/api`）→ 从现有配置或真实部署证据确认可访问目标；未确认时先报告配置缺口，不根据 AppID 猜测存在后端，也不自动创建后端。用户明确保留本地地址时说明实际可达状态。
- 线上地址 → 直接继续

#### 前置检查 2：小程序关联检查

CLI 存在根主配置时直接优先读取其公开字段，否则读取实际前端 qdmp.json；getMe、上传和提审不以前端副本同步为前置。主配置损坏或所选环境身份缺失时停止，不回退旧身份。执行 `qdmp getMe` 核对账号、目标应用与实际 loader；编译产物身份不属于当前主配置对应环境的有效身份映射时重新构建。EMP 源码、依赖和构建链必须真实匹配，主配置写成 EMP 不代表已完成旧源码迁移。

> 纯前端从实际 `qdmp.json` 读取 appId/loader，并使用 CLI 登录态，不要求 `qdmp-config.json`、AppSecret 或后端 runtime。若旧前端配置含秘密，先按敏感配置规范隔离；不能因此初始化后端或要求补齐新的后端凭据。

#### 部署步骤

**Step 4.1：生成版本描述（每次上传强制执行）**

`description` 在上传接口中是兼容旧调用方的非必填字段，但本 skill 执行前端发布时必须自动生成并传入。不得要求用户手动填写，也不得降级为无描述上传。

1. 先根据当前会话中已经完成的功能、修复和用户确认内容整理候选摘要，再在 `projectRoot` 用 Git 核对实际改动：
   ```bash
   git status --short
   git diff HEAD --stat
   git diff HEAD
   git ls-files --others --exclude-standard
   ```
2. 对未跟踪但属于本次功能的源码文件，按需读取内容。若工作区无改动，使用当前会话的实施记录并读取最近提交核对，不得仅凭提交标题猜测：
   ```bash
   git log -1 --format='%s%n%b'
   git show --stat --patch --format=fuller HEAD
   ```
3. 只总结与本次小程序版本有关的变化：
   - 优先总结 `frontend/` 中用户可感知的新增、优化和修复。
   - 全量部署时，可包含直接影响小程序功能的后端接口或数据能力变化。
   - 忽略构建产物、依赖锁文件、自动生成文件、测试夹具和仅文档格式变化；依赖升级确实改变功能或修复问题时才纳入。
4. 生成一条中文版本描述并记为 `versionDescription`：
   - 10～200 个 Unicode 字符，单行；建议使用 1～3 个并列短句。
   - 合并同类改动，避免逐文件罗列；不写“代码调整”“例行更新”等空泛内容。
   - 不包含密钥、Token、内部地址、用户数据、文件绝对路径或实现细节。
   - 不包含引号、反引号、`$`、换行等 Shell 特殊字符。
   - 确实无法从改动判断时，使用兜底描述：`优化小程序功能与使用体验`。
   - 生成后按 Unicode 字符数检查，超过 200 字时先压缩再继续。
5. 在上传前输出一次，后续命令必须使用同一份内容：
   ```text
   本次版本描述：{自动生成的版本描述}
   ```

**Step 4.2：确认 CLI 支持版本描述**

```bash
qdmp-cli upload --help | grep -q -- '--description'
```

- 支持 → 继续上传。
- 不支持 → 执行 `npm install -g qdmp-cli@latest`，然后再次检查。
- 升级后仍不支持 → 停止上传并报告错误，严禁退回无描述上传。

**Step 4.3：构建**

以下命令的工作目录必须是 `frontendDir`，即本次识别出的实际前端目录：

```bash
qdmp build  # 必须使用 qdmp build，否则 upload 会失败
```

**Step 4.4：检查登录态并按需交互登录**

先在同一工作目录执行目标命令或：

```bash
qdmp getMe
```

- 已返回当前用户 → 跳过登录，继续 Step 4.5。
- 提示未登录、登录失效或 Token 失效 → Agent 对话按 [Agent 对话登录](./agent-login.md) 调用 `qdmp login --agent --env <env>` 并立即展示链接和图片；收到成功事件后重试原命令。用户前台终端仍提供三选一登录流程。
- 其他错误（例如 `qdmp.json`/`appId` 缺失、网络错误）→ 先报告并修复原始错误，不要误判为需要登录。

CLI 会提供以下三种登录方式：

1. 扫码登录：终端展示二维码，使用千岛 App 扫码并确认。
2. 手动登录 URL：CLI 打印并尝试打开登录 URL，用户在浏览器完成登录。
3. 账号密码登录：继续使用原有账号密码接口。

App 扫码使用二维码状态轮询，浏览器 URL 使用开放平台登录和 localhost 回调。两者是不同入口，成功后均保存当前环境 Token；Agent 模式同时提供两个入口，任一路径成功即可完成登录。

交互登录必须遵守：

1. 只在支持用户输入的前台交互终端（TTY/PTY）中单独执行；不得与构建、上传使用 `&&`、管道或同一个批量命令串联。
2. 扫码或 URL 登录时，等待用户完成手机或浏览器确认；账号密码登录时由用户直接在终端输入，密码不回显属于正常现象。
3. Agent 非交互登录使用独立的 `--agent` 模式，按上述文档保持进程并展示图片。无人值守的 CI 使用 `QDMP_TOKEN`；未设置则输出错误并退出，不等待输入。
4. 不得要求用户在聊天中发送账号或密码，不得用 `echo`、管道、命令参数或环境变量注入凭据。

`qdmp-cli login` 是同一 CLI 的兼容别名，但文档和流程统一使用较短的 `qdmp login`。

**Step 4.5：携带描述上传**

确认 `qdmp getMe` 成功后执行：

```bash
qdmp-cli upload -d "<versionDescription>"
```

上传命令中的描述必须与 Step 4.1 输出完全一致。若上传因描述参数、登录态、构建或网络问题失败，报告原始错误并停止；修复后仍携带同一描述重试，不得改用无 `-d/--description` 参数的上传命令。

用户明确要求上传并设置体验版时，将本步骤的上传命令替换为 `qdmp upload --experience -d "<versionDescription>"`，按 [设置体验版](./development-guide.md#设置体验版) 展示结果；不要先普通上传再执行一次 `upload --experience`。已上传版本使用 `qdmp experience --version <实际版本号>`。

**Step 4.6：按用户意图提交审核与正式发布**

普通 `upload` 成功只表示上传了前端版本，不表示已设体验版、已提审或正式上线。用户只要求上传/体验时到对应结果即结束；明确要求正式前端上线时，由 Agent 继续平台提审/发布流程。

当前 CLI 支持时，使用上传结果中的真实版本号；已上传开发版先设为当前体验版，再提交审核：

```bash
qdmp experience --version <实际前端版本号>
qdmp review --version <实际前端版本号> -d "<本次说明>" --auto-publish --json
```

本次已用 `upload --experience` 设置了体验版时，不重复切换；`review` 也不会重新构建、上传或自动设置体验版。`--auto-publish` 表示审核通过后由平台自动发布，仅在用户已授权正式上线时使用；仅要求提审则不加。命令不存在时使用实际平台能力，不猜测接口。

`reviewSubmitted=true` 只证明已提交审核，不能报告正式上线；最终审核/发布状态以返回的开放平台链接和真实平台结果为准。没有状态查询能力或仍在审核时，报告“已提交审核，正式发布待确认”，不得虚构成功或重复提审。已有待审版本需替换时，先查明目标与授权，不能擅自加 `--replace-review`。
