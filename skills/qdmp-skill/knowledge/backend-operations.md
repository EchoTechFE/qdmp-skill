# 后端服务操作详情

## 通用子流程: 读取项目配置

查找 `qdmp.json`，确定 `projectRoot`：
- 优先：`frontend/qdmp.json` → `projectRoot` 为当前目录（`frontend/` 的父目录）
- 其次：当前目录的 `qdmp.json` → `projectRoot` 为当前目录
- 最后：逐级向上查找父目录中的 `qdmp.json`

读取字段：`appId`、`appSecret`、`runtime`，可选读取 `mongodb.uri`、`mongodb.database`（uri 不含 database，database 单独配置）。

**无 qdmp.json** 时：

```yaml
questions:
  - question: "未找到 qdmp.json 配置文件，如何获取？"
    header: "配置"
    multiSelect: false
    options:
      - label: "创建 qdmp.json"
        description: "在当前目录创建配置文件模板，需要填入 appId 和 appSecret"
      - label: "指定项目目录"
        description: "在其他目录查找已有的 qdmp.json"
```

创建模板：
```json
{
  "appId": "从平台获取的小程序 ID",
  "appSecret": "从平台获取的小程序密钥",
  "runtime": "go"
}
```

**appId 或 appSecret 缺失**：停止，提示用户从平台获取并填入。

**关键变量**：
- `projectRoot`：小程序根目录
- `sourceDir`：`{projectRoot}/backend/`
- `mongoUri`：`qdmp.json` 中 `mongodb.uri`（仅当存在 `mongodb` 字段时使用，操作 7 会自动写入默认值）
- `mongoDatabase`：`qdmp.json` 中 `mongodb.database`（同上）

---

## 通用子流程: 仓库初始化（publish 共用）

调用 `qdmp_gitlab_repo_exists(appId, appSecret)`：

- **不存在** → 调用 `qdmp_gitlab_init_repo(appId, appSecret, appName, runtime)`，`appName` 取 `projectRoot` 目录名
- **已存在** → 对比 `runtime`：
  - 一致 → 跳过
  - 不一致 → 重新初始化，告知用户 `runtime 已从 {旧} 切换为 {新}`

---

## 通用子流程: 本地文件打包上传（publish/diff 共用）

**参数**：`version`（publish 传实际版本号，diff 传 `temp-diff`）

**Step 1**: 打包
```bash
cd {sourceDir} && zip -r /tmp/qdmp-{appId}.zip . \
  -x '.git/*' 'node_modules/*' '__pycache__/*' 'venv/*' 'logs/*' \
  -x '.env' '.env.*' '.secret' 'credentials.json' 'secrets.yaml' \
  -x 'config.local.*' \
  -x '*.key' '*.pem' '*.p12' '*.pfx' '*.log' '*.pyc' \
  -x '.gitlab-ci.yml' '.gitignore' 'Dockerfile'
```

**Step 2**: 校验大小（必须 < 100MB）
```bash
stat -c%s /tmp/qdmp-{appId}.zip
```

**Step 3**: 上传（`baseURL` 默认 `https://openapi.qiandao.com`，若有 `.mcp.json` 则从 `qdmp-gitlab` URL 推导）
```bash
curl -s -X POST {baseURL}/gitlab-mcp/upload \
  -F "appId={appId}" \
  -F "appSecret={appSecret}" \
  -F "version={version}" \
  -F "file=@/tmp/qdmp-{appId}.zip"
```

响应 `{"message":"ok","size":...}` 为成功，否则停止。

**Step 4**: 清理
```bash
rm /tmp/qdmp-{appId}.zip
```

---

## 通用子流程: Pipeline 状态跟踪（publish/rollback 共用）

循环调用 `qdmp_gitlab_pipeline_status(appId, appSecret, version)`，间隔 10 秒，最多 60 次：

- **成功** → 展示完成信息（publish：版本号+变更统计；rollback：`vX.Y.Z → vA.B.C`）
- **失败** → 调用 `qdmp_gitlab_pipeline_logs` 获取日志，展示原因和排查建议
- **超时** → 提示 Pipeline 仍在执行，可稍后通过 status 查看

---

## 通用子流程: Schema 代码生成（操作 7 / 后端代码变更共用）

根据 `qdmp-schema.json` 和 `runtime`，在 `backend/models/` 下生成或更新 model 文件。

**前提**：`qdmp.json` 中存在 `mongodb` 配置（操作 7 会确保写入默认值，此处必然存在）。

**生成时**：从 `qdmp.json` 读取 `mongodb.uri` 和 `mongodb.database`，直接写入生成的代码中。写入的是线上地址，本地测试时由 test-deploy 自动替换为 `host.docker.internal:27017`，publish 时再自动恢复为线上地址。

### Go

`backend/models/{collection}.go`（示例 product）：
```go
package models

import (
    "time"
    "go.mongodb.org/mongo-driver/mongo"
)

type Product struct {
    ProductID   string    `bson:"productId" json:"productId"`
    Title       string    `bson:"title" json:"title"`
    Price       float64   `bson:"price" json:"price"`
    Images      []string  `bson:"images" json:"images"`
    Description string    `bson:"description,omitempty" json:"description,omitempty"`
    Category    string    `bson:"category,omitempty" json:"category,omitempty"`
    Status      string    `bson:"status" json:"status"`
    CreatedBy   string    `bson:"createdBy,omitempty" json:"createdBy,omitempty"`
    CreatedAt   time.Time `bson:"createdAt" json:"createdAt"`
    UpdatedAt   time.Time `bson:"updatedAt" json:"updatedAt"`
}

func ProductCollection(db *mongo.Database) *mongo.Collection {
    return db.Collection("products")
}
```

