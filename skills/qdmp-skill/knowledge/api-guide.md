# 千岛开放平台 HTTP API 指南（QDMP）

本文档说明千岛小程序如何通过 **`https://openapi.qiandao.com`** 调用开放平台 HTTP 接口，字段定义以各服务 Swagger 为准。与 [development-guide.md](./development-guide.md) 中的 `fetch` + 网关调用方式一致。

与 **[SKILL.md](../SKILL.md)** 的关系：

- **Step 0** 会从项目根目录的 **`qdmp-config.json`** 读取 `appId`、`appSecret`，用于小程序发版、MCP 等流程；调用 **Auth `/auth/v1/token`** 时通常也使用平台下发的同一套应用凭证（是否完全一致以开放平台说明为准）。
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
| `appId`     | 应用 ID（可与 `qdmp-config.json` 中 `appId` 对应，以平台为准）    |
| `appSecret` | 应用密钥（与 `qdmp-config.json` 中 `appSecret` 对应，以平台为准） |
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

## 6. Lifestyle Swagger 类型约定

本节覆盖面向开发者开放的 Lifestyle Swagger 2.0 接口。Swagger 的 `string(int64)` 表示 **JSON 字符串**，不要转成 JavaScript `number`，否则大 ID 可能丢失精度。

所有接口都要求 `access-token` 和 `x-echo-qdmp-version` Header。成功响应使用以下通用结构：

```ts
type Int64String = string

interface LifestyleResponse<T> {
  code: number       // int32；0 表示成功
  message: string
  data: T
  requestId: string
}

interface RpcStatus {
  code?: number      // int32
  message?: string
  details?: Array<{ "@type"?: string }>
}
```

除非具体字段标为可选，响应模型中的字段均为必填。HTTP 非预期错误返回 `RpcStatus`，不能按 `LifestyleResponse<T>` 解析。

---

## 7. Lifestyle：标记（Mark）

### 7.1 类型定义

```ts
interface Rating {
  value: number // int32；Mark 接口约束为 1～5
}

interface Spu {
  id: Int64String
  name: string
  image: string
}

interface MarkInfo {
  id: Int64String
  spu: Spu
  markAt: Int64String
  count: Int64String
  rating?: Rating
  createdAt: Int64String
  typeId: Int64String
}

interface MarkDetail {
  id: Int64String
  markAt: Int64String
  createdAt: Int64String
}

interface MarkDetailData {
  id: Int64String
  spu: Spu
  markAt: Int64String
  count: Int64String
  rating?: Rating
  createdAt: Int64String
  typeId: Int64String
  typeName: string
  marks: MarkDetail[]
  hasMore: boolean
}
```

### 7.2 POST `/mark/v1/add`

添加单个 SPU 标记。

| Body 字段      | JSON 类型 | 必填 | 说明                     |
| -------------- | --------- | ---- | ------------------------ |
| `spuId`        | `string`  | 是   | SPU ID（int64 字符串）   |
| `rating`       | `object`  | 否   | 评分对象                 |
| `rating.value` | `number`  | 是*  | int32，传 `rating` 时必填；取值 1～5 |

**出参类型**：`LifestyleResponse<{ id: Int64String }>`，其中 `data.id` 为新建的 mark ID。

```bash
curl 'https://openapi.qiandao.com/mark/v1/add' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{
  "spuId": "978074656223267833",
  "rating": { "value": 5 }
}'
```

### 7.3 POST `/mark/v1/batch/add`

批量添加 SPU 标记。

| Body 字段 | JSON 类型 | 必填 | 说明                           |
| --------- | --------- | ---- | ------------------------------ |
| `spuIds`  | `string[]`| 是   | SPU ID 列表（int64 字符串数组） |

**出参类型**：`LifestyleResponse<{ result: Record<string, Int64String> }>`。`result` 的 key 是 SPU ID，value 是对应的 mark ID。

```bash
curl 'https://openapi.qiandao.com/mark/v1/batch/add' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{
  "spuIds": ["978074656223267833", "978074656223267834"]
}'
```

