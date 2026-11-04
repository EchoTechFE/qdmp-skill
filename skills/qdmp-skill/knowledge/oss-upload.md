# OSS 图片与视频上传（POST）

## 接入前置：OpenAPI 与存储容量分别开通

在 [千岛开放平台](https://open.qiandao.com/) 的目标小程序下核对两项独立配置：

1. **OpenAPI 权限**：按实际调用申请 `GET /oss/v1/quota`、`POST /oss/v1/upload/prepare` 和 `GET /oss/v1/upload/result`，遵循 [OpenAPI 权限申请流程](./openapi-permission-flow.md)。
2. **能力权限中的 OSS 存储容量**：另行开通 OSS 存储能力及所需容量/大小额度。接口权限获批不代表存储容量已开通，quota 查询成功也不代表已获得可用容量。

容量大小、可申请状态、权限标识和界面名称以目标应用当前平台配置为准；不编造能力 key、resourceId、审批流程或统一默认容量。开通后用 quota 核对有效状态及实际可用字节；未开通、冻结或容量不足时处理对应配置/额度问题，不靠重试 prepare 或文件上传解决。不要把 OSS 容量能力写成虚构的 HTTP OpenAPI。

## 1. 链路与鉴权

```text
小程序 ── quota / prepare / result ──> 已有 OpenAPI 请求层 ──> 千岛 OpenAPI
小程序 ── qd.uploadFile：POST multipart（签名表单 + file） ──> OSS
OSS ── 平台回调、审核、发布 ──> GET result：status / cdnUrl
```

平台基址为 `https://openapi.qiandao.com`。

| 接口 | 作用 |
| --- | --- |
| GET /oss/v1/quota | 查询容量 |
| POST /oss/v1/upload/prepare | 申请本次上传凭据，取得 assetId |
| GET /oss/v1/upload/result?assetId=… | 查询当前应用资产的审核与发布结果 |

复用目标项目已有的登录、token 获取/刷新与请求代理。项目可能直接请求 OpenAPI，也可能通过自己的后端代理这些 JSON 接口；两者均不改变文件直接上传 OSS 的路径。按目标接口使用合适的应用/用户凭证，appSecret 与长期密钥只能留在后端。

quota、prepare、result 必须使用同一应用和环境。需要 `X-Echoing-Env` 时按目标配置设置，不能默认把 test-z 用于所有项目。OSS 使用 prepare 返回的 uploadUrl，校验 HTTPS 与已配置的可信主机；直传不附加应用 Access-Token、Authorization、Cookie、环境头。

上传方案沿用用户选择与项目现状；需要应用后端中转时，另读 [relay 适配](../references/oss-upload-relay.md)。不要混用直传和中转的参数。本文只约定技术链路与状态判断，不规定页面结构、固定文案、展示方式或测试入口。

### 风险与方案取舍

接入时，用简短文字向使用者说明下面边界，由使用者选择方案和是否进一步优化。已有明确选择则沿用，不能借“更安全”自行扩大任务或切换架构，也不必对每一步重复告知。

- **客户端可见的内容可被抓取。** 直传的 policy、signature、uploadUrl、callback、ticket 等都会到达客户端；policy 的 Base64 不是加密。前端隐藏参数、删除打印或放在SDK中都不能阻止设备使用者读取和重放。
- **签名权限和长期密钥不同。** x-oss-credential 中的 AccessKeyId 是标识；上传签名授权的是策略范围内的请求，不直接授予读取、删除其他对象或任意接口的权限。长期 AccessKeySecret、appSecret 不应下发。若真的发现长期 secret，需指出泄漏并在当前授权范围内处理，不能将它当成正常直传现象。
- **临时不等于一次性。** 在有效期内，签名可能被重复使用；“客户端只调用一次”是正常客户端的行为约束，不是 OSS 的一次性校验。固定 key、大小和 MIME 可以缩小范围，但没有可信内容摘要绑定时，不能保证上传字节与最初选择的文件相同。MIME 声明也不能代替真实内容检查。
- **看实际策略，不承诺已有防护。** 有效期、对象范围、覆盖控制及内容约束必须在服务端/OSS实际执行。禁止覆盖不等于消费一次；还需核对策略是否约束相关字段及桶版本控制行为。前端校验、CORS、小程序域名白名单均不能代替服务端鉴权。
- **中转与业务接口也能被重放。** 走中转后，客户端仍可抓包调用应用上传接口；prepare、result 等业务接口同样依赖真实身份、权限和资产归属校验，不能靠“只在小程序里调用”保证安全。

| 方案 | 客户端能拿到什么 | 实际收益与取舍 |
| --- | --- | --- |
| OSS 直传 | 本次受策略限制的 OSS 上传凭据 | 应用后端不接收文件字节；凭据在有效期/策略范围内可能复用，审核发布需由服务端确认 |
| 客户端持凭据的 relay（本技能兼容示例） | 同样拿到 prepare 的 OSS 表单 | 增加了中转处理位置和带宽成本；持凭据者仍可能绕过 relay 直传，不能承诺所有文件都经过中转检查 |
| 后端申请并保管凭据的中转 | 应用上传接口及其用户凭据，正常流程不下发 OSS 凭据 | 减少 OSS 凭据暴露，可在转发前检查文件；需要改造流程并承担接收/转发成本，应用接口仍须鉴权和校验 |

如用户考虑进一步优化，可按需求提出更短的签名有效期、收紧单对象权限、服务端限频/额度、可信内容摘要绑定、上传前扫描、后端保管 prepare 凭据等选项，并说明限制与成本。**这些属于可选的新增改造，不代表当前实现已经具备；是否实施、优先级及范围由用户决定。** 不擅自修改平台签名、桶配置、用户额度/有效期，不新增安全服务、产品弹窗或发布动作。复用现有鉴权、保守判断发布成功、不下发长期密钥等基础要求仍保持。

如果方案选择影响后续实现且用户未明确，简短询问一次；有既有授权时不重新申请许可。用户不选择额外优化时，按其已选方案完成基础功能，并在交付中如实列出保留的风险，不把风险描述为已消除。

依据：[OSS POST V4 签名与 policy](https://www.alibabacloud.com/help/en/oss/developer-reference/signature-version-4-recommend)、[OSS PostObject 覆盖控制](https://www.alibabacloud.com/help/en/oss/developer-reference/postobject)、[服务端签名直传方案](https://www.alibabacloud.com/help/en/oss/user-guide/obtain-signature-information-from-the-server-and-upload-data-to-oss)。“客户端持凭据的 relay 可被绕过”是根据这类凭据本身可直接授权 OSS 请求作出的设计判断。

## 2. 容量

`GET /oss/v1/quota` 无请求体，成功响应 data：

| 字段 | 含义 |
| --- | --- |
| quotaBytes | 容量上限，字节字符串 |
| usedBytes | 已正式发布占用容量，字节字符串 |
| reservedBytes | 已预占容量，字节字符串 |
| availableBytes | 可用容量，字节字符串 |
| status | ACTIVE / FROZEN |
| unit | BYTE |
| warningLevel | NORMAL / WARNING / CRITICAL |

保留外层 `code / message / data / requestId`。缺失或非法容量标为未知，保留字节字符串避免大整数精度丢失。MiB 为 bytes / 1024 / 1024；不能自行相减代替平台 availableBytes，也不要把 FROZEN 当正常可上传。

## 3. 文件选择与 prepare

图片可用 `qd.chooseImage`，视频可用 `qd.chooseVideo`；按需求使用 `qd.showActionSheet` 分流后调用对应选择器。ActionSheet 本身不产生文件，选择入口和交互由目标产品决定。

```js
qd.chooseImage({
  count: 1,
  sizeType: ["original"],
  sourceType: ["album", "camera"],
  success: handleImage,
  fail: handleSelectionFailure,
});
qd.chooseVideo({
  sourceType: ["album", "camera"],
  compressed: false,
  success: handleVideo,
  fail: handleSelectionFailure,
});
```

以上为两种选择方式的独立调用示意，不要在同一操作中同时执行两个选择器。按目标宿主兼容 callback / Promise；取消时结束本轮，不发 prepare。

文件信息标准化为 `{filePath, contentType, size}`：

- 图片从 `tempFiles[0].path / tempFilePath` 或 `tempFilePaths[0]` 取得路径；视频从 `tempFilePath` 取得。路径保留原值，包括 `echofile://`、`echoFile://`；不是网络 URL，也不是要传给后端读取的地址。
- 优先使用文件真实 MIME；可靠的后缀映射可作为补充。常见图片包括 JPG/PNG/WebP/GIF/HEIC/HEIF；视频示例为 MP4/MOV，MIME 分别为 video/mp4、video/quicktime。不要把所有图片强行标成 image/jpeg。
- size 为文件实际字节数，缺失时通过宿主 `getFileSystemManager().getFileInfo` 等能力读取实际文件。拿不到有效字节数就停止，不能写占位数或用文件路径/Base64 长度代替。
- 20 MiB（20971520 字节）只是应用限制示例，不是平台统一上限。支持格式和上限以目标项目及平台最新配置为准；不自动添加音频能力。
- 压缩、裁剪、转格式完成后再读取大小、申请 prepare。prepare 后锁定同一份路径和字节；更换文件或再次处理就重新准备。

```http
POST /oss/v1/upload/prepare
Content-Type: application/json
```

```json
{
  "type": "openmp",
  "contentType": "image/jpeg",
  "size": "466285",
  "source": "miniapp"
}
```

固定 `type=openmp`、`source=miniapp`；示例 size 不能作为预填默认值复用。成功响应示意（占位凭据不能用于上传）：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "assetId": "ASSET_ID_FROM_PREPARE",
    "expireAt": "EXPIRE_AT_UNIX_SECONDS",
    "uploadUrl": "https://OSS_BUCKET_HOST/",
    "uploadHeaders": {},
    "uploadFormData": {
      "policy": "POLICY_FROM_PREPARE",
      "x-oss-signature-version": "OSS4-HMAC-SHA256",
      "x-oss-credential": "CREDENTIAL_FROM_PREPARE",
      "x-oss-date": "DATE_FROM_PREPARE",
      "x-oss-signature": "SIGNATURE_FROM_PREPARE",
      "key": "KEY_FROM_PREPARE",
      "x-oss-content-type": "image/jpeg",
      "callback": "CALLBACK_FROM_PREPARE",
      "x:ticket": "TICKET_FROM_PREPARE",
      "x-oss-forbid-overwrite": "true"
    }
  },
  "requestId": "EXAMPLE_REQUEST_ID"
}
```

业务 code=0 才进入上传。校验 uploadUrl、assetId、uploadHeaders、uploadFormData、expireAt；expireAt 为 **Unix 秒**，比较前乘 1000，并在实际上传前再次检查。

uploadFormData 是非空字符串映射，不能含自定义 file 覆盖或应用凭证；示例展示 V4 响应，不是要求客户端生成固定字段清单。实际签名版本和字段以本次下发为准。当前 POST uploadHeaders 为空对象；返回不同结构时先核对新契约，不静默删除字段或从历史请求补值。只有旧 PUT URL、缺少表单、过期或类型无效均停止，不能拿 POST 试旧凭据。

## 4. qd.uploadFile 直传

```js
const uploadRequest = {
  url: prepared.uploadUrl,
  filePath: selectedFile.filePath,
  name: "file",
  header: { ...prepared.uploadHeaders },
  formData: { ...prepared.uploadFormData },
  timeout: 120000,
};
const task = qd.uploadFile({
  ...uploadRequest,
  success: handleOssResponse,
  fail: handleOssFailure,
});
```

完整的单次结算/超时/取消模板见 [oss-post-upload.mjs](../assets/oss-post-upload.mjs)。将其复制到目标项目，使用已有方式取得 qd，传入项目配置的可信 OSS 主机。模板不会选择文件、登录、prepare、查询 result、写日志或重试，这些由业务流程衔接。`httpSuccess` 只描述 HTTP 层；`transportConfirmed` 还校验成功回调与非 203，但两者都不代表最终已发布。

```js
import { onBeforeUnmount } from "vue";
import { startOssPostUpload, readOssPublication } from "./oss-post-upload.mjs";