`backend/db/mongo.go`（若不存在则创建，将 `qdmp.json` 中的配置直接写入）：
```go
package db

import (
    "context"
    "fmt"
    "log"
    "time"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

var DB *mongo.Database

const (
    // ⚠️ Go MongoDB driver 要求：URI 包含 ? 时，? 前必须有 /database 路径
    // 若 qdmp.json 中的 uri 为 mongodb://...@host:27017?opts，需拼接为 mongodb://...@host:27017/{database}?opts
    mongoURI      = "{将 qdmp.json 的 mongodb.uri 中 ? 前插入 /{database}，如 .../echoXXX?... → .../echoXXX/echoXXX?...}"
    mongoDatabase = "{从 qdmp.json 读取的 mongodb.database}"
)

func InitMongo() error {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
    if err != nil {
        return err
    }
    DB = client.Database(mongoDatabase)
    
    // 启动时对齐索引
    if err := syncIndexes(); err != nil {
        log.Printf("Warning: failed to sync indexes: %v", err)
    }
    
    return nil
}

func syncIndexes() error {
    ctx := context.Background()
    
    // 从 qdmp-schema.json 读取索引定义（此处简化，实际需读取 schema 文件）
    schemaIndexes := map[string][]IndexDef{
        "products": {
            {Name: "idx_product_id_uniq", Keys: bson.D{{Key: "productId", Value: 1}}, Unique: true},
            {Name: "idx_created_at", Keys: bson.D{{Key: "createdAt", Value: -1}}},
            {Name: "idx_user_status_time", Keys: bson.D{{Key: "createdBy", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
        },
    }
    
    for collName, indexes := range schemaIndexes {
        coll := DB.Collection(collName)
        
        // 1. 获取现有索引
        cursor, err := coll.Indexes().List(ctx)
        if err != nil {
            return err
        }
        var existingIndexes []bson.M
        if err := cursor.All(ctx, &existingIndexes); err != nil {
            return err
        }
        
        existingNames := make(map[string]bool)
        for _, idx := range existingIndexes {
            name := idx["name"].(string)
            if name != "_id_" {
                existingNames[name] = true
            }
        }
        
        // 2. 创建 schema 中定义的索引
        schemaNames := make(map[string]bool)
        for _, idx := range indexes {
            schemaNames[idx.Name] = true
            if !existingNames[idx.Name] {
                opts := options.Index().SetName(idx.Name)
                if idx.Unique {
                    opts.SetUnique(true)
                }
                _, err := coll.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: idx.Keys, Options: opts})
                if err != nil {
                    log.Printf("Warning: failed to create index %s: %v", idx.Name, err)
                }
            }
        }
        
        // 3. 删除 schema 中不存在的索引
        for name := range existingNames {
            if !schemaNames[name] {
                if _, err := coll.Indexes().DropOne(ctx, name); err != nil {
                    log.Printf("Warning: failed to drop index %s: %v", name, err)
                }
            }
        }
    }
    
    return nil
}

type IndexDef struct {
    Name   string
    Keys   bson.D
    Unique bool
}
```

`backend/go.mod` 补充依赖（若不存在）：
```
require go.mongodb.org/mongo-driver v1.15.0
```

然后执行：
```bash
cd {sourceDir} && go mod tidy
```

### Node.js

`backend/models/{collection}.js`（示例 product.js）：
```js
const { getDb } = require('../db/mongo');

const COLLECTION = 'products';

const ProductModel = {
  collection: () => getDb().collection(COLLECTION),
  async findAll(filter = {}) { return this.collection().find(filter).toArray(); },
  async findById(productId) { return this.collection().findOne({ productId }); },
  async create(data) {
    const now = new Date();
    const doc = { ...data, createdAt: now, updatedAt: now };
    const result = await this.collection().insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },
  async update(productId, data) {
    const now = new Date();
    await this.collection().updateOne({ productId }, { $set: { ...data, updatedAt: now } });
    return this.findById(productId);
  },
  async delete(productId) { return this.collection().deleteOne({ productId }); },
};

module.exports = ProductModel;
```

`backend/db/mongo.js`（若不存在则创建，将 `qdmp.json` 中的配置直接写入）：
```js
const { MongoClient } = require('mongodb');

const mongoURI = '{从 qdmp.json 读取的 mongodb.uri}';
const mongoDatabase = '{从 qdmp.json 读取的 mongodb.database}';

let db;

async function connectMongo() {
  const client = new MongoClient(mongoURI);
  await client.connect();
  db = client.db(mongoDatabase);
  
  // 启动时对齐索引
  await syncIndexes().catch(err => console.warn('Warning: failed to sync indexes:', err));
}

async function syncIndexes() {
  // 从 qdmp-schema.json 读取索引定义（此处简化，实际需读取 schema 文件）
  const schemaIndexes = {
    products: [
      { name: 'idx_product_id_uniq', key: { productId: 1 }, unique: true },
      { name: 'idx_created_at', key: { createdAt: -1 } },
      { name: 'idx_user_status_time', key: { createdBy: 1, status: 1, createdAt: -1 } }
    ]
  };
  
  for (const [collName, indexes] of Object.entries(schemaIndexes)) {
    const coll = db.collection(collName);
    
    // 1. 获取现有索引
    const existingIndexes = await coll.indexes();
    const existingNames = new Set(
      existingIndexes.filter(idx => idx.name !== '_id_').map(idx => idx.name)
    );
    
    // 2. 创建 schema 中定义的索引
    const schemaNames = new Set(indexes.map(idx => idx.name));
    for (const idx of indexes) {
      if (!existingNames.has(idx.name)) {
        try {
          await coll.createIndex(idx.key, { name: idx.name, unique: idx.unique || false });
        } catch (err) {
          console.warn(`Warning: failed to create index ${idx.name}:`, err.message);
        }
      }
    }
    
    // 3. 删除 schema 中不存在的索引
    for (const name of existingNames) {
      if (!schemaNames.has(name)) {
        try {
          await coll.dropIndex(name);
        } catch (err) {
          console.warn(`Warning: failed to drop index ${name}:`, err.message);
        }
      }
    }
  }
}

function getDb() {
  if (!db) throw new Error('MongoDB not initialized');
  return db;
}

module.exports = { connectMongo, getDb };
```

