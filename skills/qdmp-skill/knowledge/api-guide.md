# 千岛开放平台 HTTP API 指南（QDMP）

本文档说明千岛小程序如何通过 **`https://openapi.qiandao.com`** 调用开放平台 HTTP 接口，字段定义以各服务 Swagger 为准。与 [development-guide.md](./development-guide.md) 中的 `fetch` + 网关调用方式一致。

与 **[SKILL.md](../SKILL.md)** 的关系：

- **Step 0** 会从项目根目录的 **`qdmp.json`** 读取 `appId`、`appSecret`，用于小程序发版、MCP 等流程；调用 **Auth `/auth/v1/token`** 时通常也使用平台下发的同一套应用凭证（是否完全一致以开放平台说明为准）。
- Skill 中的 **publish / upload / 回滚** 等操作**不会**自动替你调开放平台业务 API；联调接口属于开发任务，由你在前端或 `backend/` 内发起请求。
- 用户未明确要求发版、部署时，助手**不得**因「写了 API 调用代码」而自动触发 Skill 里的部署流程（见 SKILL 中「后端服务操作路由」与操作触发约束）。

---

## 安全说明

- **切勿**将真实 `appSecret`、`refreshToken`、`accessToken` 写入仓库、截图或公开文档。
- 下文 curl 中一律使用占位符（如 `<appSecret>`、`<token>`）。Postman「Copy as cURL」常带 `User-Agent`、`Postman-Token`、`Cookie` 等，**线上或脚本中通常只需 `Content-Type` + 必要 Header + Body**。

---

## 1. 文档与基址

**网关基址（小程序侧）**：`https://openapi.qiandao.com`
**路径**：与各接口文档中 `paths` 一致，直接拼在基址后。

---

## 2. 认证 Auth

**Content-Type**：`application/json`  
Swagger 中 Auth 的 `securityDefinitions` 为 `access_token` Header；**换票接口本身**一般只需 Body，无需 Bearer。

### 2.1 获取 Token

**POST** `/auth/v1/token`

**请求体** `authTokenRequest`（字段均为必填）：

| 字段        | 说明                                                       |
| ----------- | ---------------------------------------------------------- |
| `appId`     | 应用 ID（可与 `qdmp.json` 中 `appId` 对应，以平台为准）    |
| `appSecret` | 应用密钥（与 `qdmp.json` 中 `appSecret` 对应，以平台为准） |
| `code`      | 授权码；开发/测试场景下平台可能有约定取值，以文档为准      |
| `grantType` | `CLIENT_CREDENTIALS` 或 `AUTHORIZATION_CODE`               |

**响应** `authTokenResponse`：`code`、`message`、`requestId`；成功时 `data` 含 `accessToken`、`expiresAt`（**秒级时间戳**）、`refreshToken`、`openId`。

**业务错误码（节选）**：`10001` app_id 无效；`10002` 密钥不匹配；`10003` 授权码错误；`10004` 认证类型不支持。

**curl 最小示例**（将占位符换成你自己的凭证，**勿提交真实值**）：

```bash
curl 'https://openapi.qiandao.com/auth/v1/token' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-raw '{
  "appId": "<appId>",
  "appSecret": "<appSecret>",
  "code": "<authorization_code>",
  "grantType": "AUTHORIZATION_CODE"
}'
```

从 Postman 导出时可能多出 `User-Agent`、`Accept`、`Cookie` 等，可按需删除，**核心仍是 URL、POST、`Content-Type` 与 JSON Body**。

### 2.2 刷新 Token

**POST** `/auth/v1/refresh`

**请求体**：`{ "refreshToken": "<refreshToken>" }`

**响应**：`data` 含新的 `accessToken`、`expiresAt`（秒）。错误码节选：`10007`、`10008`。

```bash
curl 'https://openapi.qiandao.com/auth/v1/refresh' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-raw '{
  "refreshToken": "<refreshToken>"
}'
```

---

## 3. 业务 API 请求头

User、Lifestyle、Library 等网关在 Swagger 中常要求：

| Header                | 说明                                                              |
| --------------------- | ----------------------------------------------------------------- |
| `access-token`        | 访问令牌（与 Auth 返回的 `accessToken` 一致，具体以网关实现为准） |
| `x-echo-qdmp-version` | 小程序/运行时版本，与宿主或平台约定一致                           |

不少环境也支持：

```http
Authorization: Bearer <accessToken>
```

**建议**：与线上一致；若 401，再尝试改为 `access-token` Header 或补全 `x-echo-qdmp-version`。

下文 **Library** 示例采用与线上一致的 **`Authorization: Bearer`**；**User / Mark** 示例同时给出 **`access-token` + `x-echo-qdmp-version`**（与 Swagger 一致）。

---

## 4. Library：SPU / Tag

