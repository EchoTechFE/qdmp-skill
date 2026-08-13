# 千岛小程序开发指南

## 项目结构

```
myApp/
├── frontend/
|   ├── src/
│   │   ├── pages/           # 页面目录
│   │   ├── components/      # 组件目录
│   │   ├── composables/     # 组合式函数
│   │   ├── utils/           # 工具函数
│   │   ├── assets/          # 静态资源
│   │   └── app.vue          # 应用入口
|   ├── package.json
|   └── qdmp.json            # 小程序配置（仅 appId）
├── backend/                 # 后端服务目录（详见 project-workflows.md）
└── qdmp-config.json         # 主配置：appId、appSecret、runtime、mongodb（敏感，需加入 .gitignore）
```

> 后端目录结构和代码模板详见 [project-workflows.md](./project-workflows.md) 的「流程一：创建项目 - Step 4: 初始化后端代码模板」

---

## 小程序全局权限配置

系统级权限属于小程序全局配置，不是运行时 Bridge API。Taro 项目修改 `frontend/src/app.config.js`；构建后会生成 `app.json`。不要直接修改 `dist/app.json`，它会在下次构建时被覆盖。

两个字段职责不同：

| 字段 | 值 | 用途 |
| ---- | -- | ---- |
| `permission` | `scope` 到 `{ desc }` 的对象映射 | 声明权限用途；`desc` 必须说明当前业务为何需要该权限 |
| `requiredPrivateInfos` | 隐私接口名数组 | 声明小程序实际会调用的隐私接口，例如 `getFuzzyLocation` |

```js
export default defineAppConfig({
  pages: ['pages/index/index'],
  window: {
    navigationBarTitleText: '千岛小程序',
  },
  requiredPrivateInfos: ['getFuzzyLocation'],
  permission: {
    'scope.userFuzzyLocation': {
      desc: '用于展示附近的活动',
    },
    'scope.writePhotosAlbum': {
      desc: '用于将生成的海报保存到系统相册',
    },
  },
})
```

实现步骤：

1. 从需求和实际 API 调用反推所需权限，只声明真实使用的项。
2. 在 `permission` 中使用合法的 `scope.*` 键，并写清具体业务用途；不要使用“用于完善体验”等泛化描述。
3. 对需要在全局配置声明的隐私接口，把接口名加入 `requiredPrivateInfos`；这里填写接口名，不填写 `scope.*`。
4. 保留现有配置并去重，不要为了新增一项权限覆盖整个 `permission` 对象或数组。
5. 执行项目构建，检查生成的 `dist/app.json` 是否包含预期字段，并确认源码中没有未声明的隐私接口调用或不再使用的权限声明。

全局声明不等于用户已授权。需要运行时授权时，仍应在用户主动触发相关功能后按需调用 `qd.getSetting`、`qd.authorize` 或 `qd.openSetting`；不要在应用启动时集中索取权限。

---

## 屏幕方向配置（SDK 1.0）

屏幕方向是编译期配置，不是 `qd.*` 运行时 Bridge API。SDK 1.0.0 起，Android、iOS、Harmony 支持全局固定横屏、页面固定横屏和页面自动旋转；Web 不在当前能力广场的支持范围内。

### 全局固定横屏

在 `frontend/src/app.config.js` 的 `window` 中设置 `pageOrientation: 'landscape'`，构建后对应 `app.json.window.pageOrientation`：

```js
export default defineAppConfig({
  pages: ['pages/index/index'],
  window: {
    navigationBarTitleText: '千岛小程序',
    pageOrientation: 'landscape',
  },
})
```

该配置会影响整个小程序。只有所有页面都应固定横屏时才写入全局 `window`；单页横屏不要为了测试方便改成全局配置。

### 页面级横屏或自动旋转

在目标页面的 `index.config.js` 中配置：

```js
// pages/game/index.config.js：固定横屏
export default definePageConfig({
  navigationBarTitleText: '横屏页面',
  pageOrientation: 'landscape',
})
```

