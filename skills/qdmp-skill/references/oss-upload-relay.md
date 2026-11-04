# 已有应用后端中转的适配

这是可选链路，按用户选择和项目现状采用。`POST /oss/v1/upload/relay` 是自建接口的示例路径，不是千岛平台提供的 OpenAPI。采用前说明 [风险与方案取舍](../knowledge/oss-upload.md#风险与方案取舍)，是否进一步改造由用户决定。

下述兼容示例仍由客户端取得并发送 prepare 参数，因此客户端仍可抓到 OSS 签名，不能将它描述为“OSS 凭据完全只在后端”。如果用户选择隐藏 OSS 凭据，需要改为后端申请并保管 prepare 结果、客户端只传文件与必要业务标识，后端按已验证身份绑定资产；这是可选的架构改造，不能只删掉前端日志就宣称完成。应用上传接口仍可被抓包调用，需要服务端鉴权与校验；单纯中转不自动增加内容检查或防滥用能力。

```text
小程序 ── multipart（本地文件 + 中转元数据） ──> 应用后端 relay
relay ── POST multipart（prepare签名表单 + 原文件） ──> OSS
```

客户端表单：唯一 file 文件段，以及 uploadUrl、assetId、expireAt、size、`JSON.stringify(uploadHeaders)`、`JSON.stringify(uploadFormData)`。这些是发给relay的中转元数据；不能复制为直传OSS的额外表单字段。按应用约定携带用户凭证，不把应用凭证送到OSS。

后端处理：

1. 验证实际用户身份与应用/资产归属，不以“token非空”代替鉴权。
2. 校验HTTPS、可信OSS主机、允许路径/端口，防止任意URL转发；不跟随重定向。
3. 校验本应用key归属、assetId、文件实际字节数、真实类型、有效期和应用上传限制。不要仅信任客户端的size或MIME。
4. 解包uploadFormData字符串映射，保留签名键值。先写全部文本字段，最后写唯一file。由编码器生成multipart boundary与完整Content-Length，文件字节不能变化。
5. 不透传relay鉴权头、Cookie、原始客户端Content-Type或中转元数据到OSS。POST缺表单明确失败，不退回PUT。
6. 保留OSS状态、headers、原始body，解析结果分开。截断必须标记，不能将截断体当完整成功。

客户端、应用HTTP、relay业务码、OSS HTTP及最终result是不同层级。relay返回应用HTTP200或code0不等于发布完成；其响应格式/错误码是自建契约，不能当平台标准。至少返回assetId和可用的OSS状态/错误信息，以便继续查询result。

原生上传timeout=120000ms；客户端总等待必须覆盖接收文件与后端向OSS上传的实际总预算，不能机械沿用直传的125000ms。若无法在同步请求预算内完成，应按现有架构改为可查询的后台任务，不靠无限延长/自动重传。服务端限制、内存/磁盘缓冲、文件上限与超时均按部署资源配置；20MiB仅为应用参考，不是OSS限制。

203/超时等结果不明时保留assetId并查询result，不自动重传。最终发布判断遵循 [result 状态判断](../knowledge/oss-upload.md#6-审核与发布查询)。
