# OpenAPI 用户授权映射

[JSON 映射](../references/openapi-user-scopes.json)

| 方法 | 路径 | scope | 状态 |
| --- | --- | --- | --- |
| POST | `/c2c-openapi/v1/gamePriceLine` | — | 无需 scope |
| POST | `/c2c-openapi/v1/gameTradingHistory` | — | 无需 scope |
| POST | `/comment/v1/create` | `user.post.write` | 需要 scope |
| POST | `/comment/v1/like` | `user.post.write` | 需要 scope |
| GET | `/comment/v1/replies` | — | 无需 scope |
| POST | `/comment/v1/reply` | `user.post.write` | 需要 scope |
| GET | `/echo-openapi-experience-groupon/v1/groupon/cities` | — | 无需 scope |
| POST | `/echo-openapi-experience-groupon/v1/groupon/list` | — | 无需 scope |
| GET | `/folder/v1/detail` | `user.folder.read` | 需要 scope |
| POST | `/folder/v1/join` | `user.folder.write` | 需要 scope |
| GET | `/folder/v1/me` | `user.folder.read` | 需要 scope |
| GET | `/island/v1/detail` | — | 无需 scope |
| GET | `/island/v1/isJoined` | `user.island.read` | 需要 scope |
| GET | `/island/v1/joined` | `user.island.read` | 需要 scope |
| GET | `/island/v1/search` | — | 无需 scope |
| POST | `/mark/v1/add` | `user.mark.write` | 需要 scope |
| GET | `/mark/v1/me/detail` | `user.mark.read` | 需要 scope |
| GET | `/mark/v1/me/list` | `user.mark.read` | 需要 scope |
| GET | `/mark/v1/me/search` | `user.mark.read` | 需要 scope |
| POST | `/ocr/v1/recognize` | — | 无需 scope |
| GET | `/oss/v1/quota` | — | 无需 scope |
| POST | `/oss/v1/upload/prepare` | — | 无需 scope |
| GET | `/oss/v1/upload/result` | — | 无需 scope |
| GET | `/post/v1/List` | — | 无需 scope |
| GET | `/post/v1/comments` | — | 无需 scope |
| GET | `/post/v1/detail` | — | 无需 scope |
| POST | `/post/v1/dislike` | `user.post.write` | 需要 scope |
| POST | `/post/v1/favorite` | `user.post.write` | 需要 scope |
| POST | `/post/v1/like` | `user.post.write` | 需要 scope |
| GET | `/post/v1/me/List` | — | 无需 scope |
| GET | `/spu/v1/detail` | — | 无需 scope |
| GET | `/spu/v1/search` | — | 无需 scope |
| GET | `/tag/v1/detail` | — | 无需 scope |
| POST | `/tag/v1/follow` | `user.tag.write` | 需要 scope |
| GET | `/tag/v1/following` | `user.tag.read` | 需要 scope |
| GET | `/tag/v1/search` | — | 无需 scope |
| GET | `/user/v1/me` | `user.profile.read` | 需要 scope |
| POST | `/user/v1/phone/exchange` | — | 手机号授权码 |
| POST | `/wishspu/v1/add` | `user.wish.write` | 需要 scope |
| GET | `/wishspu/v1/list` | `user.wish.read` | 需要 scope |
