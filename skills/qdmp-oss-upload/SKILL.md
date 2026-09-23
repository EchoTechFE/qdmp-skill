---
name: qdmp-oss-upload
description: "接入或排查千岛小程序 OSS 图片上传：存储额度、上传准备、qd.uploadFile 到应用后端、中转 PUT 到 OSS、完整响应与图片展示。适用于千岛文件上传，不用于通用云存储管理。"
---

# 千岛 OSS 图片上传

帮助当前项目完成「选择本地图片 → 准备上传 → 上传 → 展示响应图片」。这是已落地的应用集成方案，不是所有 SDK 版本的通用能力声明。

## 开始前

- 读取项目约定和现有登录、请求封装，沿用当前框架、配置、样式与已授权范围。本 Skill 不额外授予部署权限。
- 实现或排查上传时，必须读取 [接口与中转契约](references/api-contract.md)。
- 区分平台接口 `GET /oss/v1/quota`、`POST /oss/v1/upload/prepare` 与应用自建的 `POST /oss/v1/upload/relay`。不得假定平台提供 relay。
- 后端域名、OSS 目标白名单和 appId 从目标项目配置确定。上传地址与签名头使用本次 prepare 的真实返回值；不自行拼接 OSS 域名或新增 `auth_scope`。

## 调用流程

1. 查询额度，展示剩余、已用、预留、总量和状态；响应缺失或非法时显示未知或错误，不当作零额度。
2. 从相册或相机选择一张本地原图。保留 SDK 返回的临时路径，包括 `echofile://` / `echoFile://`；不将它当作网络地址下载，也不交给后端读取。
3. 取得文件的 MIME 和真实字节数；选图结果缺少大小时读取本地文件信息。当前适配层单图上限为 20 MiB，不将它表述为平台统一上限。
4. 调用 prepare，请求体为 `{ type: 'openmp', contentType, size }`，`size` 是真实字节数的十进制字符串。后续必须上传同一份字节；压缩、裁剪或重新选图后重新 prepare。
5. 将 prepare 返回的 `uploadUrl / uploadHeaders / assetId / expireAt` 和本地文件通过 `qd.uploadFile` 发给本应用 relay。文件字段名为 `file`，签名参数放在 `formData`，用户 token 放在发给应用的 header。由 SDK 生成 multipart `Content-Type` 和 boundary。
6. 应用后端解析 multipart，校验目标、大小、类型、有效期和签名头，再将原始图片字节以 PUT 发给 OSS。传递 prepare 的签名头，`Content-Length` 使用实际文件大小；不转发客户端 token，不跟随重定向。
7. 同时检查原生回调、应用 HTTP 状态、relay 业务 code 和 OSS HTTP 状态。只有完整链路成功才刷新额度。HTTP 203 表示平台回调失败，文件可能已上传，不自动重复上传。
8. 保留完整请求与响应。将 OSS 响应的 `data`（JSON 字符串或对象）解析为独立展示对象，取其 `url` 展示图片；不改写原始记录，不将签名上传地址当作图片地址。

## 约束与验证

- 前端 multipart 必须发给应用 relay，不直接发给 PUT 签名 URL；已观察到后者会返回 405。不猜测 `qd.uploadFile` 支持未确认的额外参数。
- `uploadHeaders` 属于后端 → OSS 请求，不全部塞入前端 → relay 的 header。签名 URL 不做 decode、重排或手工拼接；回调签名字段作为不透明值传递。
- prepare `code: 0`、原生 `success`、外层 HTTP 200 都只代表一个阶段完成。超时可能发生在 OSS 已写入之后，应保留记录并核实，不循环重试。
- 不将 appSecret、长期存储凭据、历史 token 或已过期签名地址写入前端或公开文档。
- 按项目约定运行必要检查，重点验证文件字节未改变；OSS 失败、203 或超时不会显示成功；JSON 字符串能解析出图片 URL；原始记录得到保留。没有设备实测时不声称多端已验收。

交付时说明修改位置、验证结果、实际部署/上传状态和尚未完成的实机验证。
