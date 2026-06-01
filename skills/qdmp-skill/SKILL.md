---
name: qdmp-skill
description: "千岛小程序开发助手（外部版），支持前后端的开发和部署。"
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Skill,
                mcp__qdmp-gitlab__qdmp_gitlab_list_versions, mcp__qdmp-gitlab__qdmp_gitlab_get_version,
                mcp__qdmp-gitlab__qdmp_gitlab_diff, mcp__qdmp-gitlab__qdmp_gitlab_publish,
                mcp__qdmp-gitlab__qdmp_gitlab_pipeline_status, mcp__qdmp-gitlab__qdmp_gitlab_pipeline_logs,
                mcp__qdmp-gitlab__qdmp_gitlab_rollback, mcp__qdmp-gitlab__qdmp_gitlab_init_repo,
                mcp__qdmp-gitlab__qdmp_gitlab_repo_exists, mcp__qdmp-aliyun__qdmp_k8s_deployed_version,
                mcp__qdmp-aliyun__qdmp_k8s_logs]
user-invocable: true
---

# 千岛小程序开发助手（外部版）

帮助开发者快速创建、开发、调试和部署千岛小程序。

## 知识库

| 文档 | 内容 |
| ---- | ---- |
| [development-guide.md](./knowledge/development-guide.md) | 开发指南：项目结构、服务端 API、调试发布 |
| [api-guide.md](./knowledge/api-guide.md) | 服务端 API：场景化接口文档 |
| [backend-operations.md](./knowledge/backend-operations.md) | 后端操作详情：通用子流程 + 操作 1-7 的完整步骤 |
| [project-workflows.md](./knowledge/project-workflows.md) | 项目工作流程：创建项目、开发调试、打包部署 |
| [prd-template.md](./knowledge/prd-template.md) | PRD 模版：好的 PRD 应包含哪些内容 + 可直接使用的模版 |

---

## 启动步骤（每次 skill 触发时必须先执行）

### 第零步：环境依赖检查

在执行任何操作前，必须先确认开发环境就绪：

```bash
# 检查 qdmp-cli 是否可用
qdmp-cli --version 2>/dev/null
```

- **命令成功**（输出版本号） → 继续第一步
- **命令失败**（command not found 或报错） → 执行自动安装：

```bash
npm install -g qdmp-cli
```

安装完成后再次验证：
```bash
qdmp-cli --version 2>/dev/null
```

- **验证通过** → 继续第一步
- **仍然失败** → 停止流程，向用户报告错误信息，提示可能原因（npm 未安装、网络问题、权限不足等），并建议用户手动排查后重试。**严禁在 qdmp-cli 不可用的状态下执行创建项目或发布操作。**

同时检查 pnpm 是否可用（创建和开发项目需要）：
```bash
pnpm --version 2>/dev/null
```
- 不可用则执行 `npm install -g pnpm`，安装失败同样停止并报告。

### 第一步：项目选择

扫描 `/workspace` 下的小程序项目：
```bash
find /workspace -maxdepth 3 -name "qdmp.json" 2>/dev/null
```

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

详细步骤见 [backend-operations.md](./knowledge/backend-operations.md) 的「通用子流程: 读取项目配置」。

关键变量：
- `projectRoot`：小程序根目录
- `sourceDir`：`{projectRoot}/backend/`
- `mongoUri` / `mongoDatabase`：来自 `qdmp.json` 的 `mongodb` 字段（可选，仅后端使用）

### 第三步：PRD 检查（仅开发意图时执行）

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

根据用户意图匹配操作，详细步骤见 [backend-operations.md](./knowledge/backend-operations.md)：

| 关键词 | 操作 |
| ------ | ---- |
| 部署、打包部署、上线、发布（无前端/后端限定） | 流程四：打包部署（全量，见 project-workflows.md） |
| 部署后端、发版后端、后端上线、只部署后端、部署新版本、release | 操作 1: publish（仅后端） |
| 部署前端、上传前端、前端上线、只部署前端 | 流程四：打包部署（仅前端，见 project-workflows.md） |
| 查看版本、版本列表、版本历史、发布记录 | 操作 2: versions |
| 回滚、回退、恢复到某版本、rollback | 操作 3: rollback |
| 查看日志、服务日志、启动失败、报错、logs、排查问题 | 操作 4: logs |
| 部署状态、当前版本、线上版本、运行状态、status | 操作 5: status |
| 部署后端测试环境、本地跑后端、调试后端、跑一下后端、test-deploy | 操作 6: test-deploy（仅后端） |
| 部署测试环境、本地测试、本地运行、本地调试、启动开发环境 | 流程三：开发调试（全量，见 project-workflows.md） |
| 数据建模、设计数据、我要存什么数据、数据库设计、定义数据结构、管理数据 | 操作 7: schema |

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

### 前端（`frontend/`）

修改前端代码前，必须先读取 `frontend/README.md`（如果存在），确保代码风格、目录结构、命名约定与项目现有规范一致。

使用 `Taro.navigateTo` 传递 query 参数时，URL 参数值不得直接拼接中文、空格、`&`、`?`、`=` 等特殊字符。若参数可能包含中文或特殊字符，必须使用 `encodeURIComponent` 编码：

```javascript
Taro.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${encodeURIComponent(cat.name)}`,
})
```

禁止写法：

```javascript
Taro.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${cat.name}`,
})
```

### 后端（`backend/`）

修改后端代码前，若项目根目录存在 `qdmp-schema.json`，必须先读取它，确保代码直接引用已定义的数据模型，不重复定义字段。新增数据存储需求时，先更新 `qdmp-schema.json`，再生成对应 model 代码。

---

## 命令速查

| 命令 | 说明 |
| ---- | ---- |
| `qdmp-cli list` | 查看可用模板 |
| `qdmp-cli create <name>` | 创建项目 |
| `qdmp-cli init -a <id>` | 关联小程序 |
| `pnpm install` | 安装依赖 |
| `pnpm run dev` | 开发模式 |
| `pnpm run build` | 打包构建 |
| `qdmp-cli login` | 登录账号 |
| `qdmp-cli upload` | 上传部署 |

## 常见问题

| 问题 | 解决方案 |
| ---- | -------- |
| 依赖安装 401/404 | 配置 npm Token |
| qdmp-cli 未找到 | `npm install -g qdmp-cli` |
| pnpm 未找到 | `npm install -g pnpm` |
| 图片 403 | index.html 加 `<meta name="referrer" content="no-referrer">` |