### 7.4 GET `/mark/v1/me/list`

| Query    | JSON 类型 | 必填 | 说明                         |
| -------- | --------- | ---- | ---------------------------- |
| `limit`  | `string`  | 是   | int64 字符串；最多 100       |
| `offset` | `string`  | 是   | int64 字符串；Swagger 标注最多 100 |

**出参类型**：`LifestyleResponse<{ items: MarkInfo[]; totalCount: Int64String }>`。`totalCount` 最多返回 999。

### 7.5 GET `/mark/v1/me/search`

| Query    | JSON 类型 | 必填 | 说明                   |
| -------- | --------- | ---- | ---------------------- |
| `typeId` | `string`  | 否   | 类目 ID（int64 字符串）|
| `limit`  | `string`  | 是   | int64 字符串；最多 100 |
| `offset` | `string`  | 是   | int64 字符串；Swagger 标注最多 100 |

**出参类型**：`LifestyleResponse<{ items: MarkInfo[]; totalCount: Int64String }>`。`totalCount` 最多返回 999。

### 7.6 GET `/mark/v1/me/detail`

| Query    | JSON 类型 | 必填 | 说明                              |
| -------- | --------- | ---- | --------------------------------- |
| `id`     | `string`  | 是   | `mark_spu_info` ID（int64 字符串）|
| `limit`  | `string`  | 是   | 明细分页大小；最多 100            |
| `offset` | `string`  | 是   | 明细分页偏移；Swagger 标注最多 100 |

**出参类型**：`LifestyleResponse<MarkDetailData>`。

```bash
curl 'https://openapi.qiandao.com/mark/v1/me/detail?id=978074656223267833&limit=20&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

---

## 8. Lifestyle：想要（Wish SPU）

### 8.1 类型定义

```ts
type WishSpuType =
  | "WISH_SPU_TYPE_UNSPECIFIED"
  | "WISH_SPU_TYPE_SPU"
  | "WISH_SPU_TYPE_POI"

interface WishSpuItem {
  id: Int64String
  spu: {
    id: Int64String
    name: string
    image: string
  }
  typeId: Int64String
  markAt: Int64String
  createdAt: Int64String
}
```

Swagger 的字段说明称当前仅支持 SPU，因此业务调用应传 `WISH_SPU_TYPE_SPU`；不要使用默认的 `WISH_SPU_TYPE_UNSPECIFIED`。虽然枚举中存在 `WISH_SPU_TYPE_POI`，当前文档未声明它可用。

### 8.2 POST `/wishspu/v1/add`

| Body 字段 | JSON 类型    | 必填 | 说明                                  |
| --------- | ------------ | ---- | ------------------------------------- |
| `ids`     | `string[]`   | 是   | 目标 ID 列表；SPU 模式下为 SPU ID 列表 |
| `type`    | `WishSpuType`| 是   | 当前传 `WISH_SPU_TYPE_SPU`            |

**出参类型**：`LifestyleResponse<{ successCount: Int64String }>`。

### 8.3 POST `/wishspu/v1/cancel`

请求体与 `/wishspu/v1/add` 相同。

**出参类型**：`LifestyleResponse<{ successCount: Int64String }>`，`successCount` 表示成功取消数量。

### 8.4 GET `/wishspu/v1/list`

| Query    | JSON 类型 | 必填 | 说明                                |
| -------- | --------- | ---- | ----------------------------------- |
| `typeId` | `string`  | 否   | 类目 ID（int64 字符串）；空时不过滤 |
| `offset` | `string`  | 是   | 起始位置（int64 字符串）            |
| `limit`  | `string`  | 是   | 每页数量（int64 字符串）            |

**出参类型**：`LifestyleResponse<{ items: WishSpuItem[]; totalCount: Int64String }>`。

```bash
curl 'https://openapi.qiandao.com/wishspu/v1/list?typeId=15&offset=0&limit=20' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

---

## 9. Lifestyle：帖子接口（Post）