```js
// pages/viewer/index.config.js：跟随设备方向自动旋转
export default definePageConfig({
  navigationBarTitleText: '自动旋转页面',
  pageOrientation: 'auto',
})
```

实现与验收要求：

1. 先判断作用域：全应用固定横屏使用全局配置；仅个别页面使用页面级配置。
2. 保留配置文件中的导航栏等已有字段，不要覆盖整个配置对象。
3. 需要在旋转后重排内容时，用 `qd.onWindowResize` 监听窗口变化，并用 `qd.getSystemInfo()` 或 `qd.getWindowInfo()` 读取最新宽高；不要只读取一次启动时尺寸。
4. 在 Android、iOS、Harmony 真机分别验收进入页面、旋转、返回和导航栏布局；Web 端提供正常可用的自适应布局作为降级。

---

## 服务端 API 调用

千岛小程序通过 `fetch` + Gateway 获取业务数据（SPU、帖子、交易等），详细接口文档见 [api-guide.md](./api-guide.md)。

---

### 基础配置

```vue
<script setup>
const BASE = 'https://openapi.qiandao.com'
</script>
```

**关键约定**:
- 分页: `offset` (默认 0) / `limit` (默认 20)
- ID 类型: 所有 ID 为 string
- 图片防盗链: index.html 必须加 `<meta name="referrer" content="no-referrer">`
- 页面跳转: 使用 `qd.navigateTo` 传递 query 参数时，参数值不得直接拼接中文、空格、`&`、`?`、`=` 等特殊字符；若参数可能包含中文或特殊字符，必须使用 `encodeURIComponent` 编码。

```javascript
qd.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${encodeURIComponent(cat.name)}`,
})
```

禁止写法：

```javascript
qd.navigateTo({
  url: `/pages/category/index?key=${cat.key}&name=${cat.name}`,
})
```

### Token 管理与自动刷新

开发者在获取 Token 时应同时保存 `refreshToken`，并在 Token 过期前主动刷新。

```javascript
// utils/tokenManager.js
const OPENAPI_BASE = 'https://openapi.qiandao.com'

// Token 存储 key
const TOKEN_KEY = 'qdmp_access_token'
const REFRESH_TOKEN_KEY = 'qdmp_refresh_token'
const EXPIRES_AT_KEY = 'qdmp_token_expires_at'

// 提前刷新时间（秒），在过期前 5 分钟刷新
const REFRESH_THRESHOLD = 300

class TokenManager {
  static getAccessToken() {
    return localStorage.getItem(TOKEN_KEY)
  }