`backend/package.json` 补充依赖（若不存在）：
```json
"mongodb": "^6.0.0"
```

然后执行：
```bash
cd {sourceDir} && npm install
```

### Python

`backend/models/{collection}.py`（示例 product.py）：
```python
from datetime import datetime, timezone
from db.mongo import get_db

COLLECTION = 'products'

def get_collection(): return get_db()[COLLECTION]
def find_all(filter=None): return list(get_collection().find(filter or {}))
def find_by_id(product_id): return get_collection().find_one({'productId': product_id})
def create(data):
    now = datetime.now(timezone.utc)
    doc = {**data, 'createdAt': now, 'updatedAt': now}
    result = get_collection().insert_one(doc)
    doc['_id'] = result.inserted_id
    return doc
def update(product_id, data):
    now = datetime.now(timezone.utc)
    get_collection().update_one({'productId': product_id}, {'$set': {**data, 'updatedAt': now}})
    return find_by_id(product_id)
def delete(product_id): return get_collection().delete_one({'productId': product_id})
```

`backend/db/mongo.py`（若不存在则创建，将 `qdmp.json` 中的配置直接写入）：
```python
import logging
from pymongo import MongoClient, ASCENDING, DESCENDING

MONGO_URI = '{从 qdmp.json 读取的 mongodb.uri}'
MONGO_DATABASE = '{从 qdmp.json 读取的 mongodb.database}'

_db = None

def init_mongo():
    global _db
    client = MongoClient(MONGO_URI)
    _db = client[MONGO_DATABASE]
    
    # 启动时对齐索引
    try:
        _sync_indexes()
    except Exception as e:
        logging.warning(f'Warning: failed to sync indexes: {e}')

def _sync_indexes():
    # 从 qdmp-schema.json 读取索引定义（此处简化，实际需读取 schema 文件）
    schema_indexes = {
        'products': [
            {'name': 'idx_product_id_uniq', 'key': [('productId', ASCENDING)], 'unique': True},
            {'name': 'idx_created_at', 'key': [('createdAt', DESCENDING)]},
            {'name': 'idx_user_status_time', 'key': [('createdBy', ASCENDING), ('status', ASCENDING), ('createdAt', DESCENDING)]},
        ]
    }
    
    for coll_name, indexes in schema_indexes.items():
        coll = _db[coll_name]
        
        # 1. 获取现有索引
        existing = {idx['name'] for idx in coll.list_indexes() if idx['name'] != '_id_'}
        
        # 2. 创建 schema 中定义的索引
        schema_names = {idx['name'] for idx in indexes}
        for idx in indexes:
            if idx['name'] not in existing:
                try:
                    coll.create_index(idx['key'], name=idx['name'], unique=idx.get('unique', False))
                except Exception as e:
                    logging.warning(f"Warning: failed to create index {idx['name']}: {e}")
        
        # 3. 删除 schema 中不存在的索引
        for name in existing:
            if name not in schema_names:
                try:
                    coll.drop_index(name)
                except Exception as e:
                    logging.warning(f'Warning: failed to drop index {name}: {e}')

def get_db():
    if _db is None:
        raise RuntimeError('MongoDB not initialized')
    return _db
```

`backend/requirements.txt` 补充（若不存在）：
```
pymongo==4.7.3
```

完成后提示：
```
数据模型已生成完毕。

  qdmp-schema.json  → 数据定义（所有后端代码的唯一数据来源）
  backend/models/   → 各 collection 的操作封装
  backend/db/       → 数据库连接初始化（配置已从 qdmp.json 写入）

数据库连接信息已从 frontend/qdmp.json 读取并写入后端代码。
如需修改连接信息，请更新 qdmp.json 后重新生成代码。
```

---

## 操作 1: publish（发版）

**Step 1**: 读取项目配置

**Step 2**: 代码合规检查
- 确认 `backend/` 存在且非空
- 扫描端口号，必须为 8080，不是则自动修改
- 检查敏感文件（`backend/.env` 等），有则警告
- **Go**：有外部依赖时检查 `go.sum` 是否存在，不存在则停止提示执行 `go mod tidy`
- **Node.js**：检查 `package-lock.json` 是否存在，不存在则停止提示执行 `npm install`
- **Python**：检查 `requirements.txt` 中是否有与 Python 3.12 明显不兼容的版本约束，有则提示修正
- **MongoDB URI 检查**（仅当 `qdmp.json` 存在 `mongodb` 字段时）：
  - 在 `backend/db/` 下搜索 `MONGO_URI` / `mongoURI` 常量
  - 若值包含 `localhost`、`127.0.0.1` 或 `host.docker.internal` → 自动替换为 `qdmp.json` 中的线上 URI
  - 替换后提示：`数据库连接已恢复为线上配置`
  - **Go runtime 专项检查**：Go 的 MongoDB driver 严格要求 URI 格式，若 URI 含 `?` 查询参数，则 `?` 前必须有 `/database` 路径，否则 driver 报 `must have a / before the query ?` 导致 Pod 启动即崩溃。
    - 检测规则：URI 包含 `?` 且 `?` 之前没有第三个 `/`（即缺少 `/database` 段）→ **自动修复**：在 `?` 前插入 `/{mongoDatabase}`
    - 错误格式：`mongodb://user:pass@host:27017?retryWrites=true`
    - 正确格式：`mongodb://user:pass@host:27017/database?retryWrites=true`
