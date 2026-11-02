# 业务 API 事实查询

API 契约从 devkit MCP 获取；Skill 保留原有业务逻辑和测试。MCP 只读查询无需登录或 Token，不代替业务调用、授权和真实运行验收。

## 查询

1. 需要 API 事实时才通过宿主发现 qdmp-devkit 工具；支持延迟加载，未显示不等于未安装。
2. 首次查询先读取 https://config-cdn.qiandaoapp.com/devkit-mcp/external-config.json，同一会话复用，按其中的场景、provider 和 ID 选择接口。
3. 已知准确 ID/名称用 `capability_get`；不确定时用 `capability_search`，选择 `bridge` 或 `openapi`，按指南中的单个字面词检索并按需分页。只查 Bridge 平台支持用 `capability_supports`。参数以工具声明为准。
4. 默认读取 spec，细节不足再取 full 或 evidence；复用结果，后续查询分别固定各 provider 的 snapshotId。依据事实生成调用，保留原有流程、错误处理与测试。

## 匿名接入

工具不可用时，先检查当前宿主的配置、启用和连接状态；已有连接只需启用或刷新，不重复添加。无法读取状态时说明尚不能判断原因，再指引用户检查。

| 配置项 | 值 |
| --- | --- |
| 服务名称 | qdmp-devkit |
| 传输方式 | Streamable HTTP |
| URL | https://dev-openapi.qiandao.com/devkit/mcp |
| 认证方式 | None，不设置 Authorization |

由宿主管理连接，无需安装本地服务；Skill 不自动修改宿主配置或使用 CLI 兜底。工具恢复后继续原只读查询。

## 失败处理

- 连接或查询报错：报告真实原因，不一律要求安装，不索取 Token，不无限重试。发现指南不可用时说明资料缺口。
- 无匹配、多候选或契约不完整：结合指南继续必要检索或澄清业务目标；不能推断平台没有能力，也不能从历史文档、测试夹具或相似接口补造契约。
- 只暂停依赖缺失事实的工作。原有 CLI 权限申请不增加 MCP 前置校验，业务写入不因连接恢复而自动重放。
