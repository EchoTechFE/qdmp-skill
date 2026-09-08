# OpenAPI 使用收集与权限申请链接

本流程适用于 Agent 新增、修改或删除千岛 HTTP OpenAPI 调用时。目标是让代码实际使用的接口与用户手动申请的权限保持一致。

## 1. 识别收集范围

应收集：代码实际请求 `https://openapi.qiandao.com/<service>/<version>/<path>` 的业务接口，或通过官方服务端 SDK 发起的等价调用。

不收集：

- `qd.*` Bridge API；
- 小程序项目自己的 `backend/` 接口；
- `/auth/v1/token`、`/auth/v1/refresh` 等认证基础接口；
- 只出现在注释、示例、测试夹具或已删除代码中的接口；
- 尚未落地、仅在方案中设想的接口。

收集动作必须和代码修改在同一轮完成，不能靠最终阶段凭记忆回填。先读取现有清单，保留本次未涉及且仍在使用的条目；只有确认调用已从整个项目移除后才能删除条目。

## 2. 维护使用清单

在 `{projectRoot}/.qdmp/openapi-usage.json` 使用固定结构：

```json
{
  "schemaVersion": 1,
  "openapis": [
    {
      "method": "GET",
      "path": "/spu/v1/detail"
    },
    {
      "showCode": "tag.search"
    }
  ]
}
```

标识规则：

1. 优先记录 `method + path`；path 不包含域名、query 和 fragment。
2. SDK 无法直接还原 HTTP 路径时，记录平台唯一 `showCode` 或 `apiCode`。
3. 同一接口只保留一次；清单顺序保持稳定，新条目追加在末尾。
4. 不记录资源 ID。资源 ID 必须由 CLI 查询当前平台目录后解析，避免静态 ID 漂移。
5. 不得使用名称模糊匹配。CLI 遇到零匹配或多匹配时必须失败，由 Agent 修正清单或代码。

若 `.qdmp/` 不存在，可创建目录。该清单不含密钥，可随代码提交。

## 3. 解析全量目录并生成链接

代码和测试完成后，在 `{projectRoot}` 执行：

```bash
qdmp-cli openapi apply-url --json
```

开发环境使用：

```bash
qdmp-cli openapi apply-url --env dev --json
```

CLI 必须复用千岛开放平台现有接口并自行分页：

```text
GET /qdmp-web/v1/developer/capabilities?app_id=<appId>&type=openapi&offset=<offset>&limit=200
```

不得为“查找全部 OpenAPI”创建新 BFF 接口。CLI 将清单逐项严格解析为 `resourceId`，并分类：

- `requiredResourceIds`：需要用户手动申请，进入短链；
- `grantedResourceIds`：已经开通，不重复申请；
- `pendingResourceIds`：正在审核，不重复申请；
- `noPermissionRequiredResourceIds`：无需申请；
- `unavailableResourceIds`：当前不可申请，必须在交付中提示。

未登录时，提示用户在可交互终端运行 `qdmp login`，不要代填账号密码。登录完成后重试生成命令。

## 4. 16 位 queryKey 契约

当 `requiredResourceIds` 非空时，CLI 调用：

```text
POST /qdmp-web/v1/developer/apps/<appId>/openapi-application-links
Content-Type: application/json

{"resourceIds":["1","2","3"]}
```

BFF 返回 16 位 Base64URL `queryKey`，CLI 生成：

```text
https://open.qiandao.com/apps/<appId>/capabilities?requiredApis=<queryKey>
```

固定 16 字符不可能无状态、无损地容纳任意数量的资源 ID，因此这里使用服务端短令牌映射而不是可逆加密：

- Redis 保存 appId、原始有序 resourceIds、创建人、创建/过期时间；
- Redis key 只使用 queryKey 的 SHA-256 摘要；
- 生产环境通过 BFF 框架 `application.NewRedis(name)` 复用 Apollo `conn.redis` 配置和 APM 连接池监控；本地测试地址通过 `application.NewRedisWithOption` 覆盖，不直接自行创建客户端；
- Redis 初始化失败时只降级短链创建/解析接口为 503，不能阻断 qdmp-web 原有接口启动；
- 默认 7 天过期；
- 创建与解析都校验当前登录用户对 appId 的访问权；
- 返回列表必须与提交列表数量、值和顺序完全一致。

## 5. 页面行为与安全边界

权限页检测到合法 `requiredApis` 后：

1. 分页加载全量 OpenAPI 目录；
2. 通过 BFF 解析 queryKey；
3. 主动打开“申请能力”弹框并切换到 OpenAPI；
4. 仅自动勾选仍可申请、未开通、未审核中的目标接口；
5. 对已开通、审核中、已下线或不存在的接口给出提示。

页面不得自动提交，不得自动填写用途说明，不得自动勾选协议。用户必须亲自核对接口、填写理由并确认协议后提交。

## 6. 交付检查

- 清单与代码调用一致；
- CLI 全量分页完成，无零匹配/多匹配；
- `matchedResourceIds` 数量与清单去重后的数量一致；
- BFF 回传的 `resourceIds` 与请求在数量、值、顺序上完全一致；
- 有待申请接口时提供带 `requiredApis` 的地址；
- 无待申请接口时明确说明原因，不生成空短链；
- 不展示 Token、appSecret、Redis 密码或其他凭据。