**响应壳**（Library）：`code`（**string**，`"0"` 表示成功）、`message`、`data`、`requestId`。

### 4.1 GET `/spu/v1/detail`

| Query | 必填 | 说明                      |
| ----- | ---- | ------------------------- |
| `id`  | 是   | SPU ID（string / uint64） |

**data**：`spu` → `librarySpu`（`id`、`name`、`image`、`whiteBgPng`、`typeId`、`typeName`、`wishCount`、`markCount`、`wishCount3day`、`markCount3day`、`entryProfileItems` 等）。

```bash
curl 'https://openapi.qiandao.com/spu/v1/detail?id=978074656223267833' \
  -H 'Authorization: Bearer <token>'
```

### 4.2 GET `/spu/v1/search`

| Query              | 必填 | 说明                           |
| ------------------ | ---- | ------------------------------ |
| `keyword`          | 否   | 关键词                         |
| `ipTag`            | 否   | IP Tag ID                      |
| `typeId`           | 否   | 类目 ID                        |
| `offset` / `limit` | 否   | 分页；**offset + limit ≤ 100** |

**data**：`items`（`librarySpuItem[]`）、`totalCount`。

```bash
curl 'https://openapi.qiandao.com/spu/v1/search?keyword=前方高能&ipTag=305&typeId=15&offset=0&limit=10' \
  -H 'Authorization: Bearer <token>'
```

（关键词含中文时，若 shell 乱码可对 URL 做 UTF-8 百分号编码。）

### 4.3 GET `/tag/v1/detail`

| Query | 必填 | 说明   |
| ----- | ---- | ------ |
| `id`  | 是   | Tag ID |

**data**：`tag` → `openapilibraryTag`（含 `island` 等）。

```bash
curl 'https://openapi.qiandao.com/tag/v1/detail?id=101' \
  -H 'Authorization: Bearer <token>'
```

### 4.4 GET `/tag/v1/search`

| Query              | 必填 | 说明                     |
| ------------------ | ---- | ------------------------ |
| `typeId`           | 否   | Tag 类目                 |
| `keyword`          | 否   | 关键词                   |
| `offset` / `limit` | 否   | **offset + limit ≤ 100** |

```bash
curl 'https://openapi.qiandao.com/tag/v1/search?keyword=labubu&typeId=2&offset=0&limit=10' \
  -H 'Authorization: Bearer <token>'
```

### 4.5 POST `/tag/v1/follow`

关注 Tag（当前登录用户）。

**operationId**：`LibraryService_FollowTag`

**请求体**：`libraryFollowTagRequest`（必填，具体字段以 Library Swagger 定义为准）。

**响应**：`libraryFollowTagResponse`；异常响应为 `rpcStatus`。

```bash
curl 'https://openapi.qiandao.com/tag/v1/follow' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  --data-raw '<libraryFollowTagRequest JSON>'
```

### 4.6 GET `/tag/v1/following`

获取当前登录用户已关注的 Tag 列表。

**operationId**：`LibraryService_GetFollowingTags`

| Query              | 必填 | 说明                                  |
| ------------------ | ---- | ------------------------------------- |
| `offset`           | 否   | 分页偏移量（string / uint64）         |
| `limit`            | 否   | 每页数量，默认 20（string / uint64）  |
| `offset` + `limit` | —    | 两者之和不超过 1000                   |

**响应**：`libraryGetFollowingTagsResponse`；异常响应为 `rpcStatus`。

```bash
curl 'https://openapi.qiandao.com/tag/v1/following?offset=0&limit=20' \
  -H 'Authorization: Bearer <token>'
```

---

## 5. User：当前用户

**GET** `/user/v1/me`，无 Query。

**响应** `userGetCurrentUserResponse`：`code`（**0** 成功）、`message`、`requestId`；`data` → `userUserInfo`（`id`、`nickname`、`avatar` 必填；`identityTags`、`interestTags` 为标签分组等）。

```bash
curl 'https://openapi.qiandao.com/user/v1/me' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

---

## 6. Lifestyle：我的标记（Mark）

**响应壳**：`code` 为 **int32**，与 Library 的 string `code` 不同，解析时注意兼容。

### 6.1 POST `/mark/v1/add`

添加用户 mark 标记。

**请求体** `MarkRequest`：

| 字段    | 类型   | 必填 | 说明   |
| ------- | ------ | ---- | ------ |
| `spuId` | string | 是   | SPU ID |

**响应** `MarkResponse`：`code`、`message`、`requestId`；成功时 `data` 含 `id`（mark id）。

```bash
curl 'https://openapi.qiandao.com/mark/v1/add' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{
  "spuId": "978074656223267833"
}'
```

### 6.2 GET `/mark/v1/me/list`

| Query    | 必填 | 说明                                           |
| -------- | ---- | ---------------------------------------------- |
| `limit`  | 是   | 最多 100                                       |
| `offset` | 是   | 偏移（Swagger 描述「最多 100」，以服务端为准） |

**data**：`items`（`MarkInfo`）、`totalCount`（string，**最多 999**）。

```bash
curl 'https://openapi.qiandao.com/mark/v1/me/list?limit=20&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 6.3 GET `/mark/v1/me/search`