  static getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  }

  static getExpiresAt() {
    const val = localStorage.getItem(EXPIRES_AT_KEY)
    return val ? parseInt(val, 10) : 0
  }

  /**
   * 保存 Token 信息
   * @param {string} accessToken
   * @param {string} refreshToken
   * @param {number} expiresAt - 秒级时间戳
   */
  static saveToken(accessToken, refreshToken, expiresAt) {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    localStorage.setItem(EXPIRES_AT_KEY, String(expiresAt))
  }

  static clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(EXPIRES_AT_KEY)
  }

  /**
   * 检查 Token 是否需要刷新
   */
  static needsRefresh() {
    const expiresAt = this.getExpiresAt()
    const now = Math.floor(Date.now() / 1000)
    return expiresAt - now < REFRESH_THRESHOLD
  }

  /**
   * 检查 Token 是否已过期
   */
  static isExpired() {
    const expiresAt = this.getExpiresAt()
    const now = Math.floor(Date.now() / 1000)
    return now >= expiresAt
  }

  /**
   * 刷新 Token
   * @returns {Promise<string>} 新的 accessToken
   * @throws {Error} 刷新失败时抛出错误（错误码 10007/10008）
   */
  static async refreshToken() {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) {
      throw new Error('No refresh token available')
    }

    const res = await fetch(`${OPENAPI_BASE}/auth/v1/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })

    const json = await res.json()

    // 错误码 10007: refreshToken 无效，10008: refreshToken 已过期
    if (json.code !== 0 && json.code !== '0') {
      this.clearToken()
      throw new Error(json.message || `Refresh failed: ${json.code}`)
    }

    const { accessToken, expiresAt } = json.data
    // 刷新接口不返回新的 refreshToken，保留原有的
    this.saveToken(accessToken, refreshToken, expiresAt)

    return accessToken
  }

  /**
   * 获取有效的 Token，必要时自动刷新
   * @returns {Promise<string|null>}
   */
  static async getValidToken() {
    const token = this.getAccessToken()
    if (!token) return null

    // Token 即将过期，尝试刷新
    if (this.needsRefresh()) {
      try {
        return await this.refreshToken()
      } catch (e) {
        console.error('Token refresh failed:', e)
        // 如果刷新失败但 Token 尚未完全过期，仍可继续使用
        if (!this.isExpired()) {
          return token
        }
        return null
      }
    }

    return token
  }
}

export default TokenManager
```

### 获取 Token（含 Refresh）

```javascript
// utils/auth.js
import TokenManager from './tokenManager'

const OPENAPI_BASE = 'https://openapi.qiandao.com'

/**
 * 使用凭证获取 Token
 * @param {object} params
 * @param {string} params.appId
 * @param {string} params.appSecret
 * @param {string} params.code - 授权码
 * @param {string} params.grantType - 'CLIENT_CREDENTIALS' | 'AUTHORIZATION_CODE'
 */
export async function getToken({ appId, appSecret, code, grantType }) {
  const res = await fetch(`${OPENAPI_BASE}/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, appSecret, code, grantType })
  })

  const json = await res.json()

  if (json.code !== 0 && json.code !== '0') {
    throw new Error(json.message || `Auth failed: ${json.code}`)
  }

  const { accessToken, refreshToken, expiresAt, openId } = json.data

  // 保存 Token 和 RefreshToken
  TokenManager.saveToken(accessToken, refreshToken, expiresAt)

  return { accessToken, refreshToken, expiresAt, openId }
}
```

### 封装请求函数

```javascript
// utils/api.js
import TokenManager from './tokenManager'

const OPENAPI_BASE = 'https://openapi.qiandao.com'

/**
 * 带自动刷新的请求函数
 */
export async function api(endpoint, options = {}) {
  const { method = 'GET', body, requireAuth = false } = options

  const headers = { 'Content-Type': 'application/json' }

  // 需要认证时，获取有效 Token
  if (requireAuth) {
    const token = await TokenManager.getValidToken()
    if (!token) {
      throw new Error('未登录或 Token 已失效，请重新登录')
    }
    headers['access-token'] = token
  }

  const config = { method, headers }

  if (body) {
    config.body = JSON.stringify(body)
  }

  let res = await fetch(`${OPENAPI_BASE}${endpoint}`, config)
  let json = await res.json()

  // 处理 401：尝试刷新后重试一次
  if (res.status === 401 && requireAuth) {
    try {
      const newToken = await TokenManager.refreshToken()
      headers['access-token'] = newToken
      res = await fetch(`${OPENAPI_BASE}${endpoint}`, { ...config, headers })
      json = await res.json()
    } catch (e) {
      throw new Error('登录已过期，请重新登录')
    }
  }

  if (!json.ok && json.code !== 0 && json.code !== '0') {
    throw new Error(json.error || json.message || '请求失败')
  }

  return json.data
}
```

### 封装 Composable（含 Token 刷新）

```javascript
// composables/useApi.js
import { ref } from 'vue'
import TokenManager from '@/utils/tokenManager'

const OPENAPI_BASE = 'https://openapi.qiandao.com'