- **不检查** `.gitlab-ci.yml` 和 `Dockerfile`（由 MCP Server 自动生成）

**Step 3**: 执行"仓库初始化"子流程

**Step 3.5**: Pipeline 冲突检查（**强制，禁止跳过**）
- 调用 `qdmp_gitlab_list_versions(appId, appSecret)` 获取最新版本号
- 若存在最新版本，调用 `qdmp_gitlab_pipeline_status(appId, appSecret, latestVersion)` 检查其状态
- 若状态为 `running` / `pending` / `waiting_for_resource`：**停止发版**，提示：
  ```
  ⚠️  当前版本 {version} 的 Pipeline 正在运行中（{status}），请等待其完成后再发版。
  可通过「查看版本」或「查看日志」跟踪进度。
  ```
- 若状态为 `failed` / `success` / 无版本 → 继续

**Step 4**: 获取版本号（必须交互确认，禁止自动决定）
- 调用 `qdmp_gitlab_list_versions(appId, appSecret)`
- 无历史版本 → 推荐 v1.0.0；有历史版本 → 推算 patch/minor/major 候选

```yaml
questions:
  - question: "请指定版本号。\n\n当前最新: v1.2.3\n"
    header: "版本号"
    multiSelect: false
    options:
      - label: "v1.2.4"
        description: "Patch +1（Bug 修复）"
      - label: "v1.3.0"
        description: "Minor +1（新功能）"
      - label: "v2.0.0"
        description: "Major +1（重大变更）"
      - label: "自定义"
        description: "手动输入 vX.Y.Z"
```

自定义时校验：格式 `vX.Y.Z`、不与已有版本重复、低于最新版本需二次确认。

**Step 5**: 生成变更摘要
- 执行"本地文件打包上传"（`version=temp-diff`）
- 调用 `qdmp_gitlab_diff(appId, appSecret)` 展示变更统计

**Step 6**: 填写发版说明（可跳过，跳过时基于 diff 自动生成）

**Step 7**: 二次确认

```yaml
questions:
  - question: "确认发版？\n\n版本: v1.2.4\n说明: 新增用户个人资料页面\n变更: 8 个文件 (+59 -17)"
    header: "确认"
    multiSelect: false
    options:
      - label: "确认发版"
        description: "提交代码并触发构建部署"
      - label: "取消"
        description: "放弃本次发版"
```

**Step 8**: 执行发版
- 执行"本地文件打包上传"（`version=实际版本号`）
- 调用 `qdmp_gitlab_publish(appId, appSecret, version, description)`

**Step 9**: 执行"Pipeline 状态跟踪"子流程

**Step 10**: 展示发版结果

```
后端发版成功

  版本:     v{version}
  服务地址: https://{appId}.qiandaomp.com
```

---

## 操作 2: versions（查看版本历史）

**Step 1**: 读取项目配置

**Step 2**: 并行调用
- `qdmp_gitlab_list_versions(appId, appSecret)`
- `qdmp_k8s_deployed_version(appId, appSecret)` → 标注 `◀ 运行中`

**Step 3**: 格式化展示
```
版本历史

  v1.2.4  2026-03-11  部署成功
  新增用户个人资料页面

  v1.2.3  2026-03-05  部署成功  ◀ 运行中
  修复商品列表翻页时闪白问题
```

**Step 4**: 可选查看详情 → 调用 `qdmp_gitlab_get_version(appId, appSecret, version)`

---

## 操作 3: rollback（版本回滚）

**Step 1**: 读取项目配置

**Step 2**: 调用 `qdmp_k8s_deployed_version` 展示当前版本

**Step 3**: 调用 `qdmp_gitlab_list_versions`，AskUserQuestion 让用户选择目标版本（排除当前版本）

**Step 4**: 二次确认，明确展示 `vX.Y.Z → vA.B.C`

**Step 5**: 调用 `qdmp_gitlab_rollback(appId, appSecret, version)`

**Step 6**: 执行"Pipeline 状态跟踪"子流程

---

## 操作 4: logs（查看服务日志）

**Step 1**: 读取项目配置

**Step 2**: 调用 `qdmp_k8s_deployed_version` 展示当前版本

**Step 3**: AskUserQuestion 选择日志类型和时间范围

日志类型：
```yaml
options:
  - label: "启动/运行日志 (Recommended)"
    description: "查看实例启动和运行时的输出日志，适合排查启动失败"
  - label: "请求日志"
    description: "查看 HTTP 请求调用日志，适合排查接口异常"
  - label: "错误日志"
    description: "仅查看包含 error/panic/fatal 的日志"
```

时间范围：最近 30 分钟（推荐）/ 1 小时 / 24 小时 / 自定义

**Step 4**: 调用 `qdmp_k8s_logs(appId, appSecret, type, duration)`
- 启动/运行日志 → `type="startup"`
- 请求日志 → `type="all"`
- 错误日志 → `type="error"`

**Step 5**: 如有明显错误（端口占用、依赖缺失、启动超时），自动总结原因

---

## 操作 5: status（查看部署状态）

**Step 1**: 读取项目配置

**Step 2**: 并行调用
- `qdmp_k8s_deployed_version` → 当前部署版本 + 部署时间
- `qdmp_gitlab_list_versions` → 最新发布版本

