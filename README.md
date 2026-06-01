# 千岛小程序开发 Skill

帮助开发者快速创建、开发和部署千岛小程序。

## Claude Code 插件安装

本仓库已经按 Claude Code 插件 marketplace 结构组织：

```text
.claude-plugin/
  plugin.json       # qdmp 插件声明
  marketplace.json  # qdmp-marketplace 插件市场声明
skills/
  qdmp-skill/
    SKILL.md
```

### 1. 添加插件市场

添加千岛小程序插件市场：

```bash
claude plugin marketplace add EchoTechFE/qdmp-skill
```

添加完成后，在 Claude Code 中运行 `/plugin`，进入 Discover 标签页即可看到 `qdmp` 插件。

### 2. 安装插件

```bash
claude plugin install qdmp@qdmp-marketplace
claude plugin list
```

如果已经在 Claude Code 会话中，安装后执行：

```text
/reload-plugins
```

### 3. 使用插件 Skill

插件安装后，skill 会以插件命名空间暴露：

```text
/qdmp:qdmp-skill
```

也可以直接描述千岛小程序、qdmp、部署、发布、开发调试等需求，Claude Code 会根据 skill 描述自动选择使用。

### 维护者本地调试

如果你正在维护本仓库，并希望从本地工作区调试 marketplace，可以在仓库根目录执行：

```bash
claude plugin marketplace add ./
```

## 前置准备

### 1. 注册千岛开放平台账号

前往 [千岛开放平台](https://open.qiandao.com) 注册账号并创建小程序，获取 `appId` 和 `appSecret`。

### 2. 添加 MCP 服务

```bash
claude mcp add --transport http qdmp-gitlab https://openapi.qiandao.com/gitlab/mcp
claude mcp add --transport http qdmp-aliyun https://openapi.qiandao.com/aliyun/mcp
```

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

### 部署发布

```
部署上传小程序
```

## 完整开发流程

```
1. 配置环境 → 安装 Node.js、pnpm、qdmp-cli
2. 创建项目 → qdmp-cli create myApp
3. 安装依赖 → pnpm install
4. 开发调试 → pnpm run dev
5. 打包构建 → pnpm run build
6. 登录账号 → qdmp-cli login
7. 上传部署 → qdmp-cli upload
```

## 相关链接

- Node.js 官网：https://nodejs.org
- 千岛开放平台：https://open.qiandao.com
