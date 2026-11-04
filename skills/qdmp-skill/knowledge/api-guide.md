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

调用与联调前必须遵守 [云服务使用规范](./backend-operations.md#云服务使用规范)：先核实接口方法、路径与目标环境，禁止猜测或批量探测接口；接口不存在时停止重试和轮询，避免频繁无效请求触发 WAF 封禁。媒体文件使用 OSS / 对象存储，禁止将文件内容写入千岛云数据库。

用户授权 scope 见 [OpenAPI 映射](./openapi-user-authorization.md) 或 [JSON 清单](../references/openapi-user-scopes.json)。

---

## 2. 认证 Auth

**Content-Type**：`application/json`  
Swagger 中 Auth 的 `securityDefinitions` 为 `access_token` Header；**换票接口本身**一般只需 Body，无需 Bearer。

### 2.1 获取 Token

**POST** `/auth/v1/token`

**用户 `openId` 唯一获取来源：本接口 `grantType: "AUTHORIZATION_CODE"` 成功响应中的 `data.openId`。禁止通过 `user.me`（`GET /user/v1/me`）获取或兜底 `openId`，禁止将其 `data.id` 转换为 `openId`。** `CLIENT_CREDENTIALS` 是应用令牌流程，不能用来建立用户身份。

前端使用 `qd.login` 获取本次登录 code，只将 `{ code }` 发给自己的后端。后端从服务器配置读取 `appId/appSecret`，固定 `AUTHORIZATION_CODE` 调用平台换票，不从客户端接收应用密钥。`appSecret` 不得进入前端环境变量、源码、构建包或响应；完整参考见 [开发指南](./development-guide.md#用户登录换票与-openid)。

**请求体** `authTokenRequest`（按 `grantType` 填写对应必需字段）：

| 字段        | 说明                                                       |
| ----------- | ---------------------------------------------------------- |
| `appId`     | 应用 ID（可与 `qdmp-config.json` 中 `appId` 对应，以平台为准）    |
| `appSecret` | 应用密钥（与 `qdmp-config.json` 中 `appSecret` 对应，以平台为准） |
| `code`      | 用户登录授权码；用于 `AUTHORIZATION_CODE`，不用于 `CLIENT_CREDENTIALS` 或手机号码兑换 |
| `grantType` | `CLIENT_CREDENTIALS` 或 `AUTHORIZATION_CODE`               |

上表中的用户登录授权 `code` 用于 `AUTHORIZATION_CODE` 链路；`CLIENT_CREDENTIALS` 获取应用令牌不使用该用户登录码。手机号授权产生的 code 则只交给 [手机号兑换接口](./phone-authorization.md)，不能发给 `/auth/v1/token`。

**响应** `authTokenResponse`：`code`、`message`、`requestId`；成功时 `data` 含 `accessToken`、`expiresAt`（**秒级时间戳**）、`refreshToken`、`openId`。

用户登录换票须同时验证 HTTP 成功、业务 `code=0` 和非空字符串 `data.openId` 后再保存用户会话。缺少 `openId` 时按响应不完整处理，不能补调 `user.me` 或从其他接口补齐。只有旧 Token 而没有换票 `openId` 的会话应重新登录获取新 code 换票；刷新 Token 沿用原换票身份，退出或切号时清理旧身份。

**业务错误码**：应用凭证、授权码与授权类型相关错误见 [13. 错误与排查](#13-错误与排查) 中的 `10001`–`10004`；授权码有效期为 5 分钟。

**服务端 curl 最小示例**（占位凭据仅在服务端配置，**勿提交真实值，也不要移入前端**）：

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

**响应**：`data` 含新的 `accessToken`、`expiresAt`（秒）。刷新失败原因见 [13. 错误与排查](#13-错误与排查) 中的 `10007`、`10008`。

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

**建议**：请求头与目标接口要求保持一致；若出现 401，结合业务 `code` 按 [13. 错误与排查](#13-错误与排查) 定位原因，并检查 Header 名及必需的 `x-echo-qdmp-version`。

下文 **Library** 示例采用与线上一致的 **`Authorization: Bearer`**；**User / Mark** 示例同时给出 **`access-token` + `x-echo-qdmp-version`**（与 Swagger 一致）。

### 手机号授权码兑换

**POST `/user/v1/phone/exchange`** 必须由应用后端携带 **`CLIENT_CREDENTIALS` 应用令牌的 `Access-Token`** 请求头调用，JSON 请求体为 `{ "code": "ONE_TIME_PHONE_CODE" }`。不能将普通本人接口的用户 token 或通用 Bearer 示例套用于此接口。

开发者须申请并获准“授权码兑换手机号”OpenAPI；用户端要求千岛 App **6.68.0+**，通过原生 `button open-type="getPhoneNumber"` 的 `getphonenumber` 事件获取 code。一次性消费、完整响应及参考代码见 [手机号授权与后端兑换](./phone-authorization.md)。

<a id="oss-图片上传流程"></a>

## OSS 图片与视频上传流程（POST）

完整接口契约、原生 POST 直传参考代码、可选应用后端中转与风险取舍见 [OSS 上传指南](./oss-upload.md)。本节保留接口索引，避免多处维护上传契约。

| 方法与路径 | 作用 |
| --- | --- |
| GET `/oss/v1/quota` | 查询实际容量、可用字节和状态 |
| POST `/oss/v1/upload/prepare` | 为本次最终文件申请 POST 上传凭据与 assetId |
| GET `/oss/v1/upload/result` | 按 assetId 查询审核与发布结果 |

**平台须分别开通 OpenAPI 权限与能力权限中的 OSS 存储容量。** 仅申请上传接口不代表已获存储额度，quota 查询成功不代表容量可用。实际容量及状态以目标应用平台配置和 quota 返回为准，不编造能力 key 或统一容量值。

- 图片/视频完成压缩等处理后，按真实 MIME 与文件字节数 prepare，使用 `type=openmp`、`source=miniapp`；之后上传同一份字节。
- 直传使用 `qd.uploadFile` POST multipart，`timeout: 120000`，签名表单原样传递，`name: "file"`；不手填 multipart Content-Type，不把文件大小与整个表单长度混淆。回调/Promise 只结算一次，JS 等待参考值 125000 ms。
- 自建 relay 是可选方案，不是平台 OpenAPI；同样向 OSS 发送 POST multipart，全部原始文本字段在前，唯一 `file` 在最后。客户端仍持有 prepare 凭据的中转不会隐藏这些凭据。
- quota、prepare、result 保持同一应用与环境；应用/用户凭证不转发给 OSS，长期密钥只留后端。
- HTTP 成功不等于发布成功；203、超时或响应不全时保留 assetId 查询 result，不自动重传。只有 result 业务 `code=0`、`status=COMMITTED` 且 `cdnUrl` 有效才判定已发布；不以旧回调的 `url` 或 uploadUrl 冒充发布地址。
- 方案与进一步优化由用户决定；沿用已有选择，不因加载指南自动改架构、签名策略、额度或部署。界面与展示方式按目标产品需求实现。

---

## 4. Library：SPU / Tag / Island

**响应壳**：`code`、`message`、`data`、`requestId`。下列 SPU / Tag 接口的 `code` 为 **string**，`"0"` 表示成功；岛屿详情的清单定义为整数 `0`，见 §4.7。

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

### 4.7 岛屿详情与加入状态

**GET** `/island/v1/detail`

根据岛屿 ID 查询基本信息，通过 `data.island.joined` 判断当前用户是否已加入。接口与字段依据 [官方全量接口清单](https://g.echo.tech/openapi/openapi-doc/-/raw/master/all-endpoints.json) 中的 `LibraryService_GetIsland`、`libraryGetIslandResponse` 和 `libraryIsland`；SDK 调用约定参照 [官方服务端 SDK 的 OpenAPI 定义](https://github.com/EchoTechFE/qdmp-server-sdk/blob/main/shared/openapi.yaml)。

| Query | 类型 | 必填 | 说明 |
| ----- | ---- | ---- | ---- |
| `id` | `string` | 是 | 岛屿 ID；即使源类型为 int64/uint64，也保持字符串，避免精度损失 |

全量清单声明的必需请求头为 `access-token`；SDK 另携带 `x-echo-qdmp-version`（默认协议标识为 `1.0`，不是小程序运行时版本）。查询某个用户的加入状态时使用该用户的授权凭证；应用凭证虽然可以查询岛屿基本信息，但不能据此判断某个真实用户是否加入。

```bash
curl --get 'https://openapi.qiandao.com/island/v1/detail' \
  --data-urlencode 'id=<islandId>' \
  -H 'access-token: <userAccessToken>' \
  -H 'x-echo-qdmp-version: 1.0'
```

成功响应包含 `code`、`message`、`requestId` 和 `data.island`：

| `data.island` 字段 | 类型 | 说明 |
| ----------------- | ---- | ---- |
| `id` | `string` | 岛屿 ID |
| `name` | `string` | 岛屿名称 |
| `image` | `string` | 岛屿封面 URL |
| `joined` | `boolean` | 当前用户是否已加入：`true` 已加入，`false` 未加入 |
| `joinCount` | `string` | 加入人数，源类型为 int64，保持字符串 |

全量清单将本接口的 `code` 定义为整数，`0` 表示成功；兼容 SDK 历史响应时也可接受字符串 `"0"`。先确认业务成功，再检查 `joined` 是否为布尔值。请求失败、岛屿对象缺失、`joined` 缺失或类型不符均属于无法判断，不要用 `Boolean(joined)` 或 `joined ?? false` 将其误判为未加入。权限、Token 等错误按 [错误与排查](#13-错误与排查) 处理；需要用户授权时，scope 必须来自正式接口映射或可信业务响应，不能从接口名称猜测。

用户主动点击加入入口时调用 [Bridge `qd.joinIsland`](./bridge-api-guide.md#qdjoinisland--加入岛屿)。加入操作完成后重新查询本接口刷新状态，不把打开加入交互当作已加入，也不要用加入操作试探原有成员状态。

### 4.8 GET `/island/v1/isJoined`

仅查询当前用户是否已加入指定岛。与详情接口不同，Query 名为 **`islandId`**，结果直接位于 **`data.joined`**。使用当前用户的 `access-token`；方法名大小写保留 `isJoined`。

| Query | 类型 | 必填 | 说明 |
| ----- | ---- | ---- | ---- |
| `islandId` | `string` | 是 | 岛 ID，int64 十进制字符串 |

**响应**：`libraryIsJoinedIslandResponse`，`code` 为整数，`0` 表示成功；`data.joined` 为布尔值。先判断业务成功，再读取状态；错误、缺字段和非布尔值均不能当作未加入。

```bash
curl --get 'https://openapi.qiandao.com/island/v1/isJoined' \
  --data-urlencode 'islandId=<islandId>' \
  -H 'access-token: <userAccessToken>'
```

### 4.9 GET `/island/v1/joined`

获取当前用户已加入的岛列表，使用当前用户的 `access-token`。

| Query | 类型 | 必填 | 说明 |
| ----- | ---- | ---- | ---- |
| `limit` | `integer` | 否 | 1–50，默认 20 |
| `offset` | `integer` | 否 | ≥ 0，默认 0 |
| `orderBy` | `string` | 否 | `JOIN_TIME`（默认，加入时间倒序）或 `LAST_POST_TIME`（用户在岛内最近发帖时间倒序） |

**响应**：`libraryGetMyIslandsResponse`，整数 `code: 0` 表示成功；`data.items` 为 `libraryIsland[]`，字段见 §4.7；`data.totalCount` 为 int64 字符串。列表按 offset 分页，不能仅凭当前页不包含目标岛就判定用户未加入；判断单岛状态用 §4.8。

```bash
curl 'https://openapi.qiandao.com/island/v1/joined?limit=20&offset=0&orderBy=JOIN_TIME' \
  -H 'access-token: <userAccessToken>'
```

### 4.10 GET `/island/v1/search`

搜索岛，必需请求头为 `access-token`。需要展示当前用户的 `joined` 时使用该用户的授权凭证，不根据应用凭证响应推断用户状态。

| Query | 类型 | 必填 | 说明 |
| ----- | ---- | ---- | ---- |
| `keyword` | `string` | 是 | 搜索关键词，最多 32 字符 |
| `limit` | `integer` | 否 | 1–50，默认 20 |
| `offset` | `integer` | 否 | ≥ 0，默认 0 |

**响应**：`librarySearchIslandsResponse`，整数 `code: 0` 表示成功；`data.items` 为 `libraryIsland[]`，`data.totalCount` 为 int64 字符串。

```bash
curl --get 'https://openapi.qiandao.com/island/v1/search' \
  --data-urlencode 'keyword=<搜索关键词>' \
  --data-urlencode 'limit=20' \
  --data-urlencode 'offset=0' \
  -H 'access-token: <token>'
```

以上岛屿接口均依据同一份全量清单。鉴权、错误处理和未知状态的处理沿用 §4.7；所需权限以平台正式配置为准。

---

## 5. User：当前用户

**GET** `/user/v1/me`，无 Query。

此接口只获取用户资料，**不允许用它获取 `openId`**。`data.id` 不是 `openId`，即使响应出现同名字段，也不能用来建立、补齐或覆盖登录身份。用户 `openId` 一律取自 [`/auth/v1/token`](#21-获取-token) 的 `AUTHORIZATION_CODE` 成功响应。

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

本节是单个商品“想要”能力。需要管理心愿单及其商品数量、心愿价时，使用 [心愿单（Folder）](./wishlist.md)，两者接口与用户授权 scope 不可互换。

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

## Lifestyle：心愿单（Folder）

心愿单支持获取本人非空列表、读取详情、新建以及添加/修改/移出商品。完整参数、响应示例、operation 与 scope 映射见 [心愿单 OpenAPI 指南](./wishlist.md)。

三个接口均使用当前用户身份：读取需要 `user.folder.read`，写入需要 `user.folder.write`。`POST /folder/v1/join` 没有幂等键，失败后不得自动重放；不提供整单删除、已有单改名或修改备注能力。心愿单 ID、条目 ID、SPU ID 均保持 uint64 十进制字符串，分页参数为整数，不能套用 Wish SPU 的类型与分页假设。

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

本节接口的 scope 见 [用户授权映射](./openapi-user-authorization.md)。

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
- **401 / 403**：结合业务 `code` 按 [13. 错误与排查](#13-错误与排查) 区分凭证、Token 类型与有效性、应用权限及用户授权问题。

---

## C2C：合作游戏价格查询

本节依据 [官方全量接口清单](https://g.echo.tech/openapi/openapi-doc/-/raw/master/all-endpoints.json) 的 `c2c-openapi` 服务。响应包含 `code`、`message`、`requestId`、`data`，整数 `code: 0` 才表示业务成功；业务失败时 `code` 非零、`data` 为空。不要仅凭 HTTP 200 或价格数组为空判断查询成功。

### GET `/c2c-openapi/v1/ping`

服务连通检查，无 Query 或请求体，必需请求头为 `access-token`。成功时读取 `data.message`（string）；不要预设固定返回文案。此接口成功不代表价格接口已获授权或目标 SPU 在允许范围内。

```bash
curl 'https://openapi.qiandao.com/c2c-openapi/v1/ping' \
  -H 'access-token: <token>'
```

### 合作游戏价格接口的范围与鉴权

下面两个价格接口使用**应用 Access-Token**，请求头为 `access-token`，无需用户登录态；请求体为 JSON。服务端固定校验 SPU 的真实类目和 IP：`typeId` 必须为 `1822163`，IP 必须为下列之一。

| IP ID | 游戏 |
| ----- | ---- |
| `1861088` | 永恒之塔2 |
| `1877607` | 冒险岛怀旧服 |
| `1824611` | DAD |
| `1824607` | 暗黑4 |
| `1824609` | 火炬之光 |
| `1824608` | 流放之路2 |
| `1824610` | 流放之路 |

越界或无法验证时不查询价格；不要通过请求体伪造 `typeId` 或 IP 绕过校验。请求字段名是 **`id`** 和 **`specIDs`**，均使用实际 ID 的十进制字符串，不要套用 Bridge 的 `spuId` 参数名。应用凭证由服务端按既有认证流程获取，不向前端暴露 `appSecret`。

### POST `/c2c-openapi/v1/gamePriceLine`

**请求体**：`c2cGamePriceLineRequest`。

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `id` | `string` | 是 | SPU ID，正整数的十进制字符串 |
| `bucketLength` | `string` | 否 | 时间粒度；不传使用默认值，后续选择使用返回的 `availableBucketLengths` |
| `specIDs` | `string[]` | 否 | 规格值 ID，均为正整数的十进制字符串；有值时按所选规格查询，不传或空数组沿用原查询 |

**data**：`prices`（价格趋势点数组）、`availableBucketLengths`（string[]）、`spuInfo`（SPU 基础信息）。

- `prices[]`：`bucketTimestamp`（int64 字符串）、`bucketStr`（string）、`price`（number）、`unit`（string）、`tradingVolume`（int32）。时间戳单位未在清单中明确，不根据名称推定秒或毫秒。
- `spuInfo`：`id`（int64 字符串）、`name`、`cover`、`publishPrice`（均为 string）。

```bash
curl 'https://openapi.qiandao.com/c2c-openapi/v1/gamePriceLine' \
  -X POST \
  -H 'access-token: <appAccessToken>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"<spuId>"}'
```

### POST `/c2c-openapi/v1/gamePriceModule`

**请求体**：`c2cGameSpuPriceModuleRequest`。

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `id` | `string` | 是 | SPU ID，正整数的十进制字符串 |
| `specIDs` | `string[]` | 否 | 规格值 ID；传入时成交均价、涨跌幅和成交量严格按这些规格查询，不传或空数组使用默认规格 |

**闪购最低价和在售数量仍按 SPU 统计**，不因 `specIDs` 而变成所选规格的统计值。

**data**：`priceSummaryList`，按固定价、闪购价顺序返回有价格的模块。每项包含：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `priceTitle` / `price` | `string` / `number` | 价格标题与价格 |
| `priceIncreaseRatio` | `number` | 价格涨幅；清单未明确百分比换算规则，展示前核实单位 |
| `volumeTitle` / `volume` | `string` / `integer` | 成交量标题与成交量 |
| `sellingCountTitle` / `sellingCount` | `string` / `integer` | 在售数量标题与在售数量 |
| `tradeType` / `currency` | `string` / `string` | 交易类型与币种；不编造枚举 |

```bash
curl 'https://openapi.qiandao.com/c2c-openapi/v1/gamePriceModule' \
  -X POST \
  -H 'access-token: <appAccessToken>' \
  -H 'Content-Type: application/json' \
  --data-raw '{"id":"<spuId>"}'
```

---

## 12. 与小程序开发的衔接

1. **凭证来源**：开放平台 `appId` / `appSecret` 由后端安全配置提供，`appSecret` 不写入前端环境变量或构建产物。
2. **用户态 Token 与 openId**：前端仅将 `qd.login` code 发往自己的后端；后端调用平台 `/auth/v1/token`，以 `AUTHORIZATION_CODE` 成功响应建立会话。用户 `openId` 必须读取 `data.openId`，禁止从 `user.me` 获取或兜底。
3. **本地联调**：前端登录基址指向自己的后端，平台应用凭据只由后端注入；沿用 [认证流程示例](./development-guide.md#认证流程示例)。
4. **图片**：列表页建议保留 `referrer` 策略说明（见 development-guide），避免防盗链导致裂图。

---

## 13. 错误与排查

排查时同时读取 HTTP 状态、响应业务 `code` 与 `message`，保留 `requestId`（若返回）用于定位请求。HTTP 200 但业务 `code` 非成功时，也应按业务错误处理；`default` 响应可能为 `rpcStatus`（`code`、`message`、`details`）。

### 13.1 OpenAPI 错误码与原因

以下为 OpenAPI `AuthCode*` 常量定义（类型为 `int64`），HTTP 列为各错误码对应的状态；业务错误码与 HTTP 状态是不同字段。错误信息中的 `app_id`、`app_secret`、`grant_type`、`access_token`、`refresh_token` 对应本指南 Auth JSON 字段 `appId`、`appSecret`、`grantType`、`accessToken`、`refreshToken`。

| 业务错误码 | 常量 | HTTP 状态 | 报错原因 |
| ---------- | ---- | --------- | -------- |
| `10001` | `AuthCodeAppIDInvalid` | 401 | `app_id` 无效：应用不存在或已禁用。 |
| `10002` | `AuthCodeAppSecretInvalid` | 401 | `app_secret` 错误：密钥不匹配。 |
| `10003` | `AuthCodeLoginCodeInvalid` | 401 | `code` 无效或已过期：授权码错误或超过 5 分钟有效期。 |
| `10004` | `AuthCodeGrantTypeInvalid` | 401 | `grant_type` 不支持。 |
| `10005` | `AuthCodeAccessTokenInvalid` | 401 | `access_token` 无效：Token 格式错误或已吊销。 |
| `10006` | `AuthCodeAccessTokenExpired` | 401 | `access_token` 已过期。 |
| `10007` | `AuthCodeRefreshTokenInvalid` | 401 | `refresh_token` 无效。 |
| `10008` | `AuthCodeRefreshTokenExpired` | 401 | `refresh_token` 已过期。 |
| `10009` | `AuthCodeScopeNotApply` | 403 | 应用无此接口权限：未申请对应 `scope`。 |
| `10010` | `AuthCodeScopeNotAuthorize` | 403 | 应用未授权此权限。 |
| `10011` | `AuthCodeRateLimit` | 429 | 请求过于频繁，触发限流。 |
| `10012` | `AuthCodeServerErr` | 500 | 服务器内部错误。 |
| `10013` | `AuthCodeServerBusy` | 500 | 操作太频繁，请稍后再试。 |
| `10014` | `AuthCodeTokenGenErr` | 500 | Token 生成失败。 |
| `10015` | `AuthCodeAppValidErr` | 401 | app 验签失败。 |
| `10016` | `AuthCodeQuotaExceeded` | 429 | 调用配额已耗尽。 |
| `10017` | `AuthCodeInvalidParam` | 400 | 请求参数错误。 |
| `10018` | `AuthCodeTokenChannelMismatch` | 403 | Token 类型不允许访问该接口。 |
| `10019` | `AuthCodeStorageRedisWriteFail` | 500 | Redis 写入失败。 |
| `10020` | `AuthCodeApiUserAuthorizationNotApply` | 403 | 用户未申请权限。 |
| `10021` | `AuthCodeApiUserAuthorizationNotAuthorize` | 403 | 用户未授权。 |

### 13.2 排查要点

用户 `user.*` 授权的查询、申请及业务 `10021` 恢复见 [Bridge 用户授权推荐接入流程](./bridge-api-guide.md#用户授权推荐接入流程)。上表是 OpenAPI 业务错误码，不能用于解释 `qd.requireEchoAuthorize` 原生回调；原生同码可能有不同含义。接入资料中业务 `10021` 也可能随 HTTP 401 返回，应结合实际业务响应判断，不直接刷新 Token。

- **401**：按业务码分别检查应用凭证、授权码、授权类型、Token 或 app 验签；同时核对接口要求的 Header。`10006` 表示访问 Token 过期，可进入刷新流程；`10007`、`10008` 表示刷新 Token 无效或过期，需要重新获取 Token，避免反复使用同一个无效刷新 Token。
- **403**：`10009`、`10010` 属于应用权限问题，结合 [OpenAPI 权限申请流程](./openapi-permission-flow.md) 检查对应接口的申请和授权状态；`10020`、`10021` 属于用户权限问题。`10018` 则需检查接口允许的 Token 类型，不能将这些情况统一当成 Token 过期。
- **429**：`10011` 应降低请求频率；`10016` 应检查调用配额，不能仅靠立即重试解决。`10013` 虽然也提示操作频繁，对应 HTTP 状态仍为 500。
- **404 / 405 / 接口不存在**：立即停止该请求的自动重试及轮询，核对方法、路径、环境与部署状态；文档明确的业务对象不存在按业务失败处理，不据此判断路由不存在。
- **WAF 拦截 / IP 封禁**：停止受影响服务的自动请求，保留脱敏诊断信息并排查；不通过换 IP、代理或持续探测绕过封禁。403 / 429 本身不能证明被 WAF 封禁，具体停止与恢复规则见 [云服务使用规范](./backend-operations.md#云服务使用规范)。
- **400 / 500**：`10017` 优先核对请求参数；`10012`、`10014`、`10019` 分别指向服务器内部错误、Token 生成失败和 Redis 写入失败，可携带业务码与 `requestId` 协助服务端排查。

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
| 岛屿详情与加入状态 | GET | `/island/v1/detail` |
| 查询是否已加入岛 | GET | `/island/v1/isJoined` |
| 已加入的岛列表 | GET | `/island/v1/joined` |
| 搜索岛 | GET | `/island/v1/search` |
| 当前用户     | GET  | `/user/v1/me`        |
| 授权码兑换手机号（后端应用令牌） | POST | `/user/v1/phone/exchange` |
| 添加标记     | POST | `/mark/v1/add`       |
| 批量添加标记 | POST | `/mark/v1/batch/add` |
| 我的标记列表 | GET  | `/mark/v1/me/list`   |
| 我的标记搜索 | GET  | `/mark/v1/me/search` |
| 我的标记详情 | GET  | `/mark/v1/me/detail` |
| 批量添加想要 | POST | `/wishspu/v1/add`    |
| 批量取消想要 | POST | `/wishspu/v1/cancel` |
| 想要列表     | GET  | `/wishspu/v1/list`   |
| 本人非空心愿单列表 | GET | `/folder/v1/me` |
| 本人心愿单详情 | GET | `/folder/v1/detail` |
| 创建心愿单或修改条目 | POST | `/folder/v1/join` |
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
| 查询 OSS 额度 | GET | `/oss/v1/quota` |
| 准备 OSS 上传 | POST | `/oss/v1/upload/prepare` |
| 查询 OSS 审核与发布结果 | GET | `/oss/v1/upload/result` |
| C2C 连通检查 | GET | `/c2c-openapi/v1/ping` |
| 合作游戏价格曲线 | POST | `/c2c-openapi/v1/gamePriceLine` |
| 合作游戏价格模块 | POST | `/c2c-openapi/v1/gamePriceModule` |

完整字段与枚举见各服务 Swagger（§1 表格）。