**Step 3**: 对比展示
```
部署状态

  当前部署: v1.2.3  (2026-03-05 部署)
  最新版本: v1.2.4  (2026-03-11 发布)
  状态: 已回滚（当前部署版本落后于最新版本）
```

状态判断：一致 → "运行中（最新版本）"；落后 → "已回滚"；无部署 → "未部署"

> 服务访问地址固定为 `{appId}.qiandaomp.com`，无需额外查询。

---

## 操作 6: test-deploy（本地后端测试环境）

本地环境为 Debian 12 容器（已安装 Go、Node.js 或 Python）。

**Step 1**: 读取项目配置

**Step 2**: 运行时检测
- 优先读 `qdmp.json` 中的 `runtime`
- 未指定则扫描特征文件：`go.mod` → go，`package.json` → nodejs22，`requirements.txt`/`pyproject.toml` → python312
- 都没匹配 → 提示用户在 `qdmp.json` 中显式指定

**Step 3**: 入口文件检测与启动命令

| Go | 启动命令 |
|---|---|
| 存在 `go.mod` | `go run .` |
| 存在 `main.go` | `go run main.go` |

| Node.js（优先级从高到低） | 启动命令 |
|---|---|
| `package.json` 有 `scripts.start` | `npm start` |
| 有 `scripts.dev` | `npm run dev` |
| 有 `main` 字段 | `node {main}` |
| 存在 `index.js` / `app.js` / `server.js` | `node {file}` |

| Python（优先级从高到低） | 启动命令 |
|---|---|
| `pyproject.toml` 有启动说明 | 使用项目已有命令 |
| 存在 `app.py` | `python3 app.py` |
| 存在 `server.py` | `python3 server.py` |
| 存在 `manage.py` | `python3 manage.py runserver 0.0.0.0:8080` |

**Step 4**: 数据库连接配置（仅当 `qdmp.json` 存在 `mongodb` 字段时执行）

**Step 4.1**: 检查宿主机数据库是否可达

容器内通过 `host.docker.internal:27017` 访问宿主机数据库。检查连通性：
```bash
timeout 5 bash -c 'cat < /dev/null > /dev/tcp/host.docker.internal/27017' 2>/dev/null
```
- 连接失败则停止，提示：
```
⚠️  无法连接到宿主机数据库 (host.docker.internal:27017)

请确保宿主机数据库容器已启动：

如果容器已存在（用 start-qdmp.sh 启动过）：
  docker start mongodb

如果容器不存在，重新创建：
  docker run -d --name mongodb -p 27017:27017 \
    -v mongodb-data:/data/db \
    mongo:8.0

如果需要自定义用户名密码：
  docker run -d --name mongodb -p 27017:27017 \
    -v mongodb-data:/data/db \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=yourpassword \
    mongo:8.0
```

**Step 4.2**: 确保测试用户存在且权限正常

从 `qdmp.json` 的 `mongodb.uri` 解析出 `username`、`password`，从 `mongodb.database` 读取 `database`。

容器内无 `mongosh`，使用 Python 标准库直接通过 wire protocol 创建用户（无需安装任何额外软件）：

```bash
python3 - <<'EOF'
import socket, struct

def encode_cstring(s):
    return s.encode() + b'\x00'

def encode_doc(d):
    body = b''
    for k, v in d.items():
        if isinstance(v, bool):
            body += b'\x08' + encode_cstring(k) + struct.pack('B', 1 if v else 0)
        elif isinstance(v, int):
            body += b'\x10' + encode_cstring(k) + struct.pack('<i', v)
        elif isinstance(v, str):
            s = v.encode()
            body += b'\x02' + encode_cstring(k) + struct.pack('<I', len(s)+1) + s + b'\x00'
        elif isinstance(v, list):
            arr = {str(i): item for i, item in enumerate(v)}
            body += b'\x04' + encode_cstring(k) + encode_doc(arr)
        elif isinstance(v, dict):
            body += b'\x03' + encode_cstring(k) + encode_doc(v)
    body += b'\x00'
    return struct.pack('<I', len(body)+4) + body

def build_op_msg(doc):
    doc_bytes = encode_doc(doc)
    payload = struct.pack('<I', 0) + b'\x00' + doc_bytes
    total = 16 + len(payload)
    header = struct.pack('<IIII', total, 1, 0, 2013)
    return header + payload

def recv_msg(sock):
    header = b''
    while len(header) < 4:
        header += sock.recv(4 - len(header))
    total = struct.unpack('<I', header)[0]
    data = header
    while len(data) < total:
        data += sock.recv(total - len(data))
    return data

try:
    s = socket.create_connection(('host.docker.internal', 27017), timeout=5)
    msg = build_op_msg({
        'createUser': '{username}',
        'pwd': '{password}',
        'roles': [{'role': 'dbOwner', 'db': '{database}'}],
        '$db': '{database}'
    })
    s.sendall(msg)
    resp = recv_msg(s)
    s.close()
    if b'already exists' in resp:
        print('User already exists, skipping')
    elif b'\xf0\x3f' in resp:
        print('User created successfully')
    else:
        print('Failed, unexpected response:', resp.hex())
        exit(1)
except Exception as e:
    print(f'Failed: {e}')
    exit(1)
EOF
```

如果数据库启用了认证（启动时设置了 `MONGO_INITDB_ROOT_USERNAME`），需要先完成 SASL 认证再执行 createUser。此时提示用户：
```
⚠️  数据库已启用认证，需要 root 账号来创建业务用户。
请提供启动数据库时设置的 MONGO_INITDB_ROOT_USERNAME 和 MONGO_INITDB_ROOT_PASSWORD。
```

