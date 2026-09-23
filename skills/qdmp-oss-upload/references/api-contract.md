# 千岛 OSS 接入契约

核对日期：2026-09-22。平台契约和应用适配约定分别标识，实际能力以目标项目的 SDK 和接口契约为准。示例只使用占位值，不可当作凭据。

## 1. 请求链路与配置

```text
小程序 ── GET quota / POST prepare ──> 应用后端 ──> 千岛 OpenAPI
小程序 ── qd.uploadFile multipart ──> 应用 relay ── PUT 图片原始字节 ──> OSS
小程序 <── relay 业务响应（含 OSS 原始响应）<───────────────────────────┘
```

平台基址为 `https://openapi.qiandao.com`；应用基址使用目标项目配置。quota/prepare 通过应用后端代理平台接口，复用项目已有鉴权与请求封装。

不得仅因为代理转发了 `access-token` / `authorization` 就宣称已验证用户身份。如需用户级隔离，应额外验证用户身份、凭据归属和使用范围。

## 2. 平台接口：GET /oss/v1/quota

无请求体。成功业务响应示例：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "status": "ACTIVE",
    "quotaBytes": "105906176",
    "availableBytes": "105906176",
    "unit": "BYTE",
    "reservedBytes": "0",
    "usedBytes": "0",
    "warningLevel": "NORMAL"
  },
  "requestId": "example-request-id"
}
```

| 字段 | 展示含义 |
| --- | --- |
| `quotaBytes` | 总额度，字节 |
| `availableBytes` | 当前剩余额度，字节 |
| `usedBytes` | 已使用，字节 |
| `reservedBytes` | 已预留，字节 |
| `status` | `ACTIVE` 可显示「可用」；其他值如实保留 |
| `warningLevel` | `NORMAL` 可显示「正常」；未知值不当作正常 |

保留原始字符串用于日志；展示时先校验，再换算为 MiB。不用减法代替平台返回的 `availableBytes`。总量为零时避免除零，缺失或非法数值显示未知；大整数不得静默丢失精度。

## 3. 平台接口：POST /oss/v1/upload/prepare

当前图片场景的 JSON 请求：

```json
{
  "type": "openmp",
  "contentType": "image/jpeg",
  "size": "9241"
}
```

- `type: openmp` 是当前已验证的取值，不推断其他枚举。
- `contentType` 对应待上传文件的实际 MIME；`size` 是实际文件字节数，不是路径、Base64 或 multipart 总长度。
- 本地 path、字节或类型发生变化时必须重新申请，不对 prepare 绑定的图片再次压缩。

选图时优先取 `tempFiles[0].path`，其次为 `tempFiles[0].tempFilePath` 和 `tempFilePaths[0]`；大小优先取 `tempFiles[0].size`，缺失时读取文件信息。MIME 优先取 `tempFiles[0].type` / `mimeType` 中的 `image/*`，其次使用路径扩展名映射，无法确定则停止。迁移 SDK 版本时必须重新核对返回字段。

成功响应数据示例：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "expireAt": "1790071006",
    "uploadUrl": "https://oss-host.example/staging%2FAPP_ID%2FASSET_ID.jpg?SIGNED_QUERY",
    "uploadHeaders": {
      "x-oss-callback-var": "CALLBACK_VARIABLES_FROM_PREPARE",
      "x-oss-forbid-overwrite": "true",
      "Content-Type": "image/jpeg",
      "x-oss-callback": "CALLBACK_FROM_PREPARE"
    },
    "assetId": "ASSET_ID"
  },
  "requestId": "example-request-id"
}
```

`expireAt` 是 Unix 秒。URL 和头必须使用本次的真实返回值，`uploadHeaders` 不自行生成，URL 保留原始编码与签名参数。

## 4. 应用接口：POST /oss/v1/upload/relay

该中转接口由应用实现，不是千岛平台 OpenAPI。前端调用形状：

```js
qd.uploadFile({
  url: `${backendBase}/oss/v1/upload/relay`,
  filePath: selectedImage.filePath,
  name: 'file',
  header: { accept: 'application/json', 'access-token': accessToken },
  formData: {
    uploadUrl: prepared.uploadUrl,
    uploadHeaders: JSON.stringify(prepared.uploadHeaders),
    assetId: String(prepared.assetId),
    expireAt: String(prepared.expireAt),
    size: String(selectedImage.size)
  },
  timeout: 120000,
  success(response) {
    record({ callback: 'success', response })
  },
  fail(response) {
    record({ callback: 'fail', response })
  }
})
```

不在前端 header 中设置 `image/jpeg` 或手写 multipart boundary，不将 `filePath` 字符串当文件字节发送。如同时兼容回调和 Promise，使用一次性完成标志避免重复写入结果。

### Relay 校验边界

- 单文件字段名为 `file`，当前应用适配层上限为 20 MiB。只接收 `uploadUrl/uploadHeaders/assetId/expireAt/size` 五个表单字段，拒绝未知、重复或过长字段。
- OSS 主机必须在应用后端配置的白名单中，协议必须为 HTTPS，路径必须匹配本应用对象前缀、appId 和 assetId；拒绝任意域名、端口、URL 用户信息和 fragment。
- `assetId` 当前为 32 位小写十六进制。检查签名参数唯一性、有效期、`expireAt` 和凭据格式；最终签名真实性仍由 OSS 验证。
- 当前必需且唯一的查询参数是 `x-oss-signature-version/signature/date/expires/credential/additional-headers`。版本为 `OSS4-HMAC-SHA256`，`signature` 为 64 位十六进制，`expires` 是不超过 604800 的正整数秒。
- 路径只在校验副本中 decode 一次并完整匹配 appId、assetId 和扩展名；发往 OSS 时仍使用原始 pathname 和 search。
- `size` 必须与实际文件长度相同，并校验扩展名、`Content-Type`、multipart MIME 和文件头。当前适配范围为 jpg/jpeg/png/webp/gif/heic/heif。
- 允许的 OSS 头名为 `Content-Type`、`Content-Length`、`Content-MD5`、`x-oss-callback`、`x-oss-callback-var`、`x-oss-forbid-overwrite`（大小写不敏感）。拒绝重复或非法头，保留签名值，`Content-Length` 使用真实字节数。
- 上游请求为 `PUT + 图片原始字节`，不是 JSON、Base64 或 multipart。不转发 token/cookie，不跟随跳转，不对 203 或结果不明的超时自动重传。
- 限制接收时间、上游时间和 OSS 响应大小；客户端断开时停止上游。响应截断时返回 `truncated: true` 与 error，不当作完整成功记录。

### Relay 响应

收到上游响应后，应用可返回：

```json
{
  "code": 0,
  "message": "上传成功",
  "data": {
    "assetId": "ASSET_ID",
    "request": {
      "method": "PUT",
      "url": "SIGNED_OSS_UPLOAD_URL",
      "header": { "Content-Type": "image/jpeg", "Content-Length": 9241 },
      "size": 9241
    },
    "response": {
      "statusCode": 200,
      "header": {
        "content-type": "application/json",
        "x-oss-request-id": "example-oss-id"
      },
      "data": "{\"assetId\":\"ASSET_ID\",\"availabilityStatus\":\"ACTIVE\",\"code\":\"OK\",\"machineAuditStatus\":\"PASS\",\"url\":\"https://cdn.example/ASSET_ID.jpg\"}"
    }
  }
}
```

`request.header` 必须保留实际使用的动态头，不能只记录示例字段。

- OSS HTTP 非 2xx、203 或网络失败：relay 返回业务 `code: 50201`，保留 `data.response`，网络错误可带 `error`。
- 未提供 token：应用 HTTP 401，业务 code 10006。
- 本地输入错误：应用 HTTP 400/413 等，业务 code 与该状态一致。
- OSS HTTP 203：文件可能已存储，但平台回调失败；保留 assetId、requestId、`x-oss-request-id` 和请求时间供后续核实，不重复 PUT 同一对象。

本契约未提供资产状态查询或补回调接口，不得自行编造。

## 5. 分层解析、成功判断与图片

页面记录有三层：

```js
// rawUpload = { callback, response: qd.uploadFile 的原始响应 }
const parseBody = value => typeof value === 'string' ? JSON.parse(value) : value
const relay = parseBody(rawUpload.response.data)
const ossResponse = relay.data?.response
const ossBody = parseBody(ossResponse?.data)
const imageUrl = ossBody?.url
```

实际实现必须捕获 `JSON.parse` 错误，因为错误 body 可能是 XML 或文本。保持 `rawUpload`、`relay`、`ossResponse` 原样，展示解析结果时使用独立变量。如输入已是 `{ statusCode, header, data }` 的 OSS 层响应，只解析其 `data`，不再假设有 `relay.data.response`。

成功条件必须同时成立：

- 原生 callback 为 `success`。
- 原生 `response.statusCode` 为 2xx。
- `relay.code` 为 0。
- OSS `statusCode` 为 2xx 且不是 203。
- 不存在上游 `error` 或 `truncated`。

`availabilityStatus: ACTIVE` 和 `machineAuditStatus: PASS` 只是已观察到的值，不臆造状态全集，也不承诺资源永久可用。

成功且 `ossBody.url` 是有效 HTTP(S) 图片地址时，在完整响应下方展示图片。不用 `uploadUrl` 或本地缩略图冒充上传后的结果。缺少 URL 时保留响应并提示未提供图片地址；图片加载失败单独提示，不回写上传结论；新一轮选择或上传时清理旧图片。

对 quota、prepare、`qd.uploadFile`、OSS PUT 分别保留请求和响应：请求默认折叠，响应默认展开，都可复制完整内容。验收页按用户授权保留诊断信息；公开文档与常规持久日志不记录 token 或签名凭据。