export function useApi() {
  const loading = ref(false)
  const error = ref(null)

  /**
   * 发起请求（支持自动 Token 刷新）
   * @param {string} endpoint
   * @param {object} options
   * @param {string} options.method - HTTP 方法
   * @param {object} options.body - 请求体
   * @param {boolean} options.requireAuth - 是否需要认证
   */
  async function request(endpoint, options = {}) {
    const { method = 'GET', body, requireAuth = false } = options

    loading.value = true
    error.value = null

    try {
      const headers = { 'Content-Type': 'application/json' }

      if (requireAuth) {
        const token = await TokenManager.getValidToken()
        if (!token) {
          throw new Error('未登录或 Token 已失效')
        }
        headers['access-token'] = token
      }

      const config = { method, headers }
      if (body) {
        config.body = JSON.stringify(body)
      }

      let res = await fetch(`${OPENAPI_BASE}${endpoint}`, config)
      let json = await res.json()

      // 401 时尝试刷新 Token 后重试
      if (res.status === 401 && requireAuth) {
        const newToken = await TokenManager.refreshToken()
        headers['access-token'] = newToken
        res = await fetch(`${OPENAPI_BASE}${endpoint}`, { ...config, headers })
        json = await res.json()
      }

      const code = json.code
      if (code !== 0 && code !== '0' && !json.ok) {
        throw new Error(json.error || json.message || '请求失败')
      }

      return json.data
    } catch (e) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  // 便捷方法
  const get = (endpoint, opts = {}) => request(endpoint, { ...opts, method: 'GET' })
  const post = (endpoint, body, opts = {}) => request(endpoint, { ...opts, method: 'POST', body })

  return { loading, error, request, get, post }
}
```

### 业务场景与 API 对应

| 场景     | API                                        | 方法 |
| -------- | ------------------------------------------ | ---- |
| 搜索 SPU | `/treasure/v1/search/spu/with/related`     | POST |
| SPU 详情 | `/treasure/v1/spu/info?spuId={id}`         | GET  |
| SPU 列表 | `/treasure/spus/search/simple-info`        | POST |
| 搜索 Tag | `/treasure/v1/search/tags`                 | POST |
| Tag 详情 | `/flora/v1/tag/simpleInfo?entryId={tagId}` | GET  |
| 帖子列表 | `/gactus/admin/posts?circleId={islandId}`  | GET  |
| 岛屿列表 | `/treasure/bifrost/islands`                | POST |
| 拍卖场次 | `/c2c-web/v1/auctioneer/fields/list`       | POST |

### 使用示例

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'

const { loading, error, get, post } = useApi()
const spuList = ref([])

async function searchSpu(keyword) {
  const data = await post('/treasure/v1/search/spu/with/related', {
    keyword,
    limit: 10,
    offset: 0
  })
  if (data) {
    spuList.value = data.list
  }
}

async function fetchSpuInfo(spuId) {
  return await get(`/treasure/v1/spu/info?spuId=${spuId}`)
}

onMounted(() => searchSpu('dimoo'))
</script>

<template>
  <div v-if="loading">加载中...</div>
  <div v-else-if="error">{{ error }}</div>
  <div v-else>
    <div v-for="spu in spuList" :key="spu.id">
      <img :src="spu.cover" />
      <span>{{ spu.name }}</span>
    </div>
  </div>
</template>
```

### 认证流程示例

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { getToken } from '@/utils/auth'
import TokenManager from '@/utils/tokenManager'
import { useApi } from '@/composables/useApi'

const { loading, error, get } = useApi()
const userInfo = ref(null)
const isLoggedIn = ref(false)

onMounted(async () => {
  // 检查是否已有有效 Token
  const token = await TokenManager.getValidToken()
  if (token) {
    isLoggedIn.value = true
    await fetchUserInfo()
  }
})

// 登录获取 Token
async function handleLogin() {
  try {
    // 1. 调用 qd.login() 获取授权码
    const code = await new Promise((resolve, reject) => {
      qd.login({
        success: (res) => resolve(res.data.code),
        fail: (err) => reject(err)
      })
    })

    // 2. 用授权码换取 Token
    // 注意：appId/appSecret 应从环境变量或后端获取，不要硬编码
    await getToken({
      appId: import.meta.env.VITE_APP_ID,
      appSecret: import.meta.env.VITE_APP_SECRET,
      code,
      grantType: 'AUTHORIZATION_CODE'
    })

    isLoggedIn.value = true
    await fetchUserInfo()
  } catch (e) {
    console.error('登录失败:', e)
  }
}

// 获取用户信息（需要认证）
async function fetchUserInfo() {
  const data = await get('/user/v1/me', {
    requireAuth: true
  })
  if (data) {
    userInfo.value = data
  }
}

// 登出
function handleLogout() {
  TokenManager.clearToken()
  isLoggedIn.value = false
  userInfo.value = null
}
</script>

<template>
  <div class="auth-demo">
    <div v-if="!isLoggedIn">
      <button @click="handleLogin">登录</button>
    </div>
    <div v-else>
      <p>欢迎，{{ userInfo?.nickname }}</p>
      <button @click="handleLogout">退出</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
```

> 完整场景化 API 请参考 [api-guide.md](./api-guide.md)

---

## 完整页面示例

结合服务端 API 的完整示例：

```vue
<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi'

const { loading, error, get, post } = useApi()
const spuInfo = ref(null)

// 初始化
onMounted(async () => {
  // 获取业务数据
  const spuId = new URLSearchParams(location.search).get('spuId')
  if (spuId) {
    spuInfo.value = await get(`/treasure/v1/spu/info?spuId=${spuId}`)
  }
})

// 分享（Web 原生方式）
function handleShare() {
  if (navigator.share) {
    navigator.share({
      title: spuInfo.value?.name || '分享',
      url: location.href
    })
  } else {
    // 降级：复制链接到剪贴板
    navigator.clipboard.writeText(location.href)
    alert('链接已复制')
  }
}
</script>

<template>
  <div class="page">
    <div v-if="loading">加载中...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else-if="spuInfo" class="spu-detail">
      <img :src="spuInfo.cover" class="cover" />
      <h1>{{ spuInfo.name }}</h1>
      <p>{{ spuInfo.tagName }} · {{ spuInfo.categoryName }}</p>
      <button @click="handleShare">分享</button>
    </div>
  </div>
</template>
```

---

## 调试技巧

### 本地开发

对于后端，可以使用提示词**后端测试环境**更新本地部署的后端服务。

对于前端，执行以下命令：

```bash
pnpm run dev
```

在浏览器中打开开发者工具调试。

### 真机调试

```bash
qdmp build
qdmp-cli upload -d "真机调试版本"
```

使用千岛 App 扫码预览。

### 常见问题

| 问题              | 排查方向                                   |
| ----------------- | ------------------------------------------ |
| 页面白屏          | 检查控制台 JS 错误、页面路径是否注册       |
| 样式不生效        | 检查 CSS 兼容性、样式文件引入              |
| 接口 403          | 检查图片防盗链 meta 标签                   |

---

## 发布流程

### 发布前检查

- [ ] 功能测试完成
- [ ] 真机调试通过
- [ ] 版本号已更新
- [ ] 代码已提交 Git

### 发布步骤

```bash
# 1. 打包（必须使用 qdmp build，否则 upload 会失败）
qdmp build

# 2. 检查登录态
qdmp getMe
```

仅当检查结果为未登录或登录失效时，在支持输入的交互终端中单独执行：

```bash
qdmp login
```

登录成功后再上传：

```bash
qdmp-cli upload -d "新增商品筛选并优化加载体验"
```

`qdmp login` 会等待用户输入账号和密码，不能放入非交互命令、后台任务或与其他命令串联执行。如果当前执行工具不能让用户直接操作终端，应让用户在自己的终端完成登录，再执行 `qdmp getMe` 验证；不要在聊天中索取账号或密码。

通过本 skill 发版时，版本描述会根据本次 Git 改动自动总结并传入，无需手动编写。

上传后前往 [千岛开放平台](https://open.qiandao.com) 提交审核。
