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

QDMP 1.1.14 补充 [云服务使用规范](skills/qdmp-skill/knowledge/backend-operations.md#云服务使用规范)：禁止媒体文件内容写入云数据库，接口不存在时停止重试与轮询，避免触发 WAF 封禁。该版本正式发布后，更新并重新加载 Skill 才能应用这些规则。

QDMP 1.1.13 按实际宿主检查已有安装，自动更新用户级独立安装的 Skill；插件仅在支持固定发布目标时自动更新，否则转人工处理。同版本也校验内容，并识别并存副本和旧监控流程。独立安装与插件安装只是同一公开版本的不同安装渠道，更新不会改变采集授权。旧客户端需先正常升级一次；1.1.13 正式发布后才能使用其标签升级。操作、限制及恢复方法见 [升级说明](skills/qdmp-skill/references/upgrade.md#三类旧入口的诊断与自动更新)。

### 项目监控插件的安装边界

QDMP 仅提供可选监控的提示和调用指引，不内置监控安装器、Bootstrap MCP 或上报脚本，也不改变原有开发、登录、部署流程。安装、目录授权、更新、三宿主适配、拒绝结果上报及持续采集均由独立的 `agent-runtime-telemetry` 维护。需要授权时只展示第 1 节授权短文案及完整说明链接，用户作出一次明确选择后，Agent 连续执行范围内的步骤；必要的扫码身份确认和宿主安全确认仍需用户完成。

[Skill 内分发清单](skills/qdmp-skill/references/telemetry-distribution.json) 保存固定发布入口、SHA-256 和 telemetry 生成的 `pre_download_notice`（用于内部校验的告知数据与法律原文，绑定两个制品哈希和版本）。冷启动只展示状态机生成的 `display` 短文案及完整说明链接并取得一次明确确认，再下载/校验/执行独立 onboarding；实际动作超出授权范围时停止重新确认。拒绝下载或宿主拦截时不下载工具、不上报拒绝事件，也不影响业务。业务授权不能替代宿主执行审批。`onboarding: null` 或本地告知缺失表示入口不可用，不能先联网补文案。详见 [监控指引](skills/qdmp-skill/references/skill-data-consent.md)。

`skills/qdmp-skill/references/telemetry-distribution.json` 是本仓库唯一的分发清单，发布维护和安装后运行都使用这一份，不再保留仓库根副本。早期根清单服务于现已移除的 QDMP Bootstrap；迁移到 Skill 内是为了支持独立安装 Skill，不是为了维护两份配置。运行时只按实际 Skill 安装路径读取，不读取用户工作目录。

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

> **注意：** MCP 服务需要在对应平台分别配置。Codex 使用 `codex mcp add`，Qoder 国内版使用 `qoderclicn mcp add` 或在 `mcp.json` 中声明。具体请参考各平台 MCP 文档。

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

在前端目录执行 `qdmp debug`，用千岛 App 扫码运行并在终端查看真机日志；手机需要能访问电脑局域网，Ctrl+C 结束。

需要给体验人员使用时，先 `qdmp build`，再执行 `qdmp upload --experience -d "更新说明"`。CLI 自动获取本次版本号并设置体验版，无需手填版本号，也不会自动发布正式版。Agent 可使用 `--json` 读取二维码和结果。已有上传版本时，执行 `qdmp experience --version <实际版本号>` 即可切换体验版，无需重新构建上传。

可直接向 Agent 说“启动真机调试并展示二维码”“上传当前代码并设为体验版”或“把已上传的版本 12 设为体验版”（版本号替换为实际值）。完整说明见 [真机调试](skills/qdmp-skill/knowledge/development-guide.md#真机调试) 和 [设置体验版](skills/qdmp-skill/knowledge/development-guide.md#设置体验版)。

### 部署发布

```
部署上传小程序
```

---

## 完整开发流程

```
1. 配置环境 → 安装 Node.js、pnpm、qdmp-cli
2. 创建项目 → qdmp-cli create myApp
3. 安装依赖 → pnpm install
4. 开发调试 → pnpm run dev
5. 打包构建 → qdmp build（发布时必须使用 qdmp build）
6. 登录账号 → Agent 使用 `qdmp login --agent --env prod` 展示登录链接和二维码图片；前台终端保留扫码、登录 URL、账号密码三种方式
7. 上传部署 → 自动总结本次改动并执行 `qdmp-cli upload --description "<版本描述>"`
```

---

## 相关链接

- Node.js 官网：https://nodejs.org
- 千岛开放平台：https://open.qiandao.com
