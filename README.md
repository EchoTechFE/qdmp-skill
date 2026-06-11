# 千岛小程序开发 Skill

帮助开发者快速创建、开发和部署千岛小程序。

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
5. 打包构建 → qdmp build（发布时必须使用 qdmp build）
6. 登录账号 → qdmp-cli login
7. 上传部署 → qdmp-cli upload
```

## 相关链接

- Node.js 官网：https://nodejs.org
- 千岛开放平台：https://open.qiandao.com