获取到 root 账号后，改用以下方式连接（通过 URI 传入认证信息，需后端项目有 `mongodb` npm 包时用 node，否则继续用 python3 带认证的 wire protocol）：

Node.js 方式（后端为 Node.js 项目时优先使用）：
```bash
cd {sourceDir} && node -e "
const { MongoClient } = require('mongodb');
(async () => {
  const client = new MongoClient('mongodb://{root_user}:{root_password}@host.docker.internal:27017/admin');
  try {
    await client.connect();
    await client.db('{database}').command({
      createUser: '{username}',
      pwd: '{password}',
      roles: [{ role: 'dbOwner', db: '{database}' }]
    });
    console.log('User created');
  } catch(e) {
    if (e.code === 51003 || /already exists/.test(e.message)) {
      console.log('User already exists, skipping');
    } else {
      console.error('Failed:', e.message); process.exit(1);
    }
  } finally { await client.close(); }
})();
"
```

**Step 4.3**: 替换后端代码中的 MongoDB URI 为容器测试地址

在 `backend/db/` 下搜索 `MONGO_URI` / `mongoURI` 常量，用 Edit 工具将值替换为：

- **Go runtime**（⚠️ Go driver 要求 URI 含 `?` 时必须有 `/database` 路径）：
  ```
  mongodb://{username}:{password}@host.docker.internal:27017/{database}?authSource={database}
  ```
- **Node.js / Python runtime**：
  ```
  mongodb://{username}:{password}@host.docker.internal:27017?authSource={database}
  ```

username、password 从 `qdmp.json` 的 `mongodb.uri` 解析，database 从 `mongodb.database` 读取（代码中 `mongoDatabase` / `MONGO_DATABASE` 变量保持不变，仍读自 `qdmp.json`）。

**Step 5**: 清理 8080 端口
```bash
lsof -ti :8080 && kill -9 $(lsof -ti :8080) || true
```

**Step 6**: 环境变量文件检测（优先 `.env.local`，其次 `.env.test`）

**Step 7**: 后台启动服务（`run_in_background: true`）

**Step 8**: 健康检查（等待 5 秒后轮询，最多 5 次，间隔 2 秒，HTTP 200/404 视为通过）

失败时提示：
```
⚠️  服务启动超时（15 秒内未响应）
可能原因：启动较慢、未监听 8080、启动失败、依赖未安装
```

**Step 9**: 自动替换前端 `BACKEND_BASE` 为 `/api`
- 在 `frontend/` 下搜索含 `BACKEND_BASE` 的文件
- 用 Edit 工具替换值为 `/api`
- 找不到则提示用户手动配置

**Step 10**: 展示结果（后端地址、运行时、数据库状态、环境变量状态、BACKEND_BASE 替换结果）

---

## 操作 7: schema（数据建模）

**前置检查**：检查 `qdmp.json` 是否存在 `mongodb` 字段。不存在则 AskUserQuestion 询问数据库密码：

```yaml
questions:
  - question: "数据建模需要配置数据库。请提供数据库密码（如果还没有，请到 https://open.qiandao.com 获取）"
    header: "数据库配置"
    multiSelect: false
    options:
      - label: "我有密码"
        description: "输入数据库密码"
      - label: "我还没有，先去获取"
        description: "前往千岛开放平台获取数据库配置"
```

- 选择"我有密码" → 用户输入密码后，向 `qdmp.json` 写入默认配置（`{appId}` 和 `{password}` 替换为实际值）：

```json
{
  "mongodb": {
    "uri": "mongodb://{appId}:{password}@{appId}.mongodb.rds.qiandaomp.com:27017?retryWrites=true&authSource={appId}",
    "database": "{appId}"
  }
}
```

写入后提示：`已写入数据库配置。如需使用其他配置，请修改 qdmp.json 后重新执行。`

- 选择"我还没有，先去获取" → 停止操作，提示：`请前往 https://open.qiandao.com 获取数据库配置后，重新执行数据建模。`

然后继续 Step 0。

**Step 0**: 检查是否已有 PRD

用 Read 工具尝试读取 `{projectRoot}/doc/prd.md`：

**PRD 存在** → 读取内容，从中抽取所有业务对象、关键信息、状态流转、对象关系，以数据卡片格式逐一展示（格式见流程 C Step 3），然后 AskUserQuestion 确认：

```yaml
questions:
  - question: "以上是从 PRD 中提取的数据对象，是否正确？有需要新增、修改或删除的吗？"
    header: "确认数据对象"
    multiSelect: false
    options:
      - label: "正确，继续生成"
        description: "按此列表生成数据模型代码"
      - label: "需要调整"
        description: "告诉我哪里需要新增、修改或删除"
```

- 选择"正确，继续生成" → 直接执行流程 C Step 4（生成 `qdmp-schema.json`）和 Step 5（Schema 代码生成）
- 选择"需要调整" → 根据用户说明，进入对应流程：新增对象走流程 A，修改现有对象走流程 B，重新设计走流程 C

**PRD 不存在** → 提示用户建议先完成 PRD 设计（流程二）再进行数据建模；用户坚持跳过则询问操作类型：

```yaml
questions:
  - question: "你想做什么？"
    header: "操作类型"
    multiSelect: false
    options:
      - label: "新增对象"
        description: "添加新的数据对象"
      - label: "修改现有对象"
        description: "给已有对象添加/删除信息"
      - label: "重新设计"
        description: "从头开始重新设计所有数据模型（⚠️ 会删除现有定义，但不影响数据库中的实际数据）"
```

根据选择进入对应流程 A/B/C。

**融合规则**：最终设计 = PRD 抽取结果 + 用户口头补充，冲突时以用户最新确认为准。

---

### 流程 A: 新增对象

