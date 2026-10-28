# 业务 API 事实查询

业务 API 的名称、路径、方法、请求头、参数、返回、错误码、权限和平台支持统一从 devkit MCP 获取。Skill 只维护业务流程与验收方法，不保存契约副本。CLI 的登录、上传、调试、体验版及平台权限申请请求保持原有行为。

## 查询流程

1. 当前连接/会话首次发现业务 API 时，读取 https://config-cdn.qiandaoapp.com/devkit-mcp/external-config.json 的完整 JSON，同一会话复用。先根据 glossary、context、apis 的场景、别名、provider 和真实 ID 确认候选；该文件是发现资料，不是授权或运行时契约。
2. 已知准确 ID/名称时直接调用 `capability_get`；不先 search。候选不明确时，调用 `capability_search`，显式选择 `bridge` 或 `openapi`，每次只使用指南中的一个字面检索词；按游标继续必要的分页。搜索是子串匹配，不是语义搜索。
3. 使用 get 默认 spec 的参数与返回声明确认契约；仅缺少类型闭包时读取 full，仅检查原始依据时请求 evidence。复用已返回的事实，不重复查询。需要新细节时固定该 provider 返回的 snapshotId；不同 provider 分别固定。OpenAPI version 是文档发布修订，不是业务 apiVersion。
4. 实现前核对目标对象、调用形式、字段位置、编码、分页、ID 表示、认证、用户权限和失败终态。只查询 Bridge 平台支持时直接使用 `capability_supports` 或已有支持摘要。返回对象的方法须在所属实例上调用，不能当作顶层方法。
5. 按事实生成项目调用适配层，保留原有业务顺序、状态管理、错误处理和测试。配置编译期设置仍按 development-guide 执行；MCP 不执行业务请求，也不替代用户登录、授权或真实运行验收。

## 无原生 MCP 工具时

可使用支持 `api` 子命令的 qdmp-cli 作为相同 MCP 的客户端，无需复制 devkit 仓库：

```bash
qdmp api guide
qdmp api search '<指南中的单个字面词>' --provider openapi
qdmp api get '<查询返回的准确ID>' --provider openapi
qdmp api get '<查询返回的准确ID>' --provider bridge --snapshot '<该provider返回的snapshotId>'
```

命令输出 JSON。`QDMP_DEVKIT_MCP_URL` 配置服务地址，`QDMP_DEVKIT_EXTERNAL_CONFIG_URL` 可覆盖单个发现指南地址；本机联调允许 localhost HTTP。事实查询不需要 CLI 平台登录。旧 CLI 没有 api 子命令时按升级流程处理，不凭记忆补全 API。

## 缺口处理

- CDN 不可达、为空或格式错误：说明发现资料缺口；不能跳过指南生成业务契约。
- MCP 未连接、查询失败、零匹配、多匹配或契约不完整：报告具体 provider、检索词/ID 和缺失项；继续与该能力无关的工作。不能回退静态文档、测试夹具或臆造接口，不能把无命中解释为平台没有该能力。
- 指南中的历史差异和未接入能力只提供检索线索；未收录的配套方法、认证交换、上传阶段和权限不能自行补造，也不能用相似能力替换。
- 冻结事实不证明目标环境已授权、已上线可用或调用成功。Bridge 契约校验是有限检查；OpenAPI 目前仅查询事实，不承诺统一校验或执行。
