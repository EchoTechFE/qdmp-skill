# 手机号授权与后端兑换

本指南整合手机号授权接入资料，技术要求整理日期为 2026-11-04。只约定原生按钮、一次性授权码和服务端兑换链路；页面布局、号码格式、文案与业务数据用途由接入项目决定。参考：[手机号授权技术说明](https://echotech.feishu.cn/docx/GFRkdXbTAoFTQDxkEEdcxYWwny0)。旧资料中直接调用 `qd.getPhoneNumber()` 的描述不能替代当前原生按钮路径。

## 前置条件

- 开发者须在[千岛开放平台](https://open.qiandao.com/)为目标小程序申请并获准 **“授权码兑换手机号” OpenAPI：`POST /user/v1/phone/exchange`**。用户同意授权和应用平台权限是两层条件。按 [OpenAPI 权限申请流程](./openapi-permission-flow.md) 收集实际调用，不能自行编造 operationId、resourceId 或 `user.phone.*` scope。
- 功能要求 **千岛宿主 App 6.68.0 及以后版本**。按数字段比较文档明确的 App 版本字段，不用系统版本、SDKVersion、Taro 或小程序包版本代替。低版本不调用，未知版本不认定兼容；不要猜测版本读取字段。
- 前端复用项目既有登录及自身后端的调用者鉴权；后端保管应用密钥和应用令牌。不要把手机号授权码当成 `qd.login` 登录码。

## 原生按钮与事件

Taro Vue 的最小绑定示例：

```html
<button open-type="getPhoneNumber" @getphonenumber="onPhoneNumber"></button>
```

保留原生 `button`，能力属性是 **`open-type="getPhoneNumber"`**，不是 `type="getPhoneNumber"`；事件名是全小写 **`getphonenumber`**。不能用 `view` 模拟，也不能在页面进入时自动调用 API 代替用户点击授权。

从真实事件的 `event.detail` 取码，支持两种结构：

```json
{"errMsg":"getPhoneNumber:ok","code":"ONE_TIME_PHONE_CODE"}
```

```json
{"code":0,"message":"success","requestId":"EXAMPLE_REQUEST_ID","data":{"code":"ONE_TIME_PHONE_CODE"}}
```

封装结构先检查外层业务 `code=0`，再取 `data.code`；平铺结构检查失败标识后取 `detail.code`。取消、拒绝、失败、空码或无效字符串不发兑换请求；外层数字业务码不是授权码，点击坐标也不参与兑换。

## 后端兑换链路

| 请求方 → 接收方 | 请求体与鉴权 |
| --- | --- |
| 小程序 → 自己的后端 | JSON `{ "code": "ONE_TIME_PHONE_CODE" }`；复用应用自己的调用者鉴权 |
| 自己的后端 → 千岛 OpenAPI | 同一 JSON；以应用 `CLIENT_CREDENTIALS` 令牌设置 `Access-Token` 请求头 |

后端沿用既有认证组件获取应用令牌：

```http
POST https://openapi.qiandao.com/auth/v1/token
Content-Type: application/json
```

```json
{
  "appId": "YOUR_APP_ID",
  "appSecret": "SERVER_ONLY_APP_SECRET",
  "grantType": "CLIENT_CREDENTIALS"
}
```

检查 HTTP 状态与业务结果，读取成功响应 `data.accessToken`。客户端不能通过传入 appId/appSecret 选择兑换应用；应用令牌缓存按应用和环境隔离。

兑换请求：

```http
POST https://openapi.qiandao.com/user/v1/phone/exchange
Content-Type: application/json
Access-Token: APPLICATION_ACCESS_TOKEN
```

```json
{"code":"ONE_TIME_PHONE_CODE"}
```

这里需要的是**应用令牌**，用户 token、Cookie 或 `Authorization` 不能替代；也不要沿用其他本人接口的用户 token 兜底逻辑。原生签发 code 的应用和环境必须与兑换方一致，环境头来自项目受控配置，不硬编码测试环境。上游使用应用令牌不等于已经验证自身后端的调用者。

code 放 JSON 请求体，不放 URL。保留真实 HTTP 状态与业务响应，敏感响应设置 `Cache-Control: no-store`；不要把 code、手机号、Cookie、令牌或密钥写入未脱敏日志、公开示例或调试制品。应用密钥、应用令牌不下发前端。

## 一次性消费与响应

授权码约定 **300 秒有效、成功消费一次**。阻止并发兑换与同码重复提交。网络错误、超时或结果不明均不能证明未消费，不自动重放，也不因自动刷新 token 再提交旧码；需要重试时重新由用户授权。

可参考后端总预算 30 秒（含取 token 与兑换）、前端 35 秒的超时配合；这些是应用示例值，不是平台 SLA。中止等待后释放任务和计时器，忽略迟到响应。

成功字段契约如下，所有身份、号码和凭据均为占位值，不是可调用的测试数据：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "phoneNumber": "+86<LOCAL_NUMBER>",
    "purePhoneNumber": "<LOCAL_NUMBER>",
    "countryCode": "86",
    "openId": "EXAMPLE_OPEN_ID"
  },
  "requestId": "EXAMPLE_REQUEST_ID"
}
```

同时满足 HTTP 2xx、业务 `code=0` 和完整合法的结果字段，才能认定兑换成功。正式结构中号码字段和 `openId` 平铺在 `data`。旧结构可能把三个号码字段放在 `data.phoneInfo`、`openId` 仍位于 `data.openId`；只作独立兼容，不把不完整的平铺字段与嵌套字段拼在一起。

这里保留手机号响应的字段契约；用户登录身份的 `openId` 仍必须从 [`/auth/v1/token`](./api-guide.md#21-获取-token) 的 `AUTHORIZATION_CODE` 成功响应获取，不能以手机号响应或 `user.me` 的字段建立、补齐或覆盖登录身份。

复用既有会话机制，账号切换或退出时立即使旧请求和旧账号结果失效，不等下一次点击才检查。数据使用与存储按目标业务需求处理，接入示例不自行增加持久化。

## 参考代码与验证

[phone-number.mjs](../assets/phone-number.mjs) 只提供版本比较、成功事件取码和单次后端请求适配，不包含 UI、号码格式化、日志或存储。

```js
import { readPhoneAuthorizationCode, exchangePhoneCode } from './phone-number.mjs';

async function onPhoneNumber(event) {
  const code = readPhoneAuthorizationCode(event);
  if (!code) return;
  const response = await exchangePhoneCode(
    options => Taro.request(options),
    config.backendBase,
    code,
  );
  // 按 HTTP、业务码和字段契约交给目标业务处理。
}
```

片段只说明接线。调用者仍负责并发控制、跨调用同码防重、会话隔离和离页清理。`backendBase` 是自身后端的 HTTPS 基址，不能填千岛 OpenAPI。示例假设自身后端也使用 `/user/v1/phone/exchange`，可按既有路由适配。

适配器每次最多发起一次请求，兼容 callback/Promise 单次结算，Promise 返回 `undefined` 时继续等真实回调。`INVALID_PHONE_CODE`、`PHONE_EXCHANGE_TIMEOUT`、`PHONE_EXCHANGE_NETWORK_ERROR`、`PHONE_EXCHANGE_START_FAILED` 是本地错误标识，不是平台业务错误码；真实 HTTP/业务失败响应由调用者判断。

验证平台开通状态、6.68.0 版本边界、按钮属性与事件、取消不请求、同码防重、应用令牌及环境、正式/旧响应、HTTP 200 业务失败、超时不重放和账号隔离。Mock 和构建通过不代表原生授权三端通过，真机验收需已开通的应用和 App 6.68.0+。