**Step 1**: 用业务语言询问新对象的用途
> "你想新增什么内容？用户会用它来做什么？"

**Step 2**: 追问业务细节（不让用户回答字段名、类型等技术问题）

**重要**：
1. 当用户提到图片、视频、文件等内容时，引导使用 OSS 存储
2. **必须追问唯一标识**：每个对象都需要一个唯一标识字段，用于关联

```
关于「评论」，我想多了解一下：
1. 一条评论里用户会填写/看到哪些内容？（比如文字、图片、评分？）
2. 评论会有哪些状态？（比如"正常显示"、"已删除"）
3. 评论是针对什么的？（商品？用户？）
4. 你们内部管理时，会用什么来标识一条评论？（比如自动生成编号、还是有业务流水号？）

💡 提示：
- 如果评论包含图片，图片会存储在云端（OSS），数据库只保存图片地址
- 唯一标识用于在其他地方引用这条评论，系统会自动生成（如果你有业务编号规则，也可以按你的规则设置）
```

**Step 3**: 展示数据卡片确认
```
💬 评论（Comment）
─────────────────
唯一标识：commentId（自动生成）

信息：
  • 内容（文字）
  • 图片地址（文字，存储 OSS URL）
  • 评分（1-5星）

关联：
  • 属于某个「商品」（通过商品的 productId）
  • 由某个「用户」发布（通过用户的 openId）
```

**Step 4**: 追加到 `qdmp-schema.json`，执行"Schema 代码生成"子流程

### 流程 B: 修改现有对象

**Step 1**: 列出现有对象让用户选择

读取 `qdmp-schema.json`，展示所有对象：
```yaml
questions:
  - question: "你想修改哪个对象？"
    header: "选择对象"
    multiSelect: false
    options:
      - label: "商品"
        description: "用户发布的二手商品"
      - label: "订单"
        description: "购买记录"
      - label: "用户"
        description: "发布者和购买者"
```

**Step 2**: 用业务语言确认修改目标（不要求用户描述字段结构）
> "你希望「商品」有什么变化？例如：想新增哪些信息、去掉哪些信息，或者调整哪些状态/流程？"

**Step 3**: 根据用户描述更新对象定义

展示修改前后对比：
```
📦 商品（修改前）
─────────────────
信息：
  • 标题（文字）
  • 价格（金额）
  • 图片（最多9张）

📦 商品（修改后）
─────────────────
信息：
  • 标题（文字）
  • 价格（金额）
  • 图片（最多9张）
  • 库存数量（数字）← 新增
  • 发货地址（文字）← 新增
```

**Step 4**: 更新 `qdmp-schema.json`，执行"Schema 代码生成"子流程

### 流程 C: 重新设计（首次建模或完全重做）

**⚠️ 重要说明**：
- 重新设计会覆盖 `qdmp-schema.json` 和 `backend/models/`、`backend/db/` 目录
- **数据库中的实际数据不会被删除**，但如果新设计中删除了某些对象或字段，对应的数据将无法通过新代码访问
- 如果 `backend/routes/` 或 `backend/services/` 中有依赖旧 model 的业务代码，会根据新的数据模型自动调整这些代码

**Step 1**: 引导用户用业务语言描述需求（不使用集合/字段/类型等术语）
> "先不用管技术实现。你这个功能里，用户会创建/查看/修改哪些内容？每种内容大概要记录什么信息？"

**Step 2**: 基于用户描述，自动拆解为数据对象并做确认（由 AI 提案，不要求用户命名集合）

```yaml
questions:
  - question: "我先按你的业务描述拆成这几类数据，是否正确？\n\n• 商品：用户发布的物品\n• 订单：购买记录\n• 用户：发布者和购买者\n\n如果有不对或缺失，你直接用业务话补充即可。"
    header: "确认数据"
    multiSelect: false
    options:
      - label: "正确，继续"
        description: "按此列表继续设计"
      - label: "需要调整"
        description: "我来补充或删减"
```

**Step 3**: 逐对象追问细节（继续使用业务语言，不让用户回答技术字段定义）

**重要**：
1. 当用户提到图片、视频、文件等内容时，引导使用 OSS 存储
2. **必须追问唯一标识**：每个对象都需要一个唯一标识字段，用于关联

示例追问：
```
关于「商品」，我想多了解一下：
1. 用户发布一件商品时，会填写哪些内容？（比如名称、价格、图片？）
2. 商品会有哪些状态？（比如"在售"、"已售出"）
3. 商品需要分类吗？用户会按分类筛选吗？
4. 你们内部管理时，会用什么来标识一件商品？（比如自动生成编号、还是有货号/SKU？）

💡 提示：
- 如果商品包含图片，图片会存储在云端（OSS），数据库只保存图片地址
- 唯一标识用于在其他地方引用这个商品，系统会自动生成（如果你有业务编号规则，也可以按你的规则设置）
```

每个对象确认后展示数据卡片：
```
📦 商品（Product）
─────────────────
唯一标识：productId（自动生成）

信息：
  • 标题（文字）
  • 价格（金额）
  • 图片地址（文字数组，存储 OSS URL，最多9张）
    通过千岛开放平台 openapi 上传后获得的地址
  • 描述（文字，可选）
  • 分类（从列表选择）

状态：在售 / 已售出 / 已下架

关联：
  • 属于某个「用户」（通过用户的 openId）
```

**Step 4**: 生成 `{projectRoot}/qdmp-schema.json`

