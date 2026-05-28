# 项目工作流程

## 流程一：创建项目

### Step 1: 在后台创建小程序

访问 [千岛开放平台](https://open.qiandao.com) 创建小程序，获取 appId。

> 账号获取: https://open.qiandao.com/docs/getting-started

### Step 2: 创建本地项目

```bash
qdmp-cli list              # 查看可用模板
qdmp-cli create <项目名称>  # 创建项目
cd <项目名称>
pnpm install               # 安装依赖
```

**依赖安装失败**: 请确认 npm 已正确配置，网络可正常访问 npm registry。

### Step 3: 分离前后端目录

```bash
mkdir frontend
find . -maxdepth 1 ! -name '.' ! -name 'frontend' ! -name '.git' ! -name '.gitignore' ! -name '.gitmodules' ! -name '.DS_Store' -exec mv {} frontend/ \;
mkdir backend
```

AskUserQuestion 询问后端语言：

```yaml
questions:
  - question: "后端使用什么语言？"
    header: "后端语言"
    multiSelect: false
    options:
      - label: "Go"
        description: "runtime: go，使用 Go 1.22"
      - label: "Node.js (Recommended)"
        description: "runtime: nodejs22，使用 Node.js 22"
      - label: "Python"
        description: "runtime: python312，使用 Python 3.12"
```

更新 `frontend/qdmp.json`，填入 appId、appSecret 和选择的 runtime：
```json
{
  "appId": "<appId>",
  "appSecret": "<appSecret>",
  "runtime": "go"
}
```

> 注意：不要在项目根目录额外创建 qdmp.json，只修改 `frontend/qdmp.json` 即可。

### Step 4: 初始化后端代码模板

根据用户选择的语言，在 `backend/` 目录下生成对应的初始代码。

**重要**：本地测试环境必须支持 CORS，所有响应自动添加：
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, access-token, x-echo-qdmp-version`

#### Go

**目录结构**：
```
backend/
├── main.go              # 入口文件，启动 HTTP 服务，监听 :8080
├── go.mod               # 模块定义
├── handler/
│   ├── auth.go          # 认证相关路由
│   └── handler.go       # 路由注册
├── middleware/
│   └── cors.go          # CORS 中间件
├── service/             # 业务逻辑层（可选）
├── model/               # 数据模型（可选）
└── pkg/                 # 公共工具（可选）
```

**约定**：
- 入口必须是 `main.go`，`package main`
- 推荐标准库 `net/http`，也可用 `gin`、`echo` 等框架
- 配置通过环境变量读取，不要硬编码或读本地 `.env` 文件

**代码模板**：

`backend/go.mod`：
```go
module <项目名称>

go 1.22
```

`backend/main.go`：
```go
package main

import (
	"fmt"
	"log"
	"net/http"

	"<项目名称>/handler"
)

func main() {
	mux := http.NewServeMux()
	handler.Register(mux)
	
	fmt.Println("Server running on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
```

`backend/middleware/cors.go`：
```go
package middleware

import "net/http"

func CORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, access-token, X-Client-Package-Id, X-Request-Package-Id")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		
		next.ServeHTTP(w, r)
	}
}
```

`backend/handler/handler.go`：
```go
package handler

import (
	"fmt"
	"net/http"

	"<项目名称>/middleware"
)

func Register(mux *http.ServeMux) {
	mux.HandleFunc("/", middleware.CORS(handleIndex))
	mux.HandleFunc("/auth/v1/token", middleware.CORS(handleToken))
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "Hello from <项目名称>!")
}
```

`backend/handler/auth.go`：
```go
package handler

import (
	"bytes"
	"io"
	"net/http"
	"time"
)

const baseOpenapiAuthUrl = "https://openapi.qiandao.com/auth/v1/"

var httpClient = &http.Client{Timeout: 20 * time.Second}

func handleToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	apiReq, _ := http.NewRequest(http.MethodPost, baseOpenapiAuthUrl+"token", bytes.NewReader(body))
	apiReq.Header.Set("Content-Type", "application/json")
	
	apiResp, err := httpClient.Do(apiReq)
	if err != nil {
		http.Error(w, "Request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer apiResp.Body.Close()

	respBody, _ := io.ReadAll(apiResp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(apiResp.StatusCode)
	w.Write(respBody)
}
```

然后执行：
```bash
cd backend && go mod tidy
```

#### Node.js

**目录结构**：
```
backend/
├── index.js             # 入口文件，启动服务，监听 :8080
├── package.json         # 依赖定义
├── routes/
│   ├── index.js         # 路由注册
│   └── auth.js          # 认证相关路由
├── middleware/
│   └── cors.js          # CORS 中间件
├── services/            # 业务逻辑层（可选）
├── models/              # 数据模型（可选）
└── utils/               # 工具函数（可选）
```

**约定**：
- 入口默认 `index.js`，也支持 `package.json` 中 `main` 字段指定
- 推荐使用 Node.js 原生 `http` 模块，也可用 Express、Koa、Fastify 等框架
- 不要把 `node_modules/` 放进来，CI 阶段会自动 `npm install`

**代码模板**：

`backend/package.json`：
```json
{
  "name": "<项目名称>-backend",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "start": "node index.js" }
}
```

`backend/index.js`：
```js
const http = require('http');
const { handleRequest } = require('./routes');

const server = http.createServer(handleRequest);

server.listen(8080, () => {
  console.log('Server running on :8080');
});
```

`backend/middleware/cors.js`：
```js
function corsMiddleware(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, access-token, X-Client-Package-Id, X-Request-Package-Id');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

module.exports = { corsMiddleware };
```

`backend/routes/index.js`：
```js
const url = require('url');
const { corsMiddleware } = require('../middleware/cors');
const { handleToken } = require('./auth');

function handleRequest(req, res) {
  if (corsMiddleware(req, res)) return;
  
  const parsedUrl = url.parse(req.url, true);
  
  if (parsedUrl.pathname === '/auth/v1/token' && req.method === 'POST') {
    handleToken(req, res);
  } else if (parsedUrl.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello from <项目名称>!\n');
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

module.exports = { handleRequest };
```

`backend/routes/auth.js`：
```js
const https = require('https');

const baseOpenapiAuthUrl = 'https://openapi.qiandao.com/auth/v1/';

function handleToken(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    const apiUrl = new URL(baseOpenapiAuthUrl + 'token');
    const options = {
      hostname: apiUrl.hostname,
      port: 443,
      path: apiUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const apiReq = https.request(options, apiRes => {
      let responseBody = '';
      apiRes.on('data', chunk => { responseBody += chunk.toString(); });
      apiRes.on('end', () => {
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(responseBody);
      });
    });

    apiReq.on('error', err => {
      res.writeHead(502);
      res.end('Request failed: ' + err.message);
    });

    apiReq.write(body);
    apiReq.end();
  });
}

module.exports = { handleToken };
```

然后执行：
```bash
cd backend && npm install
```

#### Python

**目录结构**：
```
backend/
├── app.py               # 入口文件，启动服务，监听 :8080
├── requirements.txt     # 依赖定义
├── middleware.py        # CORS 中间件
├── routes/
│   ├── index.py         # 路由注册
│   └── auth.py          # 认证相关路由
├── services/            # 业务逻辑层（可选）
├── models/              # 数据模型（可选）
└── utils/               # 工具函数（可选）
```

**约定**：
- 入口文件必须为 `app.py`
- 推荐 Flask，也可用 FastAPI + Uvicorn 等框架
- 不要把 `venv/`、`__pycache__/` 放进来，CI 阶段会自动 `pip install`
- **依赖版本必须兼容 Python 3.12**：运行时为 Python 3.12，requirements.txt 中应锁定具体版本或设置上限，避免使用无上限的 `>=` 约束

**代码模板**：

`backend/requirements.txt`：
```
flask==3.0.3
werkzeug==3.0.4
requests==2.32.3
```

`backend/app.py`：
```python
from flask import Flask
from middleware import add_cors
from routes.index import register_routes

app = Flask(__name__)
app.after_request(add_cors)
register_routes(app)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

`backend/middleware.py`：
```python
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, access-token, X-Client-Package-Id, X-Request-Package-Id'
    return response
```

`backend/routes/index.py`：
```python
from flask import Flask
from routes.auth import get_token

def register_routes(app: Flask):
    app.add_url_rule('/', 'index', lambda: 'Hello from <项目名称>!\n')
    app.add_url_rule('/auth/v1/token', 'get_token', get_token, methods=['POST', 'OPTIONS'])
```

`backend/routes/auth.py`：
```python
from flask import request, jsonify, make_response
import requests as req_lib

BASE_OPENAPI_AUTH_URL = 'https://openapi.qiandao.com/auth/v1/'

def get_token():
    if request.method == 'OPTIONS':
        return make_response('', 204)
    try:
        api_response = req_lib.post(BASE_OPENAPI_AUTH_URL + 'token', json=request.get_json(), timeout=20)
        return jsonify(api_response.json()), api_response.status_code
    except req_lib.exceptions.RequestException as e:
        return jsonify({'error': f'Request failed: {str(e)}'}), 502
```

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
1. 读取 `backend/routes/` 下所有文件，提取 HTTP 路由与处理逻辑
2. 读取 `backend/models/` 下所有文件，提取数据字段与集合名
3. 读取 `frontend/src/pages/` 下所有页面文件，提取页面功能与 API 调用
4. 读取 `frontend/src/app.config.js`，提取路由结构
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

**前置检查：PRD**

检查 `{projectRoot}/doc/prd.md` 是否存在：
- 存在 → 继续
- 不存在 → 提示用户建议先完成流程二（PRD 设计），用户坚持跳过则继续

**调试部署顺序规则（强制执行）**：

- 未明确指定前端或后端 → **全量调试部署**：先后端，后端成功后再前端
- 明确说"后端" → 仅执行后端测试环境部署
- 明确说"前端" → 仅执行前端测试环境部署

### Step 1: 判断调试部署范围

| 用户意图关键词 | 部署范围 | 执行流程 |
|---|---|---|
| 部署测试环境、本地测试、本地运行、本地调试、启动开发环境（无前端/后端限定） | 全量 | 先后端再前端 |
| 部署后端测试环境、本地跑后端、调试后端、跑一下后端、test-deploy | 仅后端 | 仅后端 |
| 部署前端测试环境、启动前端、调试前端、跑一下前端、启动开发服务器 | 仅前端 | 仅前端 |

无法判断时 AskUserQuestion 询问。

### Step 2: 部署后端服务测试环境

执行操作 6: test-deploy。

全量模式下：后端健康检查通过才继续前端；失败则停止：
```
后端测试环境部署失败，已停止部署流程。请先修复后端问题后重新部署。
```

操作 6 完成后会自动替换前端 `BACKEND_BASE` 为 `/api`。

### Step 3: 部署前端服务测试环境

**仅在以下条件满足时执行**：全量模式下后端成功，或用户明确选择仅前端。

#### 前置检查（仅"仅前端"模式执行）

搜索 `BACKEND_BASE`：
```bash
grep -r "BACKEND_BASE" frontend/ --include="*.js" --include="*.ts" --include="*.vue"
```

- 线上地址（含 `qiandaomp.com` 或 `https://`）→ AskUserQuestion 询问是否切换到 `/api`
- 本地地址（`/api` 或 `localhost`）→ 直接继续

#### 部署步骤

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

真机调试：`pnpm run build` 后使用千岛 App 扫码预览。

---

## 流程四：打包部署

**部署顺序规则（强制执行）**：

- 未明确指定前端或后端 → **全量部署**：先后端，后端成功后再前端
- 明确说"后端" → 仅后端
- 明确说"前端" → 仅前端

### Step 1: 判断部署范围

| 用户意图关键词 | 部署范围 | 执行流程 |
|---|---|---|
| 部署、打包部署、上线、发布（无前端/后端限定） | 全量 | 先后端再前端 |
| 部署后端、发版后端、后端上线、只部署后端 | 仅后端 | 仅后端 |
| 部署前端、上传前端、前端上线、只部署前端 | 仅前端 | 仅前端 |

无法判断时 AskUserQuestion 询问。

### Step 2: PRD 与代码一致性检查

在执行任何部署操作前，先检查 `doc/prd.md` 是否存在：

**`doc/prd.md` 不存在**：对前后端代码进行反向扫描，提取所有已实现的功能，参考 `prd-template.md` 模板生成 `doc/prd.md`，写入后展示完整内容，并告知用户"已根据代码自动生成 PRD"。然后继续部署。

**`doc/prd.md` 存在**：进行双向 review：

**正向检查（PRD → 代码）**：读取 `doc/prd.md`，逐模块检查代码是否有对应实现：
- 前端：`frontend/` 下的页面和组件是否覆盖了 PRD 中的用户操作流程
- 后端：`backend/` 下的接口是否覆盖了 PRD 中涉及的数据操作

**反向检查（代码 → PRD）**：扫描代码中实现的功能，对照 PRD 判断是否有未记录的功能：
- 前端：页面、路由、组件中是否有 PRD 未提及的功能入口
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

执行操作 1: publish（发版）。

全量模式下：Pipeline 成功才继续前端；失败则停止：
```
后端部署失败，已停止部署流程。请先修复后端问题后重新部署。
```

#### Step 3.1: 自动替换前端 BACKEND_BASE

后端部署成功后：
1. 线上后端地址固定为 `https://{appId}.qiandaomp.com`
2. 在 `frontend/` 下搜索 `BACKEND_BASE`，用 Edit 工具替换为该地址
3. 展示替换结果；找不到则提示用户手动配置

### Step 4: 部署前端服务

**仅在以下条件满足时执行**：全量模式下后端成功，或用户明确选择仅前端。

#### 前置检查 1：后端地址检查（仅"仅前端"模式执行）

搜索 `BACKEND_BASE`：
- 本地地址（`localhost`/`127.0.0.1`/`/api`）→ AskUserQuestion 询问是否切换到线上地址
  - 切换 → 线上地址固定为 `https://{appId}.qiandaomp.com`，Edit 替换
  - 保持 → 提示需确保本地服务可被外网访问
- 线上地址 → 直接继续

#### 前置检查 2：小程序关联检查

确认 `qdmp.json` 中存在 `appId`。

#### 部署步骤

```bash
pnpm run build     # 打包
qdmp-cli login     # 登录（首次）
qdmp-cli upload    # 上传
```

上传后前往 [开发者后台](https://open.qiandao.com) 提交审核。