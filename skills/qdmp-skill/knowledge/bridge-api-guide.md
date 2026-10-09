# 千岛小程序 Bridge API 使用指南

> 本指南用于 2.0（EMP）小程序。文中的 SDK 1.0.0 是能力版本，不是 1.0 小程序运行时；不提供 effuse/SPA 配置或开发路径。

千岛小程序通过 `qd.*` Bridge API 与千岛 App 原生能力交互。统一使用 `qd.*` 调用，SDK 会将请求映射到对应的原生实现。

> 能力版本、平台支持与调用形式以各节说明为准。未标明支持范围的能力，应在目标运行端逐项检测，不根据版本号推断全部可用。

以下回调类型供各异步接口复用：

```ts
type BridgeSuccessCallback<T = Record<string, unknown>> = (res: T) => void
type BridgeFailCallback = (err: { errMsg?: string; [key: string]: unknown }) => void
type BridgeCompleteCallback = (res: unknown) => void
```

---

## 一、授权 (auth)

### qd.login — 获取登录凭证

```js
const res = await qd.login()
console.log(res.code) // 临时登录凭证，用于换取 session
```

设备权限的全局声明配置见 [development-guide.md](./development-guide.md) 的「小程序全局权限配置」。全局声明只描述能力用途；运行时仍应在用户主动触发功能后按需请求授权。下面的 `user.*` 用户授权用于 OpenAPI，不属于普通设备权限，也不代表登录或应用已开通相应 OpenAPI。

### qd.getEchoAuthorize — 查询用户授权状态

接入前确认目标应用的 SDK、实际调用的 OpenAPI **method + path** 及其正式 scope 映射，沿用项目现有登录和请求封装。`user.profile.read` 只是用户信息场景示例；不要根据页面名猜测 scope。

```js
const scopes = ['user.profile.read'] // 替换为目标接口正式配置的 scopes
const result = await Promise.resolve(qd.getEchoAuthorize({ scopes }))
```

生产接入的查询只传参数对象，不注入 `success` / `fail` 回调。接入资料中已观察到的返回结构如下；以目标宿主实际结果为准，不补造缺失字段，也不预设零参数或空参数调用的结果：

```json
{
  "isOpen": true,
  "scopes": [
    { "authScope": "user.profile.read", "authStatus": "authorized", "isOpen": true }
  ]
}
```

| 字段 | 判定方式 |
| ---- | -------- |
| 顶层 `isOpen` | 用户授权总开关；为 `false` 时任何单项都不可视为可用，缺失或非布尔值时无法判断 |
| `scopes[].authScope` | 每个请求 scope 必须有且仅有一个匹配项；缺项、重复或畸形时无法判断 |
| `scopes[].authStatus` | `authorized` 表示已授权，`unauthorized` 表示尚未授权，`rejected` 表示已拒绝；其他值无法判断 |
| `scopes[].isOpen` | 单项开关，必须为布尔值；不能代替顶层总开关 |

只有顶层 `isOpen === true`，且对应唯一项的 `authStatus === 'authorized'`、`isOpen === true` 时，才能认为该项在查询时开放。查询不改变授权状态，也不保证随后业务 API 一定放行。

### qd.requireEchoAuthorize — 申请用户授权

授权弹窗在**千岛宿主 App 版本 `>= 6.64.1`** 时可用，`6.64.1` 本身满足条件。按数字段比较宿主版本，不按字符串字典序比较；这里不是小程序包版本或 SDK 版本，也不能据此推断 `qd.getEchoAuthorize` 的最低版本。调用前结合 `qd.canIUse` 或函数存在性检查探测能力，不承诺未经实机验证的端行为一致。

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| `scopes` | `string[]` | 需要申请的正式 scopes；一次原始请求最多 5 项，重复项也计入数量 |
| `success` | `(result) => void` | 真实成功回调，保留原始结果 |
| `fail` | `(error) => void` | 真实失败回调，保留原始错误码、提示及结构 |

```js
qd.requireEchoAuthorize({
  scopes: ['user.profile.read'],
  success(result) {
    // 保存原始授权回调，再继续业务请求；业务响应仍需独立判断
  },
  fail(error) {
    // 按下表处理原生授权错误，不改写为业务接口错误
  },
})
```

同步返回 `true`、`undefined` 或弹窗已打开均不代表用户同意，以实际成功/失败回调及业务结果为准。如果目标宿主同时返回 Promise，避免同一次操作重复结算，也不能把仅表示派发完成的 Promise 当成授权成功。等待原生回调应设置明确超时边界，超时记录为等待超时，不伪造成功。

原始请求超过 5 项时优先报 `10012`；未传、空数组或没有有效 scope 时报 `10011`。

| 原生申请错误码 | 含义 | 处理建议 |
| ---- | ---- | -------- |
| `10009` | 应用未申请某个请求 scope | 核对应用 OpenAPI 开通状态 |
| `10010` | 用户未授予应用某个请求 scope | 提示所需权限尚未获得 |
| `10011` | 未提供有效 scopes | 修正调用参数 |
| `10012` | 原始请求超过 5 项 | 调整单次申请项数 |
| `10021` | 最终结果中至少一项被拒绝 | 提示到小程序设置开启具体权限 |
| `10022` | 用户授权总开关关闭 | 提示到小程序设置开启总开关 |
| `10030` | 查询或保存授权结果发生网络异常 | 提示稍后重试并保留原始错误 |
| 服务端原始错误码 | 服务端处理失败 | 保留原始错误码和提示 |