以下接口调用前应以其对应服务的最新 Swagger 为准。

### 9.1 GET `/post/v1/detail`

查询小程序帖子详情。

**operationId**：`OpenApiLifestyleService_GetPostDetail`

| Query    | JSON 类型 | 必填 | 说明                         |
| -------- | --------- | ---- | ---------------------------- |
| `postId` | `string`  | 是   | 帖子 ID（int64 字符串）      |

**成功响应**：`openapi_lifestyleGetPostDetailResponse`；非预期错误响应为 `rpcStatus`。

`postId` 必须作为 Query 参数传递。它是 int64 字符串，不要转成 JavaScript `number`。

```bash
curl 'https://openapi.qiandao.com/post/v1/detail?postId=978074656223267833' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 9.2 GET `/post/v1/list`

分页查询小程序帖子。

**operationId**：`OpenApiLifestyleService_ListPosts`

| Query    | JSON 类型 | 必填 | 说明                              |
| -------- | --------- | ---- | --------------------------------- |
| `offset` | `string`  | 否   | 分页偏移量（int64 字符串），默认 0 |
| `limit`  | `string`  | 否   | 单页数量（int64 字符串），默认 20，最大 100 |

**成功响应**：`openapi_lifestyleListPostsResponse`；非预期错误响应为 `rpcStatus`。

```bash
curl 'https://openapi.qiandao.com/post/v1/list?offset=0&limit=20' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 9.3 GET `/post/v1/me/list`

分页查询当前用户发布的公开帖子。该接口只返回公开帖子。

**operationId**：`OpenApiLifestyleService_ListMyPosts`

| Query    | JSON 类型 | 必填 | 说明                              |
| -------- | --------- | ---- | --------------------------------- |
| `offset` | `string`  | 否   | 分页偏移量（int64 字符串），默认 0 |
| `limit`  | `string`  | 否   | 单页数量（int64 字符串），默认 20，最大 100 |

**成功响应**：`openapi_lifestyleListPostsResponse`；非预期错误响应为 `rpcStatus`。

```bash
curl 'https://openapi.qiandao.com/post/v1/me/list?offset=0&limit=20' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 9.4 GET `/post/v1/me`

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

### 9.5 POST `/post/v1/search`

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

## 10. Lifestyle：评论与回复（Comment / RComment）

本节对应 rcomment 评论能力；Swagger 中的 tag 为 `comment`。所有接口都需要 `access-token` 和 `x-echo-qdmp-version` Header。帖子、评论、回复 ID 以及游标均为 `string(int64)`，在 JavaScript 中保持字符串，不要转成 `number`。

### 10.1 类型定义

```ts
interface CommentAuthor {
  openId: string
  nickname: string
  avatarUrl: string
}

interface CommentItem {
  id: Int64String
  content: string
  createdAt: Int64String // 毫秒级 Unix 时间戳
  creator: CommentAuthor
  replyToUser?: CommentAuthor
  rootCommentId: Int64String // 一级评论为 "0"
  replyCommentId: Int64String // 一级评论为 "0"
  likeCount: number
  liked: boolean
}

interface CommentThread {
  comment: CommentItem
  replies: CommentItem[]
  replyCount: Int64String
}