let disposed = false, generation = 0, currentUpload;
function stopCurrentUpload() {
  generation += 1;
  currentUpload?.abort();
  currentUpload = undefined;
}
onBeforeUnmount(() => { disposed = true; stopCurrentUpload(); });
// 取消、选新文件或重新 prepare 前，也调用 stopCurrentUpload()。

async function uploadThenQuery(prepared, selectedFile) {
  if (disposed) return;
  stopCurrentUpload();
  const run = generation;
  const isCurrent = () => !disposed && run === generation;
  const assetId = prepared.assetId;
  // selectedFile 是本次 prepare 前确定且未再改变的文件快照。
  currentUpload = startOssPostUpload(qd, prepared, selectedFile.filePath, {
    allowedHosts: config.ossUploadHosts,
  });
  const transfer = await currentUpload.finished;
  if (!isCurrent() || transfer.callback === "cancelled") return;
  // transfer.raw 保留原始响应，parsedBody 单独解析；失败也可保留资产查询。
  const result = await api.get("/oss/v1/upload/result", { assetId });
  if (!isCurrent()) return;
  const publication = readOssPublication(result);
  // 仅当前操作可消费结果；published 为 true 才能作为已发布资产。
  return { transfer, publication };
}
```

上面是 Vue 资源生命周期控制示意；qd、config、api 使用项目已有实现，api.get 参数签名按实际封装调整，assetId 编码到查询参数。调用方按目标项目约定处理校验/查询异常，不自动重放。上传没有发出、prepare 失败时无需查 result；失败结果明确时保留真实错误，网络超时/203等结果不明仍可查询。取消/离页后的本轮不再自动发查询，已发出的查询晚到也不更新界面。新文件选择应使旧发布结果失效。

协议要求：

- uploadFile 原生发送 **POST multipart**，不传 method。不是 `qd.request` 的 JSON，也不是 PUT 原始文件；不自动改走中转。
- `formData` 直接传映射，不 stringify，不编码签名值；保留大小写和所有 `policy / callback / x:ticket / key / x-oss-*` 原值，不额外添加 source、size、assetId。
- `name` 固定 file；上传器把文本字段放前、唯一文件段放最后。遇到宿主编码问题需核对真实 multipart，JavaScript 对象排序不能证明线上文件段顺序。
- 不手工填写外层 Content-Type、boundary、Content-Length，不填 image/jpeg 作为整个请求类型。文件 MIME 和 multipart 请求类型不同。
- `prepare.size` / policy 的 content-length-range 针对文件字节，HTTP Content-Length 则含 multipart 额外开销。若策略要求 466285 字节，不能把整个表单长度回填为 size。
- 路径在表单 key 中，不拼到 uploadUrl 后；不重新签名，不把 POST callback 表单搬到旧 PUT 回调头。
- 原生 timeout=120000 ms，JS 看门狗=125000 ms；超时尝试 abort，但不宣称服务端操作已取消。回调和 Promise 同时返回时只结算一次；Promise.resolve(undefined) 仅表示桥接提交时继续等 callback。
- 用户取消、页面卸载要清计时器并 abort；新文件/新一轮加代次校验，旧响应不得覆盖。如消费高频上传进度，按需节流，不逐帧 stringify 整个记录。
- 一份 prepare 凭据只发起一次上传，不自动重传。失败不自动回退 PUT、request 或 relay。重测先查结果，再由用户重新准备新凭据。

## 5. 上传响应与错误

保留 callback 分支、statusCode、原始 header/data、assetId、发生时间和实际有返回的 requestId；JSON 解析另列，不能覆盖 XML/字符串。fail 分支也可能携带 HTTP 状态/错误体，不只看 success。

| 收到的结果 | 处理 |
| --- | --- |
| success + HTTP 2xx（非203） | 传输收到正常 HTTP 响应，继续查 result，不能直接当作已发布 |
| 200 + 回调业务错误或空/未知 body | 如实保留；HTTP 成功不能覆盖业务失败或推断发布完成 |
| 203 CallbackFailed | 对象上传已完成但 OSS 回调失败；查 result/回调链路，不自动重传 |
| 400 | 看 OSS XML 的 Code、Message、RequestId，核对表单、文件字节和策略；仅400不能断定具体原因 |
| 403 / 签名或策略错误 | 核对有效期、环境、字段是否原样、实际文件大小；不在客户端修改 policy/签名 |
| 405 | 核对当前凭据是否为 POST、真实 HTTP 方法与目标地址；状态本身不能证明网关或协议就是根因 |
| 409 / 禁止覆盖 | 查询原 assetId 的结果；不复用同 key 盲目重传 |
| 网络异常 / 超时 / 缺少 HTTP 响应 | 标记传输结果未确认、保留 assetId 后查 result；不能直接说文件未上传 |
| 只返回通用 errMsg，没有 OSS body | 标记原生返回不完整；让原生/服务端提供 OSS Code、Message、requestId 或抓包，不能伪造不存在的字段 |

上传回调可能返回如下业务结构：

```json
{
  "assetId": "ASSET_ID_FROM_PREPARE",
  "availabilityStatus": "ACTIVE",
  "code": "OK",
  "machineAuditStatus": "PASS",
  "url": "https://cdn.example/asset.png"
}
```

这属于**上传回调 body**，不能和下述 GET result 的 `status/cdnUrl` 混用。保留即可；最终发布状态按 result 契约判断。平台 callback 已由 prepare 配置，无需在业务小程序后端重复实现平台 `/oss/callback`。

## 6. 审核与发布查询

```http
GET /oss/v1/upload/result?assetId=ASSET_ID_FROM_PREPARE
```

```json
{
  "code": 0,
  "message": "",
  "data": {
    "status": "COMMITTED",
    "cdnUrl": "https://cdn.example/asset.jpg"
  },
  "requestId": "EXAMPLE_REQUEST_ID"
}
```

| data.status | 技术含义与后续操作 |
| --- | --- |
| RESERVED | 等待平台确认上传回调，不能当已发布 |
| REVIEWING | 审核中，可稍后刷新 |
| PUBLISHING | 发布中，可稍后刷新 |
| COMMITTED | 已发布；仍需校验 cdnUrl 有效 |
| REJECTED | 审核拒绝，终止等待 |
| CANCELLED | 上传取消或失败，终止等待 |
| EXPIRED | 预占到期，终止等待；需要时重新准备 |
| 未知 / 缺失 | 保留原值，按未知处理，不默认成功或无限等待 |

外层业务 code=0 仅表示查询成功。只有 `code=0 && data.status="COMMITTED" && cdnUrl有效` 才判定已发布；缺少 URL 时按响应不完整处理。

上传完成/203后查询一次；结果不明也可按需再次查询，不自动重新上传。如业务需要自动查询，使用有界次数/间隔，在终态、查询失败、未知状态、取消或离页时停止。查询触发方式由目标产品决定。

持久发布地址使用 result 的 CDN URL；不拼接 bucket/key，不用 uploadUrl、本地预览或回调 url 冒充发布地址。图片解码/视频播放失败属于媒体消费错误，不改写后端审核状态。对旧 URL 响应加本轮 assetId/代次校验。

## 7. 验证与依据

自动化重点：prepare失败阻止上传；缺少表单/旧PUT/过期/非法目标阻止调用；表单与文件路径保持原值；120000/125000超时；callback和Promise去重；取消和晚到结果隔离；203/非2xx/未知状态不误判已发布；只有有效COMMITTED CDN结果可作为发布地址。

按需做图片/视频、不同系统的真机验证，观察实际 multipart 和原始响应。构建通过不代表真机兼容全部通过。不能用过期的真实签名做默认参数。

本文以平台 POST prepare 与 result 的 status/cdnUrl 契约为依据。接口变化时先核对新契约，不把历史 HTTP 400 的猜测或单次成功推广为某系统的固定限制或所有格式均通过。

协议依据：[OSS PostObject](https://www.alibabacloud.com/help/en/oss/developer-reference/postobject)（POST表单、文件字段最后、上传器生成boundary）、[OSS上传回调](https://www.alibabacloud.com/help/en/oss/developer-reference/callback)（表单callback、自定义变量逐项传递、回调失败与对象上传分开判断）。千岛字段和业务状态以对应平台契约为准。

公开示例只用通用占位值，不能包含真实项目名、appId、appSecret、token、ticket、签名、有效签名 URL 或本地用户路径。日志和排查材料须脱敏；参考模块不增加日志或持久化，数据保留策略由目标项目决定。