本表仅用于 **`qd.requireEchoAuthorize` 原生授权回调**，不要与 [OpenAPI 业务错误码](./api-guide.md#13-错误与排查) 混用；即使两者都返回 `10021`，来源和处理阶段也不同。不要把 `already authorized` 的原生失败自行改判为成功。用户授权设置入口是宿主右上角菜单 → 设置，不假设普通设备权限的 `qd.openSetting` 可以管理 `user.*` 授权。

### 用户授权推荐接入流程

以下是减少重复查询、弹窗的一种**推荐方案，不是平台强制接入顺序**。可以按产品需要调整交互，同时保持真实状态判断、原生错误处理和服务端鉴权。

#### 宿主版本兼容

推荐在项目入口统一读取可靠的宿主 App 版本，低于 `6.64.1` 的用户首次进入时提示一次升级，避免每个模块重复提示。提示文案可用「当前千岛版本暂不支持用户授权弹窗，请更新至 6.64.1 或更高版本后，再使用需要授权的功能。」入口提示和再次提示时机由产品决定。

低版本不尝试拉起已知不可用的授权弹窗，也不清空页面或阻断不需要该权限的功能。版本未知时不能直接认定不支持，应结合实际能力检测处理。

#### 同一登录会话内首次模块操作

1. 页面正常挂载，不通过路由守卫或整页条件渲染等待授权。用户首次触发该模块操作时，先确保登录，再查询模块全部相关 scopes；并发操作可共享在途查询，同模块重进、刷新或改用写操作不重复初始化。
2. 先判断总开关和结果完整性，再检查单项开关与状态。仅在总开关、单项开关都开启且状态明确时，将 `unauthorized` 项汇成一次申请（最多 5 项，超过时先调整本次操作的申请范围）；已授权项不重复申请，拒绝、关闭或未知项不自动弹窗。
3. 初始化查询失败、结果不完整、用户拒绝、取消或等待超时时，保留原始记录，继续展示页面并请求真实业务 API，由服务端决定放行。初次授权引导失败不伪装成业务失败；账号已切换时停止旧操作，并重置会话内的初始化记录。
4. 申请真实成功后直接请求业务，不立即补查。模块在当前登录会话内记为「已尝试」，不记为「保证已授权」。

#### OpenAPI 业务返回 `10021` 时恢复

可信 OpenAPI 的业务 `code: 10021` 表示用户未授权，响应可能包含 `auth_scope`、`auth_status`、`auth_name`。接入资料中也存在随 HTTP 401 返回的情况，不能只接受错误表中的 HTTP 403，也不能把 HTTP 401 一律当作 Token 过期。

1. 优先使用本次可信业务响应中非空的 `auth_scope`。缺失时，仅当原请求的 **method + path** 有正式、唯一、非空的 scope 映射才可回退使用；未知接口、明确无 scope 或多项映射不能猜测，无法确定单项时保留响应并停止恢复。
2. 对确定的单个 scope 重新查询，不沿用模块初始化快照。总开关关闭、查询失败或结果不完整时提示并停止；已拒绝或单项关闭时提示到小程序设置开启；总开关和单项均开放且已授权但业务仍拒绝时，提示权限状态不一致。
3. 仅在总开关和单项开关都开启、状态为 `unauthorized` 时申请该单项。收到原生真实成功回调后，以原方法、URL、参数和既有幂等标识重试业务**一次**，不再查询；申请失败、取消、超时或重试仍返回 `10021` 时停止，不循环弹窗。
4. 写操作自动重试须以服务端在副作用前完成权限校验、且遵守现有幂等/防重复提交契约为前提。网络超时等执行结果不明的请求不能按「未执行」自动重放。其他业务错误保留原始错误码与文案，不用授权提示覆盖。

初始化失败可继续真实业务请求；进入业务 `10021` 恢复阶段后，状态不明或授权失败则停止恢复。页面导航、列表框架和表单保持可用，只在受权限影响的数据或操作处展示授权结果。

分别保留首次查询、原生申请、业务原响应、单项恢复查询、授权回调和重试结果的完整结构与来源，以及业务 `requestId`（若返回）。对外分享前移除项目名称、应用 ID、账号与个人资料、设备编号、token、内部地址和调试凭据；未经 iOS、Android、鸿蒙实机验收，不标记对应端已通过。

---

## IM 消息订阅 (im)

### qd.requestSubscribeMessage — 请求订阅 IM 消息通知

`qd.requestSubscribeMessage` 请求用户订阅 IM 消息通知。当前能力广场标记支持 Android、iOS、Harmony；跨端调用前仍应通过 `qd.canIUse('requestSubscribeMessage')` 或函数存在性检查做能力探测。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `tmplIds` | `string[]` | 是 | 业务侧配置的消息模板 ID 列表 |
| `success` | `(res: Record<string, string>) => void` | 否 | 结果对象以模板 ID 为键 |
| `fail` | `BridgeFailCallback` | 否 | 接口调用失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

模板结果状态：

| 状态 | 含义 | 处理建议 |
| ---- | ---- | -------- |
| `accept` | 用户同意订阅 | 记录授权结果，继续后续业务流程 |
| `reject` | 用户拒绝订阅 | 保持主流程可用，不要循环弹窗 |
| `ban` | 模板被平台封禁 | 停止使用该模板并检查平台配置 |
| `filter` | 同标题模板被过滤 | 检查本次提交的模板组合，避免依赖该模板结果 |

```js
const tmplId = '由业务侧提供的模板 ID'

if (!qd.canIUse('requestSubscribeMessage')) {
  // 当前端不支持：保留主流程，按业务需要给出非阻塞提示
} else {
  qd.requestSubscribeMessage({
    tmplIds: [tmplId],
    success(res) {
      const status = res[tmplId]
      if (status === 'accept') {
        console.log('用户已同意订阅')
      } else {
        console.log('用户未同意本模板:', status)
      }
    },
    fail(err) {
      console.error('请求订阅失败:', err)
    },
  })
}
```

只在用户明确点击订阅、提醒等入口后调用，不要在页面加载或应用启动时自动弹出。不要复制能力广场的测试模板 ID；模板 ID 必须来自当前业务配置。接口成功返回只代表本次订阅选择完成，消息发送仍由后续服务端业务负责。

---

## 二、基础 (base)

### qd.canIUse — 判断 API 是否可用

```js
const available = qd.canIUse('showToast')       // true
const available2 = qd.canIUse('getSystemInfo')   // true
```


## 三、千岛生态 (ecosystem)

以下接口均接收可选的 `success`、`fail`、`complete` 回调。

### qd.joinIsland — 加入岛屿

```js
qd.joinIsland({ islandId: '301964' })
```

仅判断当前用户是否已加入时，使用 [OpenAPI 加入状态查询](./api-guide.md#48-get-islandv1isjoined) 的 `GET /island/v1/isJoined?islandId=<islandId>`，在用户授权凭证下检查 `data.joined`。同时需要岛屿基本信息时使用 [岛屿详情](./api-guide.md#47-岛屿详情与加入状态) 的 `GET /island/v1/detail?id=<islandId>`，检查 `data.island.joined`；两者参数名与返回层级不同。`qd.joinIsland` 用于加入操作，不用作状态查询；操作完成后重新查询刷新状态。

### qd.openPost — 打开帖子发布页

`qd.openPost` 在保留原有岛屿、应用和媒体参数的基础上，支持预填帖子标题、正文、SPU/Tag 标签以及发布成功后的业务跳转信息。`files` 和 `labels` 都需要先序列化为 JSON，再对 UTF-8 字节进行 Base64 编码；`bizData` 只需传 JSON 字符串，不需要进行 Base64 编码。不要直接传数组，也不要使用旧示例中的 `spuIds`、`tagIds`。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `islandId` | `string` | 是 | 发布目标岛屿 ID |
| `appId` | `string` | 是 | 当前千岛小程序 App ID |
| `title` | `string` | 否 | 预填的帖子标题 |
| `content` | `string` | 否 | 预填的帖子正文 |
| `labels` | `string` | 否 | `{ id, type }[]` 的 UTF-8 Base64；`type` 使用 `spu` 或 `tag` |
| `files` | `string` | 否 | 媒体描述数组的 UTF-8 Base64 |
| `bizData` | `string` | 否 | 业务跳转信息的 JSON 字符串，结构为 `{ ShowTitle, path, query }`；不要进行 Base64 编码 |
| `success` | `BridgeSuccessCallback` | 否 | 打开成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 打开失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

`bizData` 字段名区分大小写：`ShowTitle` 是跳转入口展示文案；`path` 是小程序内页面路由，不带开头的 `/`；`query` 是开发者根据目标页面自定义的参数串，不带开头的 `?`。保留 `ShowTitle`，并用 `path` 和 `query` 替代原有的 `DaoLink`。下方的 `pages/view/index` 与 `patternId=${normalizedPatternId}` 仅是图案详情场景示例，不是固定值。

网络图片使用 `fileType: 'url'`；通过 `qd.chooseImage` 得到的本地临时路径使用 `fileType: 'file'`：

```js
import { utf8ToBase64 } from '@/utils/base64'

const files = [
  {
    mimeType: 'image',
    fileType: 'url',
    value: 'https://public.qiandaocdn.com/interior/images/f8H2svWMB0f.jpg'
  }
]

const labels = [
  { id: '1035310528576136310', type: 'spu' },
  { id: '1035310536092327061', type: 'spu' },
  { id: '1888802', type: 'tag' }
]

const normalizedPatternId = String(patternId).trim()
const bizData = {
  ShowTitle: '查看详情',
  path: 'pages/view/index',
  query: `patternId=${normalizedPatternId}`
}

qd.openPost({
  islandId: '300358',
  appId: 'xxxxxxxx',
  title: '帖子标题',
  content: '帖子正文',
  labels: utf8ToBase64(JSON.stringify(labels)),
  files: utf8ToBase64(JSON.stringify(files)),
  bizData: JSON.stringify(bizData)
})
```

本地图片示例：

```js
const res = await qd.chooseImage({
  count: 1,
  sizeType: ['compressed'],
  sourceType: ['album', 'camera']
})

const files = [
  {
    mimeType: 'image',
    fileType: 'file',
    value: res.tempFilePaths[0]
  }
]

qd.openPost({
  islandId: '300358',
  appId: 'xxxxxxxx',
  files: utf8ToBase64(JSON.stringify(files))
})
```

### `qd.cancelWish` — 取消一条想要记录

`qd.cancelWish` 是 SDK Bridge 能力。参数 `id` 是一条“想要”记录自身的 ID，可直接取自 `GET /wishspu/v1/list` 返回的 `data.items[].id`；它不是 `data.items[].spu.id`，也不是其他 SPU ID。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `id` | `string` | 是 | 想要记录 ID，即 `WishSpuItem.id` |
| `success` | `BridgeSuccessCallback` | 否 | 取消成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 取消失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```js
function cancelWishItem(wishItem) {
  if (typeof qd.cancelWish !== 'function') {
    qd.showToast({ title: '当前版本暂不支持取消想要', icon: 'none' })
    return
  }

  qd.cancelWish({
    id: String(wishItem.id), // 想要记录 ID，不是 wishItem.spu.id
    success() {
      qd.showToast({ title: '已取消想要', icon: 'success' })
      reloadWishList({ offset: 0 })
    },
    fail(err) {
      console.error('取消想要失败:', err)
    }
  })
}
```

调用时无需再额外调用 `qd.showModal`；参考包中直接调用此 Bridge，由 SDK 原生侧负责交互。成功后重新拉取列表，避免本地状态与服务端不一致。

> 注意：OpenAPI 的 `POST /wishspu/v1/cancel` 使用 SPU ID 列表，而 `qd.cancelWish` 使用想要记录 `id`。两者参数语义不同，不要混用。

### `qd.cancelMark` — 删除一条 Mark 记录

`qd.cancelMark` 是 SDK Bridge 能力。参数 `markId` 是单条 Mark 历史记录 ID，可取自 `GET /mark/v1/me/detail` 返回的 `data.marks[].id`；它不是详情外层的 `data.id`，也不是 `data.spu.id`。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `markId` | `string` | 是 | 单条 Mark 记录 ID，即 `MarkDetail.id` |
| `success` | `BridgeSuccessCallback` | 否 | 删除成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 删除失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```js
function cancelMarkItem(mark) {
  if (typeof qd.cancelMark !== 'function') {
    qd.showToast({ title: '当前版本暂不支持删除标记', icon: 'none' })
    return
  }

  qd.cancelMark({
    markId: String(mark.id), // data.marks[] 中的记录 ID，不是 SPU ID
    success() {
      qd.showToast({ title: '已删除标记', icon: 'success' })
      reloadMarkDetail()
    },
    fail(err) {
      console.error('删除标记失败:', err)
    }
  })
}
```

调用时无需再额外调用 `qd.showModal`；参考包中直接调用此 Bridge，由 SDK 原生侧负责交互。参考包成功后会在本地移除对应历史记录并调整选中项；通用实现更建议重新拉取详情，保证计数和分页状态准确。

这两个能力都应通过 `qd.*` 调用，不要实现成面向用户的 HTTP 请求。参考包中的实际参数结构分别是 `qd.cancelWish({ id })` 和 `qd.cancelMark({ markId })`。

### qd.share — 分享链接卡片或图片

`type` 是区分参数结构的必填字段。分享链接时使用 `link`，分享图片时使用 `image`。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `type` | `'link' \| 'image'` | 是 | 分享内容类型 |
| `title` | `string` | `link` 时是 | 卡片标题 |
| `desc` | `string` | `link` 时否 | 卡片描述 |
| `url` | `string` | `link` 时是 | 点击卡片后打开的地址 |
| `cover` | `string` | `link` 时否 | 卡片缩略图 URL |
| `image` | `string` | `image` 时是 | 要分享的图片 URL |
| `success` | `BridgeSuccessCallback` | 否 | 调用成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 调用失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```ts
type ShareOptions =
  | {
      type: 'link'
      title: string
      desc?: string
      url: string
      cover?: string
      success?: BridgeSuccessCallback
      fail?: BridgeFailCallback
      complete?: BridgeCompleteCallback
    }
  | {
      type: 'image'
      image: string
      success?: BridgeSuccessCallback
      fail?: BridgeFailCallback
      complete?: BridgeCompleteCallback
    }
```

```js
// 分享链接卡片
qd.share({
  type: 'link',
  title: '卡片标题',
  desc: '卡片文本',
  url: 'https://qiandao.com/miniapp?appId=yourAppId',
  cover: 'https://example.com/cover.png'
})

// 分享图片
qd.share({
  type: 'image',
  image: 'https://example.com/share.png'
})
```

### qd.showShareMenu — 显示当前页面的转发按钮

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| ---- | ---- | ---- | ------ | ---- |
| `withShareTicket` | `boolean` | 否 | `false` | 是否启用带 `shareTicket` 的转发 |
| `menus` | `Array<'shareAppMessage' \| 'shareTimeline'>` | 否 | — | 显示“发送给朋友”和/或“分享到朋友圈”入口 |
| `success` | `BridgeSuccessCallback` | 否 | — | 调用成功回调 |
| `fail` | `BridgeFailCallback` | 否 | — | 调用失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | — | 调用结束回调 |

```js
qd.showShareMenu({
  withShareTicket: true,
  menus: ['shareAppMessage', 'shareTimeline']
})
```

### qd.openMiniWindow — 开启图片悬浮窗

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `imageUrl` | `string` | 是 | 悬浮窗展示的图片 URL |
| `success` | `BridgeSuccessCallback` | 否 | 开启成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 开启失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```js
qd.openMiniWindow({
  imageUrl: 'https://example.com/image.png',
  success(res) {
    console.log('开启成功', res)
  },
  fail(err) {
    console.error('开启失败', err)
  }
})
```

### qd.postSPUPriceLine — 获取 SPU 价格走势

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `spuId` | `string` | 是 | SPU ID；即使后端为 int64，Bridge 中也必须以字符串传递 |
| `bucketLength` | `string` | 否 | 时间窗口，例如 `1d`、`1w`；可用值以返回的 `availableBucketLengths` 为准 |
| `success` | `(res: SPUPriceLineResult) => void` | 否 | 调用成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 调用失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```ts
interface SPUPricePoint {
  bucketTimestamp?: string
  bucketStr?: string
  price?: number
  unit?: string
  tradingVolume?: number
}

interface SPUPriceInfo {
  id?: string
  name?: string
  cover?: string
  publishPrice?: string
}

interface SPUPriceLineResult {
  prices?: SPUPricePoint[]
  availableBucketLengths?: string[]
  spuInfo?: SPUPriceInfo
}
```

```js
qd.postSPUPriceLine({
  spuId: '785890508776944465',
  bucketLength: '1d',
  success(res) {
    console.log(res.prices, res.availableBucketLengths, res.spuInfo)
  }
})
```

### qd.postSPUPriceModule — 发布 SPU 价格模块

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `spuId` | `string` | 是 | SPU ID；即使后端为 int64，Bridge 中也必须以字符串传递 |
| `success` | `(res: SPUPriceModuleResult) => void` | 否 | 调用成功回调 |
| `fail` | `BridgeFailCallback` | 否 | 调用失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

```ts
interface SPUPriceSummary {
  priceTitle?: string
  price?: number
  priceIncreaseRatio?: number
  volumeTitle?: string
  volume?: number
  sellingCountTitle?: string
  sellingCount?: number
  tradeType?: string
  currency?: string
}

interface SPUPriceModuleResult {
  priceSummaryList?: SPUPriceSummary[]
}
```

```js
qd.postSPUPriceModule({
  spuId: '785890508776944465',
  success(res) {
    console.log(res.priceSummaryList)
  }
})
```

---

## 四、扩展 (ext)

### qd.extBridge — 调用第三方扩展能力

| 平台 | Android | iOS | Harmony | Web |
| ---- | ------- | --- | ------- | --- |
| 支持 | ✓       | ✓   | ✓       | ✓   |

```js
qd.extBridge({
  action: 'customAction',
  data: { key: 'value' },
  success(res) { console.log(res) },
  fail(err) { console.error(err) }
})
```

### qd.extOnBridge / qd.extOffBridge — 订阅/取消扩展事件

```js
// 订阅
qd.extOnBridge({
  event: 'customEvent',
  callback(res) { console.log('收到事件:', res) }
})

// 取消订阅
qd.extOffBridge({ event: 'customEvent' })
```

### qd.onLoginStatusChanged / qd.offLoginStatusChanged — 监听登录态变化

| 平台 | Android | iOS | Harmony | Web |
| ---- | ------- | --- | ------- | --- |
| 支持 | ✓       | ✓   | ✓       | ✓   |

```js
const callback = (res) => {
  console.log('登录态变化:', res)
}

qd.onLoginStatusChanged(callback)

// 取消监听
qd.offLoginStatusChanged(callback)
```

---

## 五、网络 (network)

### qd.request — 发起网络请求

| 平台 | Android | iOS | Harmony | Web |
| ---- | ------- | --- | ------- | --- |
| 支持 | ✓       | ✓   | ✓       | ✓   |

```js
const res = await qd.request({
  url: 'https://api.example.com/data',
  method: 'POST',
  header: { 'Content-Type': 'application/json' },
  data: { key: 'value' }
})
console.log(res.data, res.statusCode)
```

### qd.uploadFile — 上传文件

```js
const res = await qd.uploadFile({
  url: 'https://api.example.com/upload',
  filePath: tempFilePath,
  name: 'file',
  formData: { desc: '文件描述' }
})
```

### qd.downloadFile — 下载文件

`qd.downloadFile` 将 HTTP/HTTPS 文件下载到本地临时目录。API 名称严格写作 `downloadFile`（小写 `d`），不要写成 `downLoadFile`。能力广场标记该能力从 SDK 1.0.0 起支持 Android、iOS、Harmony 和 Web。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `url` | `string` | 是 | HTTP 或 HTTPS 文件地址 |
| `success` | `(res: DownloadFileResult) => void` | 否 | 原生下载成功后的最终结果 |
| `fail` | `BridgeFailCallback` | 否 | 下载失败回调 |
| `complete` | `BridgeCompleteCallback` | 否 | 调用结束回调 |

成功结果中的本地路径以运行端实际返回为准。能力广场会同时兼容读取 `tempFilePath` 和 `filePath`，业务代码也应优先使用 `tempFilePath`，并以 `filePath` 作为兼容回退：

```js
qd.downloadFile({
  url: 'https://example.com/file.png',
  success(res) {
    const localPath = res.tempFilePath || res.filePath
    if (!localPath) {
      console.error('下载结果未包含本地文件路径:', res)
      return
    }
    console.log('文件已下载到:', localPath)
  },
  fail(err) {
    console.error('下载失败:', err)
  },
})
```

该接口的同步返回值可能是带 `abort()` 的 `DownloadTask` 句柄，也可能是 Promise 或 `undefined`。`DownloadTask` 只代表任务已创建，Promise 也可能只表示调用已派发；二者都不能单独证明原生下载已经完成。需要取消下载时保留任务句柄并调用 `abort()`，最终成功或失败仍以 `success` / `fail`（或明确返回最终下载结果的 Promise）为准：

```js
let downloadTask

function startDownload(url) {
  downloadTask = qd.downloadFile({
    url,
    success(res) {
      downloadTask = null
      console.log(res.tempFilePath || res.filePath)
    },
    fail(err) {
      downloadTask = null
      console.error(err)
    },
  })
}

function cancelDownload() {
  if (downloadTask && typeof downloadTask.abort === 'function') {
    downloadTask.abort()
  }
  downloadTask = null
}
```

页面离开时若不再需要本次下载，应调用 `abort()`（若运行端返回了可中止任务），并忽略随后到达的旧回调。不要仅因调用超时就假定原生任务已经停止。

### qd.connectSocket — WebSocket 连接

```js
const task = qd.connectSocket({ url: 'wss://echo.websocket.org' })
// task 提供: send, close, onOpen, onMessage, onError, onClose
```

---

## 六、存储 (storage)

### 异步 API

```js
// 写入
await qd.setStorage({ key: 'userToken', data: { token: 'xxx', expire: Date.now() + 3600000 } })

// 读取
const res = await qd.getStorage({ key: 'userToken' })
console.log(res.data)

// 获取存储概览
const info = await qd.getStorageInfo()
console.log(info.keys, info.currentSize, info.limitSize)

// 移除
await qd.removeStorage({ key: 'userToken' })

// 清空
await qd.clearStorage()
```

### 同步 API

```js
qd.setStorageSync('key', { value: 'data' })
const data = qd.getStorageSync('key')
const info = qd.getStorageInfoSync()
qd.removeStorageSync('key')
qd.clearStorageSync()
```

| API                         | Android | iOS | Harmony | Web |
| --------------------------- | ------- | --- | ------- | --- |
| 异步 (get/set/remove/clear) | ✓       | ✓   | ✓       | ✓   |
| 同步 (*Sync)                | ✓       | ✓   | ✓       |     |

---

## 七、路由 (route)

```js
// 保留当前页面，跳转新页面
qd.navigateTo({ url: '/pages/detail/index?id=123' })

// 关闭当前页面，跳转新页面
qd.redirectTo({ url: '/pages/detail/index' })

// 关闭所有页面，打开某个页面
qd.reLaunch({ url: '/pages/index/index' })

// 返回上一页
qd.navigateBack()
qd.navigateBack({ delta: 2 }) // 返回两级

// 跳转 tabBar 页面
qd.switchTab({ url: '/pages/index/index' })

// 获取当前页面栈
const pages = getCurrentPages()
console.log(pages.map(p => p.route))

// 退出小程序
qd.exitMiniProgram()

// 打开另一个小程序
qd.navigateToMiniProgram({ appId: 'targetAppId', path: '/pages/index/index' })

// 返回上一个小程序
qd.navigateBackMiniProgram()

// 重启小程序
qd.restartMiniProgram()
```

---

## 八、界面 (ui)

### 交互反馈

```js
// Toast 消息提示
qd.showToast({ title: '操作成功', icon: 'success', duration: 2000 })
qd.hideToast()

// Loading 加载提示
qd.showLoading({ title: '加载中...' })
qd.hideLoading()

// 模态对话框
const res = await qd.showModal({
  title: '提示',
  content: '确认删除？',
  showCancel: true
})
if (res.confirm) { /* 用户点确认 */ }

// 底部操作菜单
const res2 = await qd.showActionSheet({
  itemList: ['选项A', '选项B', '选项C']
})
console.log(res2.tapIndex)
```

### 导航栏

```js
qd.setNavigationBarTitle({ title: '页面标题' })

qd.setNavigationBarColor({
  frontColor: '#ffffff',
  backgroundColor: '#FF3B30',
  animation: { duration: 300, timingFunc: 'easeIn' }
})

// 获取胶囊按钮位置（用于自定义导航栏布局）
const rect = qd.getMenuButtonBoundingClientRect()
console.log(rect.top, rect.height, rect.right)

// 导航条加载动画
qd.showNavigationBarLoading()
qd.hideNavigationBarLoading()

// 隐藏左上角“返回首页”按钮
qd.hideHomeButton({
  success(res) {
    console.log('已隐藏返回首页按钮', res)
  },
  fail(err) {
    console.error('隐藏失败', err)
  },
})
```

`qd.hideHomeButton` 隐藏的是非首页页面作为页面栈根页时出现的“返回首页”按钮，不是普通页面栈中的返回箭头。使用前检查 `qd.getCurrentPages().length` 和实际进入方式：

- 普通 `navigateTo` 形成的页面栈应保留返回能力，不要用该接口试图隐藏返回箭头。
- 通过分享、外部入口或 `reLaunch` 使非首页页面成为根页时，才考虑隐藏“返回首页”按钮。
- 隐藏后必须确保页面仍有清晰可用的离开路径，避免把用户困在当前页面。
- 跨端代码先用 `qd.canIUse('hideHomeButton')` 判断能力是否可用，并处理 `fail` 降级。

### 背景 & 下拉刷新

```js
qd.setBackgroundColor({ backgroundColor: '#f5f5f5' })
qd.setBackgroundTextStyle({ textStyle: 'dark' })

qd.startPullDownRefresh()
qd.stopPullDownRefresh()
```

### 页面滚动

```js
qd.pageScrollTo({ scrollTop: 0, duration: 300 })
```

### 分享

分享菜单和主动分享能力见「三、千岛生态」中的 `qd.showShareMenu` 与 `qd.share`。

### 动画

```js
const animation = qd.createAnimation({ duration: 400, timingFunction: 'ease' })
animation.rotate(45).scale(1.5).step()
// 将 animation.export() 赋值给组件的 animation 属性
```

### TabBar

```js
qd.showTabBar()
qd.hideTabBar()
qd.setTabBarStyle({ backgroundColor: '#F5F5F5', borderStyle: 'white' })
qd.setTabBarItem({ index: 0, text: '新标题', iconPath: '/images/icon.png' })
qd.setTabBarBadge({ index: 0, text: '99' })
qd.removeTabBarBadge({ index: 0 })
qd.showTabBarRedDot({ index: 0 })
qd.hideTabBarRedDot({ index: 0 })
```

### 页面返回前询问

```js
qd.enableAlertBeforeUnload({ message: '确定要离开吗？' })
qd.disableAlertBeforeUnload()
```

---

## 九、媒体 (media)

### 图片

```js
// 从相册选择图片或拍照
const res = await qd.chooseImage({
  count: 3,
  sizeType: ['compressed'],
  sourceType: ['album', 'camera']
})
console.log(res.tempFilePaths)

// 选择图片或视频
const res2 = await qd.chooseMedia({ count: 3, mediaType: ['image', 'video'] })

// 压缩图片
const compressed = await qd.compressImage({ src: res.tempFilePaths[0], quality: 50 })

// 全屏预览图片
qd.previewImage({ current: res.tempFilePaths[0], urls: res.tempFilePaths })

// 保存到相册
await qd.saveImageToPhotosAlbum({ filePath: res.tempFilePaths[0] })
```

### 视频

```js
const res = await qd.chooseVideo({ sourceType: ['album', 'camera'] })

// 创建视频上下文（页面需有 <video> 组件）
const videoCtx = qd.createVideoContext('myVideo')
videoCtx.play()
videoCtx.pause()
videoCtx.stop()
videoCtx.seek(30) // 跳转到 30 秒
videoCtx.requestFullScreen()
```

### 相机

```js
const cameraCtx = qd.createCameraContext()
// 提供: takePhoto, startRecord, stopRecord
```

### 音频

#### 普通音频实例

普通音频接入与排错先读 [普通音频播放指南](./inner-audio.md)，其中包含可复制的调用模板、实例生命周期、返回值与事件记录方式。

| 能力 | 调用 | 关键约束 |
| ---- | ---- | -------- |
| 创建 | `qd.createInnerAudioContext()` | 正确拼写为 `createInnerAudioContext`；创建不自动播放 |
| 播放 / 继续 | `audio.play()` | 首次播放前设置 `src`；暂停后沿用同一实例和音源 |
| 暂停 | `audio.pause()` | 保留实例，后续用 `play()` 继续 |
| 停止 | `audio.stop()` | 与暂停分开；重新播放的位置需在目标端验证 |
| 销毁 | `audio.destroy()` | 成功调用后清除引用，再次播放前明确创建新实例 |

这五个方法均按无参数方式调用，不添加 `success` / `fail`。保留实际同步返回或 Promise 结果；调用完成不等于已经发声。原生实例不要放入 Vue 深层响应式状态，调用实例方法时保留 `this`，网络音源可直接赋给 `src`。

如需跳转播放位置，可在检测实例方法后调用 `audio.seek(10)`（跳到 10 秒）；此操作另按目标运行端验证。

#### 其他音频能力

以下入口与普通音频实例分开管理；有对应需求时再接入，并检查目标运行端是否提供相关方法。

```js
// 获取音频输入源
const sources = await qd.getAvailableAudioSources()

// 背景音频管理器（全局唯一）
const bgAudio = qd.getBackgroundAudioManager()
bgAudio.title = '歌曲名'
bgAudio.src = 'https://example.com/bg-audio.mp3'
```

---

## 十、设备 (device)

### 陀螺仪

陀螺仪能力由四个 API 组成：

| API | 调用方式 | 说明 |
| --- | -------- | ---- |
| `qd.onGyroscopeChange(listener)` | 传入监听函数 | 监听原始三轴数据变化，回调返回 `x`、`y`、`z` |
| `qd.startGyroscope(options)` | 选项对象 | 开始感应；能力广场示例使用 `{ interval: 'ui' }` |
| `qd.stopGyroscope(options)` | 选项对象 | 停止感应 |
| `qd.offGyroscopeChange(listener)` | 传入原监听函数 | 解除本页面注册的监听 |

能力广场当前将这四个 API 标记为“待验证”，没有声明确定的平台支持范围。业务代码调用前应逐项检查函数是否存在；缺少能力时保留主流程并给出非阻塞提示，不要假定所有端均已支持。

先注册监听，再调用 `startGyroscope`，可以避免启动后第一帧到达时尚未挂载监听。`offGyroscopeChange` 必须传入注册时的同一个函数引用，因此不要用两个内容相同但引用不同的匿名函数注册和解绑：

```js
const requiredGyroscopeApis = [
  'onGyroscopeChange',
  'startGyroscope',
  'stopGyroscope',
  'offGyroscopeChange',
]

let gyroscopeState = 'idle'
let gyroscopeRunId = 0

function handleGyroscopeChange(frame) {
  const { x, y, z } = frame || {}
  console.log('陀螺仪原始数据:', x, y, z)
}

function startGyroscope() {
  const supported = requiredGyroscopeApis.every(
    name => typeof qd[name] === 'function',
  )
  if (!supported || gyroscopeState !== 'idle') return

  const runId = ++gyroscopeRunId
  gyroscopeState = 'starting'
  qd.onGyroscopeChange(handleGyroscopeChange)
  qd.startGyroscope({
    interval: 'ui',
    success() {
      // 页面可能在启动结果返回前已经离开；晚到的成功仍要再次停止。
      if (runId !== gyroscopeRunId) {
        qd.stopGyroscope({})
        return
      }
      gyroscopeState = 'running'
    },
    fail(err) {
      if (runId !== gyroscopeRunId) return
      qd.offGyroscopeChange(handleGyroscopeChange)
      gyroscopeState = 'idle'
      console.error('启动陀螺仪失败:', err)
    },
  })
}

function stopGyroscope() {
  // 即使启动状态不确定，也尝试停止并解绑，避免监听泄漏。
  gyroscopeRunId += 1
  gyroscopeState = 'idle'
  if (typeof qd.offGyroscopeChange === 'function') {
    qd.offGyroscopeChange(handleGyroscopeChange)
  }
  if (typeof qd.stopGyroscope === 'function') {
    qd.stopGyroscope({
      fail(err) {
        console.error('停止陀螺仪失败:', err)
      },
    })
  }
}
```

在 Taro/Vue 页面中，至少在页面隐藏和卸载时执行清理；同一个清理函数重复执行时应安全无副作用：

```js
import { onBeforeUnmount } from 'vue'
import { useDidHide, useUnload } from '@tarojs/taro'

useDidHide(stopGyroscope)
useUnload(stopGyroscope)
onBeforeUnmount(stopGyroscope)
```

回调中的 `x`、`y`、`z` 是原始值。若用于 UI 反馈，可以直接读取或映射这些值；若要表达设备姿态，不要仅凭示例直接把三轴值当作姿态角，应按实际产品算法另行换算、积分或校正。

### 剪贴板

```js
await qd.setClipboardData({ data: '复制的内容' })
const res = await qd.getClipboardData()
console.log(res.data)
```

### 网络类型

```js
const res = await qd.getNetworkType()
console.log(res.networkType) // wifi, 4g, 3g, 2g, none, unknown
```

### 振动

```js
qd.vibrateShort() // 短振动 ~15ms
qd.vibrateLong()  // 长振动 ~400ms
```

### 拨打电话

```js
qd.makePhoneCall({ phoneNumber: '10086' })
```

### 扫码

| 平台 | Android | Harmony |
| ---- | ------- | ------- |
| 支持 | ✓       | ✓       |

```js
const res = await qd.scanCode({ scanType: ['barCode', 'qrCode'] })
console.log(res.result, res.scanType)
```

### 键盘

```js
qd.hideKeyboard()
```

### 通讯录

```js
// 写入联系人
qd.addPhoneContact({
  firstName: '张',
  lastName: '三',
  mobilePhoneNumber: '13800000000'
})

// 选择联系人
const contact = await qd.chooseContact()
```

### 蓝牙

BLE 接入、Review 与排错先读 [蓝牙 BLE 指南](./bluetooth.md)，其中包含完整 API 目录、调用顺序、二进制读写、MTU 分包、监听管理、断线恢复和 Android 配对说明。

范围为手机作为 BLE 中心设备连接外设；原生调用统一使用 `qd.*`，Taro 负责页面与生命周期。蓝牙信标、外围设备广播和 GATT 服务端不在本指南范围内。

基本顺序：初始化适配器 → 注册监听 → 搜索 → 选择真实设备 → 停止搜索 → 连接 → 查询服务和特征 → 按 `properties` 读写或开启通知。读取和通知数据由 `qd.onBLECharacteristicValueChange` 接收，必须先监听再发起操作。

`deviceId` 来自本次扫描或系统连接结果，服务和特征 ID 来自当前连接查询；写入传 `ArrayBuffer` 并串行分包。接口返回成功、收到数据事件、协议确认和设备实际动作分别判断。断开或切换设备后废弃旧服务、特征、订阅、MTU 与待处理回复，重连后重新查询和订阅。真实蓝牙行为需在千岛 App 真机验证。

### 内存告警

```js
qd.onMemoryWarning((res) => {
  console.log('内存告警等级:', res.level)
})
```

---

## 十一、系统信息 (system)

横屏与自动旋转通过配置文件声明，不是本节的运行时 API。全局 `window.pageOrientation` 和页面级 `pageOrientation` 的写法见 [development-guide.md](./development-guide.md) 的「屏幕方向配置（SDK 1.0）」。

截图黑屏的页面配置示例见 [development-guide.md](./development-guide.md) 的「截图黑屏（页面隐私模式）」。

### `qd.getSystemInfoSync` — 同步获取系统信息

`qd.getSystemInfoSync()` 无需参数，会立即返回当前设备与运行环境的系统信息。能力广场通过取得 Bridge 方法后直接执行 `getBridgeMethod('getSystemInfoSync')()`；业务代码统一使用等价的 `qd.getSystemInfoSync()`。

```js
function readSystemInfo() {
  if (typeof qd.getSystemInfoSync !== 'function') {
    return null
  }

  const systemInfo = qd.getSystemInfoSync()
  console.log(systemInfo.platform, systemInfo.system, systemInfo.screenWidth)
  return systemInfo
}
```

返回值为系统信息对象。iOS 与 Android 的原生实现和附加字段不同，跨端业务只依赖两端真机返回值的以下交集字段：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| `brand` | `string` | 设备品牌 |
| `model` | `string` | 设备型号 |
| `pixelRatio` | `number` | 设备像素比 |
| `screenWidth` | `number` | 屏幕宽度，单位为逻辑像素 |
| `screenHeight` | `number` | 屏幕高度，单位为逻辑像素 |
| `windowWidth` | `number` | 可用窗口宽度，单位为逻辑像素 |
| `windowHeight` | `number` | 可用窗口高度，单位为逻辑像素 |
| `statusBarHeight` | `number` | 状态栏高度，单位为逻辑像素 |
| `language` | `string` | 当前语言；格式可能为 `zh_CN` 或 `zh` |
| `version` | `string` | 平台实现返回的版本字符串，两端语义和格式可能不同 |
| `system` | `string` | 操作系统及版本，如 `iOS 26.6` 或 `Android 16` |
| `platform` | `string` | 运行平台；可能为 `ios` 或带细分标识的 `android,kuril` |
| `deviceOrientation` | `string` | 当前设备方向，如 `portrait` 或 `landscape` |

不要把 iOS 返回的 `safeArea`、`SDKVersion`、权限状态等扩展字段当成 Android 必有字段。平台判断不要严格比较完整的 `platform` 字符串：Android 可能包含逗号分隔的细分标识，可使用 `platform.startsWith('android')`。语言值同样需要兼容 `zh_CN` 与 `zh` 等不同粒度。布局计算使用实际返回的窗口尺寸，不要把某台设备的具体尺寸写死。

这是同步 Bridge API：不要传入 `success`、`fail`、`complete` 回调，不要添加 `await`，也不要用通用 Promise 回调包装器调用。需要异步调用时使用 `qd.getSystemInfo()`；需要回调式异步调用时使用 `qd.getSystemInfoAsync()`。能力广场标记该接口从 SDK 1.0.0 起支持 Android、iOS、Harmony 和 Web；兼容旧运行环境时仍应先检查函数是否存在。

```js
// 异步获取系统信息（推荐）
const sysInfo = await qd.getSystemInfo()
console.log(sysInfo.platform, sysInfo.system, sysInfo.screenWidth)

// 获取 App 基础信息
const appInfo = qd.getAppBaseInfo()
console.log(appInfo.SDKVersion, appInfo.language)

// 获取设备信息
const deviceInfo = qd.getDeviceInfo()
console.log(deviceInfo.brand, deviceInfo.model, deviceInfo.platform)

// 获取窗口信息
const windowInfo = qd.getWindowInfo()
console.log(windowInfo.windowWidth, windowInfo.windowHeight, windowInfo.safeArea)

// 页面允许自动旋转时，监听旋转后的窗口尺寸
qd.onWindowResize((res) => {
  console.log(res.size.windowWidth, res.size.windowHeight)
})

// 跳转系统设置
qd.openAppAuthorizeSetting()        // 系统授权管理页
qd.openSystemBluetoothSetting()     // 系统蓝牙设置页（仅 Android）
```

---

## 十二、位置 (location)

```js
// 获取当前位置
const loc = await qd.getLocation({ type: 'gcj02' })
console.log(loc.latitude, loc.longitude, loc.speed, loc.accuracy)

// 获取模糊位置
const fuzzy = await qd.getFuzzyLocation({ type: 'gcj02' })

// 打开地图选择位置
const chosen = await qd.chooseLocation({})
console.log(chosen.name, chosen.address, chosen.latitude, chosen.longitude)

// 打开 POI 列表选择
const poi = await qd.choosePoi({})

// 在内置地图查看位置
qd.openLocation({
  latitude: 39.908823,
  longitude: 116.39747,
  name: '天安门',
  address: '北京市东城区东长安街',
  scale: 18
})

// 持续定位
await qd.startLocationUpdate({})

qd.onLocationChange((res) => {
  console.log(res.latitude, res.longitude)
})

qd.onLocationChangeError((err) => {
  console.error('定位失败:', err)
})

// 停止
await qd.stopLocationUpdate({})
qd.offLocationChange(callback)
```

---

## 十三、文件系统 (file)

| 平台 | Harmony |
| ---- | ------- |
| 支持 | ✓       |

```js
const fsm = qd.getFileSystemManager()

// 写文件
fsm.writeFile({
  filePath: `${qd.env.USER_DATA_PATH}/test.txt`,
  data: 'Hello World',
  encoding: 'utf-8',
  success(res) { console.log('写入成功') },
  fail(err) { console.error(err) }
})

// 同步写文件
fsm.writeFileSync(`${qd.env.USER_DATA_PATH}/test.txt`, 'Hello', 'utf-8')

// 读文件
fsm.readFile({
  filePath: `${qd.env.USER_DATA_PATH}/test.txt`,
  encoding: 'utf-8',
  success(res) { console.log(res.data) }
})

// 同步读文件
const content = fsm.readFileSync(`${qd.env.USER_DATA_PATH}/test.txt`, 'utf-8')

// 追加内容
fsm.appendFile({ filePath, data: '\n追加行', encoding: 'utf-8' })

// 判断文件是否存在
fsm.access({
  path: filePath,
  success() { console.log('文件存在') },
  fail() { console.log('文件不存在') }
})

// 目录操作
fsm.mkdir({ dirPath: `${qd.env.USER_DATA_PATH}/mydir`, recursive: true })
fsm.readdir({ dirPath: qd.env.USER_DATA_PATH, success(res) { console.log(res.files) } })
fsm.rmdir({ dirPath, recursive: true })

// 文件操作
fsm.copyFile({ srcPath, destPath })
fsm.rename({ oldPath, newPath })
fsm.unlink({ filePath })
fsm.stat({ path: filePath, success(res) { console.log(res.stats) } })
fsm.getFileInfo({ filePath, success(res) { console.log(res.size) } })
fsm.saveFile({ tempFilePath, success(res) { console.log(res.savedFilePath) } })
```

---

## 十四、节点查询 (wxml)

| 平台 | Android | iOS | Harmony | Web |
| ---- | ------- | --- | ------- | --- |
| 支持 | ✓       | ✓   | ✓       | ✓   |

```js
// DOM 查询
const query = qd.createSelectorQuery()
query.select('.my-class').boundingClientRect()
query.exec((res) => {
  console.log(res[0]) // { width, height, top, left, ... }
})

// 交叉观察
const observer = qd.createIntersectionObserver()
observer.relativeToViewport({ bottom: 100 })
observer.observe('.target', (res) => {
  console.log('可见比例:', res.intersectionRatio)
})
// observer.disconnect() 取消观察
```

---

## 十五、画布 (canvas)

```js
// 创建绘图上下文（页面需有 <canvas canvas-id="myCanvas">）
const ctx = qd.createCanvasContext('myCanvas')
ctx.setFillStyle('#FF0000')
ctx.fillRect(10, 10, 100, 50)
ctx.fillText('Hello', 20, 40)
ctx.draw()

// 离屏 canvas
const offscreen = qd.createOffscreenCanvas({ type: '2d', width: 300, height: 150 })
const offCtx = offscreen.getContext('2d')

// 导出为图片
qd.canvasToTempFilePath({
  canvasId: 'myCanvas',
  success(res) { console.log(res.tempFilePath) }
})
```

---

## 十六、窗口与其他

```js
// 监听窗口尺寸变化
qd.onWindowResize((res) => {
  console.log(res.size.windowWidth, res.size.windowHeight)
})

// 延迟到下一个时间片执行
qd.nextTick(() => {
  // DOM 更新完成后执行
})
```

---

## 调用方式总结

| 调用方式   | 说明                   | 示例                     |
| ---------- | ---------------------- | ------------------------ |
| `qd.xxx()` | 统一调用 Bridge API    | `qd.showToast(...)`      |

**统一使用 `qd.*`**，包括 `joinIsland`、`openPost` 等千岛生态专有 API。

## 通用回调模式

对明确支持 Promise 和回调的异步 Bridge API，可按下列方式调用；返回值语义与支持形式以具体接口为准。普通音频的创建和实例控制方法按无参数方式调用，不套用此回调模式；蓝牙请求的 callback 适配方式见 [蓝牙 BLE 指南](./bluetooth.md#bridge-调用与状态管理)，`on*` / `off*` 监听方法单独管理。

```js
// Promise 方式（推荐）
try {
  const res = await qd.someApi({ param: 'value' })
  console.log(res)
} catch (err) {
  console.error(err)
}

// 回调方式
qd.someApi({
  param: 'value',
  success(res) { console.log(res) },
  fail(err) { console.error(err) },
  complete() { /* 无论成功失败都执行 */ }
})
```