| Query              | 必填 | 说明    |
| ------------------ | ---- | ------- |
| `typeId`           | 否   | 类目 ID |
| `limit` / `offset` | 是   | 同上    |

```bash
curl 'https://openapi.qiandao.com/mark/v1/me/search?typeId=15&limit=20&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 6.4 GET `/mark/v1/me/detail`

| Query              | 必填 | 说明                       |
| ------------------ | ---- | -------------------------- |
| `id`               | 是   | `mark_spu_info` id         |
| `limit` / `offset` | 是   | 标记**明细**分页，最多 100 |

**data**：含 `spu`、`marks`（`MarkDetail` + `MarkFields` 结构化字段）、`hasMore` 等。

```bash
curl 'https://openapi.qiandao.com/mark/v1/me/detail?id=978074656223267833&limit=20&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

---

## 7. Lifestyle：帖子（Post）

### 7.1 GET `/post/v1/me`

获取我的帖子列表。

| Query    | 必填 | 说明     |
| -------- | ---- | -------- |
| `limit`  | 是   | 每页数量 |
| `offset` | 是   | 起始位置 |
| `status` | 否   | 帖子状态 |

**data**：`items`（`PostInfo`）、`totalCount`。

`PostInfo` 字段：`id`、`topicId`、`title`、`content`、`cover`、`type`、`createdAt`、`likeCount`、`commentCount`。

```bash
curl 'https://openapi.qiandao.com/post/v1/me?limit=20&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 7.2 POST `/post/v1/search`

搜索帖子。

**请求体** `SearchPostRequest`：

| 字段      | 类型   | 必填 | 说明       |
| --------- | ------ | ---- | ---------- |
| `keyword` | string | 否   | 搜索关键词 |
| `topicId` | string | 否   | 话题 ID    |
| `limit`   | string | 是   | 每页数量   |
| `offset`  | string | 是   | 起始位置   |

**响应** `SearchPostResponse`：`code`、`message`、`requestId`；`data` 含 `items`（`PostInfo`）、`totalCount`。

```bash
curl 'https://openapi.qiandao.com/post/v1/search' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{
  "keyword": "搜索词",
  "limit": "20",
  "offset": "0"
}'
```

---

## 8. 与小程序开发的衔接

1. **凭证来源**：开放平台 `appId` / `appSecret` 与项目 **`qdmp.json`** 中字段对应关系以平台说明为准；不要在代码里硬编码密钥，可用环境变量或后端托管换票。
2. **用户态 Token**：前端通过 `/auth/v1/token` 接口获取 `accessToken`，用于请求业务 API。
3. **本地联调**：development-guide 中的 `BASE` 若指向自建后端，可由后端代理 `openapi.qiandao.com`，避免在前端暴露密钥。
4. **图片**：列表页建议保留 `referrer` 策略说明（见 development-guide），避免防盗链导致裂图。

---

## 9. 错误与排查

- HTTP 200 但业务 `code` 非成功：读 `message` 与各服务错误码说明。
- `default` 响应可能为 `rpcStatus`（`code`、`message`、`details`）。
- 401 / 403：检查 Token 是否过期、Header 名是 `Authorization: Bearer` 还是 `access-token`，以及是否缺少 `x-echo-qdmp-version`。

---

## 10. 接口速查

| 场景         | 方法 | 路径                 |
| ------------ | ---- | -------------------- |
| 获取 Token   | POST | `/auth/v1/token`     |
| 刷新 Token   | POST | `/auth/v1/refresh`   |
| SPU 详情     | GET  | `/spu/v1/detail`     |
| SPU 搜索     | GET  | `/spu/v1/search`     |
| Tag 详情     | GET  | `/tag/v1/detail`     |
| Tag 搜索     | GET  | `/tag/v1/search`     |
| 关注 Tag     | POST | `/tag/v1/follow`     |
| 已关注 Tag   | GET  | `/tag/v1/following`  |
| 当前用户     | GET  | `/user/v1/me`        |
| 添加标记     | POST | `/mark/v1/add`       |
| 我的标记列表 | GET  | `/mark/v1/me/list`   |
| 我的标记搜索 | GET  | `/mark/v1/me/search` |
| 我的标记详情 | GET  | `/mark/v1/me/detail` |
| 我的帖子列表 | GET  | `/post/v1/me`        |
| 搜索帖子     | POST | `/post/v1/search`    |

完整字段与枚举见各服务 Swagger（§1 表格）。