interface CommentRepliesPage {
  items: CommentItem[]
  hasMore: boolean
  cursor: Int64String // 没有更多回复时为 "0"
  count: number
}
```

`replyToUser` 只在有明确回复对象时返回。`rootCommentId` 表示所属一级评论，`replyCommentId` 表示直接回复的评论或回复；一级评论的这两个字段都是字符串 `"0"`。

### 10.2 POST `/comment`

对帖子发表评论。

**operationId**：`OpenApiLifestyleService_CreateComment`

| Body 字段 | JSON 类型 | 必填 | 说明                        |
| --------- | --------- | ---- | --------------------------- |
| `postId`  | `string`  | 是   | 帖子 ID，必须大于 0         |
| `content` | `string`  | 是   | 评论内容，不能为空          |

**成功响应**：`LifestyleResponse<{ id: Int64String }>`，其中 `data.id` 是新建评论 ID。帖子不存在时返回 HTTP 404。

```bash
curl 'https://openapi.qiandao.com/comment' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{
  "postId": "978074656223267833",
  "content": "这是一条评论"
}'
```

### 10.3 POST `/comment/{commentId}/reply`

回复评论或回复。路径中的 `commentId` 是直接被回复对象的 ID：回复一级评论时传一级评论 ID，回复某条回复时传该回复 ID。

**operationId**：`OpenApiLifestyleService_ReplyComment`

| 参数                | 位置 | JSON 类型 | 必填 | 说明                         |
| ------------------- | ---- | --------- | ---- | ---------------------------- |
| `commentId`         | Path | `string`  | 是   | 被回复的评论或回复 ID，大于 0 |
| `content`           | Body | `string`  | 是   | 回复内容，不能为空           |

**成功响应**：`LifestyleResponse<{ id: Int64String }>`，其中 `data.id` 是新建回复 ID。目标评论或回复不存在时返回 HTTP 404。

```bash
curl 'https://openapi.qiandao.com/comment/978074656223267834/reply' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{ "content": "这是一条回复" }'
```

### 10.4 POST `/comment/{commentId}/like`

点赞或取消点赞评论、回复，二者使用同一个接口。

**operationId**：`OpenApiLifestyleService_LikeComment`

| 参数        | 位置 | JSON 类型 | 必填 | 说明                                  |
| ----------- | ---- | --------- | ---- | ------------------------------------- |
| `commentId` | Path | `string`  | 是   | 评论或回复 ID，必须大于 0             |
| `liked`     | Body | `boolean` | 是   | `true` 点赞；`false` 取消点赞          |

**成功响应**：`code`、`message`、`requestId`，Swagger 未定义 `data`。目标评论或回复不存在时返回 HTTP 404；不要因其他 Lifestyle 响应通常带 `data` 而强行读取该字段。

```bash
curl 'https://openapi.qiandao.com/comment/978074656223267834/like' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>' \
  --data-raw '{ "liked": true }'
```

### 10.5 GET `/post/{postId}/comments`

按点赞数获取帖子的一级评论及其首批回复。

**operationId**：`OpenApiLifestyleService_ListComments`

| 参数     | 位置  | JSON 类型 | 必填 | 说明                                      |
| -------- | ----- | --------- | ---- | ----------------------------------------- |
| `postId` | Path  | `string`  | 是   | 帖子 ID，必须大于 0                       |
| `limit`  | Query | `string`  | 否   | 一级评论单页数量，默认 10，最大 20        |
| `offset` | Query | `string`  | 否   | 一级评论分页偏移量，默认 0                |

**成功响应**：`LifestyleResponse<{ items: CommentThread[]; count: number }>`。每个 `CommentThread.replies` 是首批回复，`replyCount` 是回复总数。帖子不存在时返回 HTTP 404。

```bash
curl 'https://openapi.qiandao.com/post/978074656223267833/comments?limit=10&offset=0' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

### 10.6 GET `/comment/{commentId}/replies`

继续获取某条一级评论下的回复。该接口使用 `cursor`，不是 `offset`。

**operationId**：`OpenApiLifestyleService_ListCommentReplies`

| 参数        | 位置  | JSON 类型 | 必填 | 说明                                                        |
| ----------- | ----- | --------- | ---- | ----------------------------------------------------------- |
| `commentId` | Path  | `string`  | 是   | 一级评论 ID，必须大于 0                                     |
| `limit`     | Query | `string`  | 否   | 回复单页数量，默认 10，最大 20                              |
| `cursor`    | Query | `string`  | 否   | 首次续载传评论列表首批回复最后一条 ID + 1；以后传上页返回值 |

**成功响应**：`LifestyleResponse<CommentRepliesPage>`。继续分页时读取响应的 `data.cursor`；`data.hasMore` 为 `false` 或 `data.cursor` 为 `"0"` 时停止。一级评论不存在时返回 HTTP 404。