```json
{
  "version": "1.0",
  "updatedAt": "2026-04-01",
  "collections": {
    "Product": {
      "label": "商品",
      "description": "用户发布的二手商品",
      "uniqueKey": "productId",
      "fields": {
        "productId": { "label": "商品ID", "type": "string", "required": true, "unique": true, "auto": "uuid" },
        "title": { "label": "标题", "type": "string", "required": true },
        "price": { "label": "价格", "type": "number", "required": true },
        "images": { "label": "图片地址", "type": "string[]", "format": "oss-url", "maxLength": 9 },
        "description": { "label": "描述", "type": "string" },
        "category": { "label": "分类", "type": "string", "enum": ["数码", "服装", "家居"] },
        "status": { "label": "状态", "type": "string", "enum": ["on_sale", "sold", "off_shelf"], "default": "on_sale" },
        "createdBy": { "label": "发布者", "type": "ref", "ref": "User", "refKey": "openId" },
        "createdAt": { "label": "创建时间", "type": "date", "auto": true },
        "updatedAt": { "label": "更新时间", "type": "date", "auto": true }
      }
    },
    "User": {
      "label": "用户",
      "description": "小程序用户",
      "uniqueKey": "openId",
      "fields": {
        "openId": { "label": "用户标识", "type": "string", "required": true, "unique": true },
        "nickname": { "label": "昵称", "type": "string" },
        "avatar": { "label": "头像", "type": "string", "format": "oss-url" },
        "createdAt": { "label": "创建时间", "type": "date", "auto": true },
        "updatedAt": { "label": "更新时间", "type": "date", "auto": true }
      }
    }
  }
}
```

**字段类型说明**：
- `type: "string"` - 普通文本
- `type: "string[]"` - 文本数组
- `type: "string[]", "format": "oss-url"` - OSS 文件地址数组（图片、视频、文件等），通过千岛开放平台 openapi 上传后获得的地址
- `type: "number"` - 数字
- `type: "date"` - 日期时间
- `type: "ref"` - 关联其他对象，通过 `refKey` 指定关联字段（不使用 ObjectId）

**唯一标识字段**：
- 每个对象必须有 `uniqueKey` 指定唯一标识字段
- 唯一标识字段必须设置 `unique: true`
- 可以设置 `auto: "uuid"` 自动生成，或由用户提供
- 用户对象的 `openId` 由千岛平台提供，不需要自动生成

每个对象自动加入 `createdAt`、`updatedAt`（`auto: true`），无需用户指定。

**索引识别规则**：

根据字段角色自动推导索引，无需用户指定：

| 字段特征 | 索引类型 | 示例 |
|---|---|---|
| `uniqueKey` 字段 | 唯一索引 | `productId`, `openId` |
| `type: "ref"` 字段 | 普通索引 | `createdBy` |
| `createdAt` | 普通索引（倒序） | 列表分页排序 |

在追问阶段通过以下问题识别复合索引和额外索引：

1. **"这个对象最常按什么条件查列表？"** → 高频过滤字段 + `createdAt` 组成复合索引
2. **"是否经常看某个用户/某个上级对象下的数据？"** → 确认 ref 字段索引
3. **"哪些字段必须全局唯一？"** → 额外唯一索引

常见复合索引模式：
- 某用户的对象列表：`(createdBy, status, createdAt)`
- 分类筛选列表：`(category, status, createdAt)`
- 某对象下的子列表：`(productId, createdAt)`

**索引合并规则**：收集所有候选索引后，对单字段索引做裁剪：
- 若已有复合索引以该字段开头，则单字段索引可省略（最左前缀覆盖）
- `unique: true` 的索引无论如何保留（唯一约束语义不可替代）

例如：已有 `(createdBy, status, createdAt)` → `createdBy` 单字段索引删除；`productId` 唯一索引保留。

**不建索引**：低区分度字段（布尔、2-3个枚举值）单独建索引、很少作为查询条件的字段。

**索引命名规范**：
- 格式：`idx_{字段简写}[_uniq]` 或 `idx_{关键词}_{hash6}`
- 全小写，下划线分隔
- 单字段：`idx_product_id`, `idx_created_at`
- 复合索引：`idx_user_status_time`（取关键词，不完整拼接字段名）
- 唯一索引可选加 `_uniq` 后缀
- 长度不超过 64 字符
- 冲突处理：若关键词重名但字段定义不同，追加 6 位哈希后缀（如 `idx_user_status_a1b2c3`），哈希来源为索引定义的规范化字符串（字段+方向+unique）

**索引自动对齐机制**（启动时执行）：
1. 读取数据库中已有索引（`listIndexes`）
2. 和 schema 定义对比：
   - schema 有、数据库没有 → `createIndex`
   - schema 没有、数据库有（且不是 `_id` 默认索引）→ `dropIndex`
   - 两边都有但定义不同（字段、方向、unique 变了）→ 先 `dropIndex` 再 `createIndex`
3. 失败处理：任何步骤失败只打印警告日志，不阻断服务启动

在 `qdmp-schema.json` 中用 `indexes` 字段记录：
```json
"Product": {
  "indexes": [
    { "name": "idx_product_id_uniq", "fields": { "productId": 1 }, "unique": true },
    { "name": "idx_created_at", "fields": { "createdAt": -1 } },
    { "name": "idx_user_status_time", "fields": { "createdBy": 1, "status": 1, "createdAt": -1 } }
  ]
}
```

**Step 5**: 执行"Schema 代码生成"子流程

**Step 6**: PRD 同步（可选）

检查 `{projectRoot}/doc/prd.md` 是否存在：

- **存在**：直接根据本次建模结果，更新 `doc/prd.md` 中"数据关系"和各模块的"涉及的数据"章节，保留其他内容不变。更新完成后展示完整的 `doc/prd.md` 内容，并说明本次更新了哪些章节。

- **不存在**：跳过，不生成 PRD（用户可通过流程二单独完成 PRD 设计）。