# 千岛小程序开发 Skill

帮助开发者快速创建、开发和部署千岛小程序。

## 目录结构

```text
.claude-plugin/
  plugin.json       # Claude Code 插件声明
  marketplace.json  # Claude Code 插件市场声明
.codex-plugin/
  plugin.json       # Codex 插件声明
  marketplace.json  # Codex 插件市场声明
.qoder-plugin/
  plugin.json       # Qoder 插件声明
  marketplace.json  # Qoder 插件市场声明
skills/
  qdmp-skill/
    SKILL.md
  qdmp-product-rules/
    SKILL.md
    references/product-baseline.md
  qdmp-design-rules/
    SKILL.md
    references/
```

本仓库同时支持 **Claude Code**、**Codex (OpenAI)** 和 **Qoder** 三个平台，共享同一套 `skills/` 目录。

---

## 安装

### 已安装旧版的升级与诊断

QDMP 1.1.15 固定使用已发布的 Agent Runtime Telemetry 0.2.18 制品与 SHA-256，修复旧运行时登录失败的原流程恢复、兼容版本复用、people-v1 参数兼容和 Hook 工作区诊断。新建项目先生成最终目录再告知收集；更新软件不扩大现有采集授权。

QDMP 1.1.14 补充 [云服务使用规范](skills/qdmp-skill/knowledge/backend-operations.md#云服务使用规范)：禁止媒体文件内容写入云数据库，接口不存在时停止重试与轮询，避免触发 WAF 封禁。该版本正式发布后，更新并重新加载 Skill 才能应用这些规则。

主 Skill 每次触发时按实际宿主检查最新正式 Release 和已有安装，自动更新用户级独立安装的 Skill；插件仅在支持固定发布目标时自动更新，否则转人工处理。同版本也校验内容，并识别并存副本和旧收集流程。独立安装与插件安装只是同一公开版本的不同安装渠道，更新不会改变采集授权。旧客户端需先从原渠道升级到带启动检查的正式版。操作、限制及恢复方法见 [升级说明](skills/qdmp-skill/references/upgrade.md#三类旧入口的诊断与自动更新)。

### 项目收集插件的安装边界

QDMP 仅提供可选收集的提示和调用指引，不内置收集安装器、Bootstrap MCP 或上报脚本，也不改变原有开发、登录、部署流程。安装、目录授权、更新、三宿主适配、拒绝结果上报及持续采集均由独立的 `agent-runtime-telemetry` 维护。需要授权时只展示第 1 节授权短文案及完整说明链接，用户作出明确选择后，Agent 委派子 Agent 安装、补齐依赖或修复，并复验收集状态；没有子 Agent 时由主 Agent 执行。超出已有许可时只确认新增的软件动作；当前运行时采集不要求登录；旧运行时明确要求的登录和宿主安全确认仍需用户完成。

[Skill 内分发清单](skills/qdmp-skill/references/telemetry-distribution.json) 保存固定发布入口、SHA-256 和 telemetry 生成的 `pre_download_notice`（用于内部校验的告知数据与法律原文，绑定两个制品哈希和版本）。冷启动只展示状态机生成的 `display` 短文案及完整说明链接并取得一次明确确认，再下载/校验/执行独立 onboarding；实际动作超出授权范围时停止重新确认。拒绝下载或宿主拦截时不下载工具、不上报拒绝事件，也不影响业务。业务授权不能替代宿主执行审批。`onboarding: null` 或本地告知缺失表示入口不可用，不能先联网补文案。详见 [收集指引](skills/qdmp-skill/references/skill-data-consent.md)。

`skills/qdmp-skill/references/telemetry-distribution.json` 是本仓库唯一的分发清单，发布维护和安装后运行都使用这一份，不再保留仓库根副本。早期根清单服务于现已移除的 QDMP Bootstrap；迁移到 Skill 内是为了支持独立安装 Skill，不是为了维护两份配置。运行时只按实际 Skill 安装路径读取，不读取用户工作目录。

新指引支持一次同意后复用已确认的兼容版本，以及旧版登录前置失败的同流程恢复；旧清单仍保留其原授权范围。people-v1 参数只能由包含对应告知的新清单启用，不能手工给旧授权增加该参数。新建项目先由 CLI 创建最终目录，再启动该目录的收集告知。Hook 验证先核对聊天工作区和缺失事件，等待验证不阻塞业务。

待 telemetry 新版本实际发布后，将该次发布产出的完整 `dist/telemetry-distribution.json` 原样更新到上述唯一文件；版本、两个制品 URL/SHA-256 与发布告知一起更新，不手工拼接文案或修改哈希。该发布产物属于 telemetry 构建输出，不是 QDMP 的第二份维护源。更新后执行：

```bash
node scripts/check-telemetry-distribution.mjs
node --test test/telemetry-distribution.test.mjs
```

将唯一清单一并提交；单独安装 Skill 时复制完整 `skills/qdmp-skill/`，不能只复制 `SKILL.md`。校验脚本只用于维护者的发布检查，不随 Skill 执行，不生成副本、不下载或启用 telemetry。检查会拒绝缺失的清单、不可用 onboarding、版本/哈希/告知不一致和无效下载配置；不联网确认制品存在，也不证明远端内容可信，发布方仍需确认实际制品及校验值。上述命令是发布前检查，尚无 CI 自动接入。

### Claude Code

无 telemetry MCP 的首次使用由随 Skill 安装的 `scripts/monitor-flow.mjs` 强制执行告知、授权绑定、下载校验、实时状态复查和合法转换；安装仍委托固定 telemetry 发布入口。完整方案见 [状态机指引](skills/qdmp-skill/references/monitor-flow.md)。

```bash
node --test test/telemetry-distribution.test.mjs test/monitor-flow.test.mjs
```

**1. 添加插件市场**

```bash
claude plugin marketplace add EchoTechFE/qdmp-skill
```

添加完成后，在 Claude Code 中运行 `/plugin`，进入 Discover 标签页即可看到 `qdmp` 插件。

**2. 安装插件**

```bash
claude plugin install qdmp@qdmp-marketplace
claude plugin list
```

如果已经在 Claude Code 会话中，安装后执行：

```text
/reload-plugins
```

**3. 使用**

```text
/qdmp:qdmp-skill
/qdmp:qdmp-product-rules
/qdmp:qdmp-design-rules
```

---

### Codex (OpenAI)

**1. 添加插件市场**

```bash
codex plugin marketplace add EchoTechFE/qdmp-skill
```

**2. 启用插件**

Codex 目前没有 `plugin install` CLI 命令，需要通过 TUI 或 `plugin add` 启用：

```bash
# 方式一（推荐，部分版本支持）
codex plugin add qdmp@qdmp-marketplace

# 方式二：通过 TUI 界面启用
codex
# 在会话中执行 /plugins，切换到 qdmp-marketplace，找到 qdmp 点击 Install/Enable
```

重启 Codex 后插件生效。

**3. 使用**

技能会根据任务描述自动触发，也可以手动调用：

```text
/qdmp:qdmp-skill
/qdmp:qdmp-product-rules
/qdmp:qdmp-design-rules
```

---

### Qoder (国内版 qoderclicn)

**1. 添加插件市场**

```bash
qoderclicn plugin marketplace add EchoTechFE/qdmp-skill
```

**2. 安装插件**

```bash
qoderclicn plugin install qdmp@qdmp-marketplace
```

如果用户只安装了 Qoder 桌面版而没有 `qoderclicn`，由独立 telemetry 引导工具检测桌面安装入口并注册 MCP、初始化 Hooks；需要宿主信任或重启时，完成后恢复同一任务，不要求再次授权或调用 qdmp-skill。

**3. 使用**

```text
/qdmp:qdmp-skill
/qdmp:qdmp-product-rules
/qdmp:qdmp-design-rules
```

---

## Skill 组成

| Skill | 用途 |
| ----- | ---- |
| `/qdmp:qdmp-skill` | 千岛小程序主开发助手，负责项目创建、开发、调试、部署、运维流程 |
| `/qdmp:qdmp-product-rules` | 产品底线规范，约束代码生成和 Review 中可明确执行的产品边界 |
| `/qdmp:qdmp-design-rules` | Taro 前端设计规范，维护页面设计、`DESIGN.md`、`app.css` token、HTML 到 Taro 移植和 UI Review |

`/qdmp:qdmp-skill` 的开发类任务依赖另外两个规范 skill：先过 `/qdmp:qdmp-product-rules`，涉及前端 UI/Taro 时再过 `/qdmp:qdmp-design-rules`。产品规范和设计规范分开维护，避免把产品审核判断混入视觉/代码落地规则。

主技能按能力加载技术指南，不固定接入方的界面或展示方式：

| 能力 | 技术指南 |
| --- | --- |
| OpenAPI 用户授权映射 | [HTTP method + path → scope](skills/qdmp-skill/knowledge/openapi-user-authorization.md) |
| 用户登录与 openId | [后端换票及 `/auth/v1/token` 唯一身份来源](skills/qdmp-skill/knowledge/api-guide.md#21-获取-token) |
| 心愿单及用户授权 | [接口、授权、分页与单次写入示例](skills/qdmp-skill/knowledge/wishlist.md) |
| OSS 图片/视频上传 | [POST 直传/中转、OpenAPI 与存储容量权限、凭据风险](skills/qdmp-skill/knowledge/oss-upload.md) |
| 手机号授权 | [平台申请、App 6.68.0+、原生按钮及后端兑换](skills/qdmp-skill/knowledge/phone-authorization.md) |
| WebView 网站接入 | [在开放平台「域名管理」配置网页域名白名单](skills/qdmp-skill/knowledge/development-guide.md#webview-域名白名单) |

参考代码使用通用占位配置，不附带真实应用凭据、签名、用户资料或原项目名称。指南与资源随完整 `skills/qdmp-skill/` 一起分发。

### 维护者本地调试

如果你正在维护本仓库，并希望从本地工作区调试，可以在仓库根目录执行：

```bash
# Claude Code
claude plugin marketplace add ./

# Codex
codex plugin marketplace add ./

# Qoder (国内版)
qoderclicn plugin marketplace add ./
```

---

## 前置准备

### 1. 注册千岛开放平台账号

前往 [千岛开放平台](https://open.qiandao.com) 注册账号并创建小程序，获取 `appId` 和 `appSecret`。

### 2. 添加 MCP 服务

```bash
claude mcp add --transport http qdmp-gitlab https://openapi.qiandao.com/gitlab/mcp
claude mcp add --transport http qdmp-aliyun https://openapi.qiandao.com/aliyun/mcp
```

> **注意：** MCP 服务需要在实际宿主分别配置。工具参数、正式环境限制和副作用见 [后端 MCP 清单](skills/qdmp-skill/references/backend-mcp.md)。后端打包、上传与工具编排不依赖浏览器。

---

## 触发方式

当你提到以下关键词时会自动触发：

- 千岛小程序
- qdmp
- qdmp-cli
- 千岛开放平台
- 小程序模板
- 小程序开发
- 小程序部署
- 小程序上传
- 小程序打包
- 小程序发布
- 小程序项目
- 小程序开发环境

---

## 使用示例

### 环境配置

```
帮我配置千岛小程序开发环境
```

### 创建项目

```
创建一个千岛小程序项目
```

### 开发调试

```
启动小程序开发
```

### 真机扫码与体验版（CLI ≥0.1.32）

在前端目录执行 `qdmp-cli debug`，用千岛 App 扫码运行并在终端查看真机日志；手机需要能访问电脑局域网，Ctrl+C 结束。

需要给体验人员使用时，先 `qdmp-cli build`，再执行 `qdmp-cli upload --experience -d "更新说明"`。CLI 自动获取本次版本号并设置体验版，无需手填版本号，也不会自动发布正式版。Agent 可使用 `--json` 读取二维码和结果。已有上传版本时，执行 `qdmp-cli experience --version <实际版本号>` 即可切换体验版，无需重新构建上传。

可直接向 Agent 说“启动真机调试并展示二维码”“上传当前代码并设为体验版”或“把已上传的版本 12 设为体验版”（版本号替换为实际值）。完整说明见 [真机调试](skills/qdmp-skill/knowledge/development-guide.md#真机调试) 和 [设置体验版](skills/qdmp-skill/knowledge/development-guide.md#设置体验版)。

### 全栈项目开发与部署

用 `qdmp-cli create <项目名>` 创建项目。已有项目按 [旧项目迁移](skills/qdmp-skill/knowledge/project-workflows.md#旧项目强制迁移) 处理。

部署时，Agent 确认目标应用和发布范围，在对话中引导补齐缺失配置，再调用 CLI。CLI 执行构建和发布，Agent 核对线上版本、副本与健康结果。详见 [后端部署与验收](skills/qdmp-skill/knowledge/backend-production.md)。

### 部署范围与前端正式上线

Agent 按 backend/ 目录是否存在识别项目，再结合用户范围：纯前端只构建/上传前端，不要求 AppSecret、Go 或后端；全栈默认先完成后端发布与 Skill 验收，再上传前端。不存在纯后端小程序；明确仅后端时，只操作全栈项目的 backend/。空 backend/ 或配置缺失仍为全栈待完善，不能降级为纯前端；明确仅前端时，不要求后端构建或配置接入通过。具体工具链见 [部署分流](skills/qdmp-skill/knowledge/project-workflows.md#step-1-判断项目形态与部署范围)。

`upload` 仅上传版本。需要正式前端上线时，还须按实际版本设置体验版并提审；当前 CLI 可用 `qdmp-cli review --version <实际版本号> --auto-publish --json` 选择审核通过后由平台发布。提审成功只证明已进入审核，最终上线以平台结果为准。


---

## 完整开发流程

```
1. 配置环境 → Node.js、Go、qdmp-cli；前端步骤另需 pnpm
2. 创建项目 → qdmp-cli create myApp（默认完整全栈模板，也可显式 -t default）
3. 配置与依赖 → 部署预检自动补齐所需配置；在实际前端目录安装依赖
4. 开发调试 → 按前后端各自 README 启动和验证
5. 后端正式发布 → backend deploy --description "<说明>" 内部构建、校验归档并直接发布，完成全部上线验收；--review 为可选审查
6. 前端构建与登录 → 在 frontend/ 执行 qdmp-cli build，按需 qdmp-cli login --agent --env prod
7. 前端上传 → 自动总结本次改动并执行 qdmp-cli upload --description "<版本描述>"
```

---

## 相关链接

- Node.js 官网：https://nodejs.org
- 千岛开放平台：https://open.qiandao.com