```bash
curl 'https://openapi.qiandao.com/comment/978074656223267834/replies?limit=10&cursor=978074656223267900' \
  -H 'access-token: <token>' \
  -H 'x-echo-qdmp-version: <x-echo-qdmp-version>'
```

不要用 JavaScript 数值执行 `lastReplyId + 1`，大 ID 会丢失精度。可使用 `BigInt` 计算后再转回字符串：

```js
const firstCursor = (BigInt(lastReply.id) + 1n).toString()
```

---

## 11. 图片文字识别 OCR

### 11.1 POST `/ocr/v1/recognize`

识别图片中的文字。

**请求体**：

| 字段          | 类型     | 必填 | 说明                                        |
| ------------- | -------- | ---- | ------------------------------------------- |
| `imageBase64` | `string` | 是   | 图片的纯 Base64 编码，不包含 Data URL 前缀 |

```json
{
  "imageBase64": "<纯 Base64 字符串>"
}
```

调用接口前必须移除以下形式的前缀：

```text
data:image/png;base64,
data:image/jpeg;base64,
```

不要只针对 PNG 做固定字符串替换。建议按第一个逗号截取，以兼容不同图片格式：

```javascript
function stripDataUrlPrefix(base64) {
  const value = String(base64 || "").trim()
  const commaIndex = value.indexOf(",")

  if (value.startsWith("data:") && commaIndex !== -1) {
    return value.slice(commaIndex + 1)
  }

  return value
}
```

**响应**：使用 OpenAPI 通用响应壳。成功时 `code` 为 `0` 或 `"0"`，识别结果位于 `data`。`data` 的具体字段以接口实际响应为准。

```javascript
export async function recognizeOcr({ imageBase64 }) {
  const json = await backendApi.post("/ocr/v1/recognize", {
    imageBase64: stripDataUrlPrefix(imageBase64),
  })

  if (String(json.code) === "0") {
    return json.data
  }

  throw new Error(json.message || "OCR 识别失败")
}
```

### 11.2 小程序选图与 Base64 转换

选择图片时优先使用 `qd.chooseMedia`，不支持时回退到 `qd.chooseImage`：

```javascript
async function chooseImagePath() {
  if (typeof qd.chooseMedia === "function") {
    const res = await qd.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      sizeType: ["compressed"],
    })

    return res.tempFiles?.[0]?.tempFilePath || ""
  }

  const res = await qd.chooseImage({
    count: 1,
    sourceType: ["album", "camera"],
    sizeType: ["compressed"],
  })

  return res.tempFilePaths?.[0] || ""
}
```

读取 Base64 时，优先使用文件系统接口：

```javascript
async function readFileBase64(filePath) {
  const fileSystemManager = qd.getFileSystemManager?.()

  if (!fileSystemManager?.readFile) {
    throw new Error("当前运行时不支持文件系统读取")
  }

  const result = await new Promise((resolve, reject) => {
    fileSystemManager.readFile({
      filePath,
      encoding: "base64",
      success: resolve,
      fail: reject,
    })
  })

  if (!result?.data) {
    throw new Error("readFile 未返回 Base64")
  }

  return result.data
}
```

部分千岛真机环境中，`readFile({ encoding: "base64" })` 可能失败。此时应回退到 `qd.readImage`：

```javascript
async function readImageBase64(filePath) {
  try {
    return await readFileBase64(filePath)
  } catch (_) {
    const result = await new Promise((resolve, reject) => {
      qd.readImage({
        filePath,
        success: resolve,
        fail: reject,
      })
    })

    const base64 =
      typeof result === "string"
        ? result
        : result?.data || ""

    if (!base64) {
      throw new Error("qd.readImage 未返回 Base64")
    }

    return stripDataUrlPrefix(base64)
  }
}
```

完整调用：

```javascript
async function chooseImageBase64() {
  const filePath = await chooseImagePath()

  if (!filePath) {
    throw new Error("未选择图片")
  }

  return readImageBase64(filePath)
}
```

