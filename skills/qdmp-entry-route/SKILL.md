---
name: qdmp-entry-route
description: 生成、解释和校验从千岛入口位（包括瓷片区）进入千岛小程序具体页面的跳转地址。Use when users ask how to configure an entry route, landing page, mini-program path, jump URL, 瓷片区跳转地址，或询问 qiandao.com/miniapp 的 appId、path、query 应如何填写与编码。
---

# 千岛小程序入口路由配置

直接给出准确、可复制的配置，不要启动项目创建、开发、部署或环境检查流程。

## 标准格式

```text
https://qiandao.com/miniapp?appId=echoxxxx&path=xxxx&query=a%3Db%26c%3Dd
```

按以下规则解释和生成地址：

- `appId`：填写目标小程序的 appId。
- `path`：只填写小程序内的实际页面路由，例如 `pages/index`、`pages/detail`。不要把页面参数拼入 `path`。
- `query`：填写页面参数。先将原始参数按 `key=value&key2=value2` 组成完整查询字符串，再对这个完整字符串进行一次 URL encode。
- 没有页面参数时，省略整个 `&query=...`。

## 编码示例

原始页面参数：

```text
a=b&c=d
```

编码后的 `query` 值：

```text
a%3Db%26c%3Dd
```

最终地址：

```text
https://qiandao.com/miniapp?appId=echoxxxx&path=pages/detail&query=a%3Db%26c%3Dd
```

## 回答流程

1. 用户只问规范时，先给标准格式，再逐项解释 `appId`、`path`、`query`。
2. 用户提供了 appId、页面路由和参数时，替换占位符并返回完整可复制地址。
3. 用户缺少必要信息时，明确指出还需要 appId 或实际页面路由；仍可先给占位模板。
4. 用户给出现有地址时，检查参数是否分离、`query` 是否编码，并给出修正后的地址。
5. 保持回答简短；除非用户要求，不展开无关的小程序开发流程。

## 校验清单

- 域名和入口固定为 `https://qiandao.com/miniapp`。
- `appId` 使用目标小程序的真实 appId，不把 `echoxxxx` 当成固定值。
- `path` 是实际页面路由，不是页面名称、网页 URL 或带参数的路径。
- 页面参数只放在 `query` 中。
- `query` 是原始参数串编码一次后的结果；不要原样放入 `&`，也不要重复编码已有的 `%3D`、`%26`。

## 默认答复口径

```text
可以按这个格式配置：

https://qiandao.com/miniapp?appId=echoxxxx&path=xxxx&query=a%3Db%26c%3Dd

其中：
- appId 填小程序 appId
- path 填小程序内的实际页面路由地址，例如 pages/index、pages/detail
- query 单独放页面参数，不要把参数拼在 path 里

例如页面参数是 a=b&c=d，URL encode 后就是 a%3Db%26c%3Dd。
```