`qd.readImage` 的返回值可能是字符串，也可能是包含 `data` 字段的对象，调用时应兼容两种形式。发送 OCR 请求前仍需通过 `stripDataUrlPrefix` 移除 Data URL 前缀。

### 11.3 后端代理

推荐由项目后端代理 OCR 请求：

```text
小程序
  → 项目后端 /ocr/v1/recognize
  → https://openapi.qiandao.com/ocr/v1/recognize
```

这样可以由后端统一获取或注入 `access-token`，避免在前端保存 `appSecret`。

使用通用 OpenAPI 代理时，需要将 OCR 路径加入允许列表：

```javascript
const PROXY_PREFIXES = [
  "/mark/",
  "/post/",
  "/comment/",
  "/spu/",
  "/tag/",
  "/user/",
  "/island/",
  "/wishspu/",
  "/ocr/",
]
```

代理应保留原始请求方法、路径和 JSON 请求体，并将 OpenAPI 响应原样返回。

### 11.4 常见问题

- **图片数据无效**：检查 `imageBase64` 是否仍包含 `data:image/...;base64,` 前缀。
- **真机读取图片失败**：保留 `qd.readImage` 回退逻辑。
- **请求体过大**：选图时使用 `sizeType: ["compressed"]`，必要时先压缩图片。
- **HTTP 200 但识别失败**：检查业务字段 `code` 和 `message`。
- **401 / 403**：检查 `access-token` 是否存在或过期，以及后端是否成功获取服务端 Token。

---

## 12. 与小程序开发的衔接

1. **凭证来源**：开放平台 `appId` / `appSecret` 与项目 **`qdmp-config.json`** 中字段对应关系以平台说明为准；不要在代码里硬编码密钥，可用环境变量或后端托管换票。
2. **用户态 Token**：前端通过 `/auth/v1/token` 接口获取 `accessToken`，用于请求业务 API。
3. **本地联调**：development-guide 中的 `BASE` 若指向自建后端，可由后端代理 `openapi.qiandao.com`，避免在前端暴露密钥。
4. **图片**：列表页建议保留 `referrer` 策略说明（见 development-guide），避免防盗链导致裂图。

---

## 13. 错误与排查

- HTTP 200 但业务 `code` 非成功：读 `message` 与各服务错误码说明。
- `default` 响应可能为 `rpcStatus`（`code`、`message`、`details`）。
- 401 / 403：检查 Token 是否过期、Header 名是 `Authorization: Bearer` 还是 `access-token`，以及是否缺少 `x-echo-qdmp-version`。

---

## 14. 接口速查

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
| 批量添加标记 | POST | `/mark/v1/batch/add` |
| 我的标记列表 | GET  | `/mark/v1/me/list`   |
| 我的标记搜索 | GET  | `/mark/v1/me/search` |
| 我的标记详情 | GET  | `/mark/v1/me/detail` |
| 批量添加想要 | POST | `/wishspu/v1/add`    |
| 批量取消想要 | POST | `/wishspu/v1/cancel` |
| 想要列表     | GET  | `/wishspu/v1/list`   |
| 帖子详情     | GET  | `/post/v1/detail`    |
| 帖子列表     | GET  | `/post/v1/list`      |
| 我的公开帖子 | GET  | `/post/v1/me/list`   |
| 我的帖子列表 | GET  | `/post/v1/me`        |
| 搜索帖子     | POST | `/post/v1/search`    |
| 发表评论     | POST | `/comment`           |
| 回复评论     | POST | `/comment/{commentId}/reply`   |
| 评论点赞切换 | POST | `/comment/{commentId}/like`    |
| 帖子评论列表 | GET  | `/post/{postId}/comments`      |
| 评论回复列表 | GET  | `/comment/{commentId}/replies` |
| 图片文字识别 | POST | `/ocr/v1/recognize`  |

完整字段与枚举见各服务 Swagger（§1 表格）。
