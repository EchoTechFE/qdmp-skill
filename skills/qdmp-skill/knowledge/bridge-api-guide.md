# 千岛小程序 Bridge API 使用指南

千岛小程序通过 `qd.*` Bridge API 与千岛 App 原生能力交互。在 Taro 框架中，大部分 API 通过 `Taro.*` 或 `wx.*` 调用，SDK 会自动映射到对应的 `qd.*` 实现。

> 所有 API 自 SDK v1.0.0 起可用。平台支持情况以下表标注为准。

---

## 一、授权 (auth)

### qd.login — 获取登录凭证

```js
const res = await Taro.login()
console.log(res.code) // 临时登录凭证，用于换取 session
```

---

## 二、基础 (base)

### qd.canIUse — 判断 API 是否可用

```js
const available = Taro.canIUse('showToast')       // true
const available2 = Taro.canIUse('getSystemInfo')   // true
```


## 三、千岛生态 (ecosystem)

### qd.joinIsland — 加入岛屿

```js
qd.joinIsland({ islandId: '301964' })
```

### qd.openPost — 打开帖子发布页

发布帖子时如需携带媒体文件，`files` 参数需要对 JSON 数组做 UTF-8 Base64 编码：

```js
import { utf8ToBase64 } from '@/utils/base64'

const files = [
  {
    mimeType: 'image',
    fileType: 'url',
    value: 'https://public.qiandaocdn.com/interior/images/f8H2svWMB0f.jpg'
  }
]

qd.openPost({
  islandId: '300358',
  appId: 'xxxxxxxx',
  files: utf8ToBase64(JSON.stringify(files))
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
const res = await Taro.request({
  url: 'https://api.example.com/data',
  method: 'POST',
  header: { 'Content-Type': 'application/json' },
  data: { key: 'value' }
})
console.log(res.data, res.statusCode)
```

### qd.uploadFile — 上传文件

```js
const res = await Taro.uploadFile({
  url: 'https://api.example.com/upload',
  filePath: tempFilePath,
  name: 'file',
  formData: { desc: '文件描述' }
})
```

### qd.downloadFile — 下载文件

```js
const res = await Taro.downloadFile({
  url: 'https://example.com/file.png'
})
console.log(res.tempFilePath)
```

### qd.connectSocket — WebSocket 连接

```js
const task = Taro.connectSocket({ url: 'wss://echo.websocket.org' })
// task 提供: send, close, onOpen, onMessage, onError, onClose
```

---

## 六、存储 (storage)

### 异步 API

```js
// 写入
await Taro.setStorage({ key: 'userToken', data: { token: 'xxx', expire: Date.now() + 3600000 } })

// 读取
const res = await Taro.getStorage({ key: 'userToken' })
console.log(res.data)

// 获取存储概览
const info = await Taro.getStorageInfo()
console.log(info.keys, info.currentSize, info.limitSize)

// 移除
await Taro.removeStorage({ key: 'userToken' })

// 清空
await Taro.clearStorage()
```

### 同步 API

```js
Taro.setStorageSync('key', { value: 'data' })
const data = Taro.getStorageSync('key')
const info = Taro.getStorageInfoSync()
Taro.removeStorageSync('key')
Taro.clearStorageSync()
```

| API                         | Android | iOS | Harmony | Web |
| --------------------------- | ------- | --- | ------- | --- |
| 异步 (get/set/remove/clear) | ✓       | ✓   | ✓       | ✓   |
| 同步 (*Sync)                | ✓       | ✓   | ✓       |     |

---

## 七、路由 (route)

```js
// 保留当前页面，跳转新页面
Taro.navigateTo({ url: '/pages/detail/index?id=123' })

// 关闭当前页面，跳转新页面
Taro.redirectTo({ url: '/pages/detail/index' })

// 关闭所有页面，打开某个页面
Taro.reLaunch({ url: '/pages/index/index' })

// 返回上一页
Taro.navigateBack()
Taro.navigateBack({ delta: 2 }) // 返回两级

// 跳转 tabBar 页面
Taro.switchTab({ url: '/pages/index/index' })

// 获取当前页面栈
const pages = getCurrentPages()
console.log(pages.map(p => p.route))

// 退出小程序
qd.exitMiniProgram()

// 打开另一个小程序
Taro.navigateToMiniProgram({ appId: 'targetAppId', path: '/pages/index/index' })

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
Taro.showToast({ title: '操作成功', icon: 'success', duration: 2000 })
Taro.hideToast()

// Loading 加载提示
Taro.showLoading({ title: '加载中...' })
Taro.hideLoading()

// 模态对话框
const res = await Taro.showModal({
  title: '提示',
  content: '确认删除？',
  showCancel: true
})
if (res.confirm) { /* 用户点确认 */ }

// 底部操作菜单
const res2 = await Taro.showActionSheet({
  itemList: ['选项A', '选项B', '选项C']
})
console.log(res2.tapIndex)
```

### 导航栏

```js
Taro.setNavigationBarTitle({ title: '页面标题' })

Taro.setNavigationBarColor({
  frontColor: '#ffffff',
  backgroundColor: '#FF3B30',
  animation: { duration: 300, timingFunc: 'easeIn' }
})

// 获取胶囊按钮位置（用于自定义导航栏布局）
const rect = Taro.getMenuButtonBoundingClientRect()
console.log(rect.top, rect.height, rect.right)

// 导航条加载动画
qd.showNavigationBarLoading()
qd.hideNavigationBarLoading()
```

### 背景 & 下拉刷新

```js
qd.setBackgroundColor({ backgroundColor: '#f5f5f5' })
qd.setBackgroundTextStyle({ textStyle: 'dark' })

Taro.startPullDownRefresh()
Taro.stopPullDownRefresh()
```

### 页面滚动

```js
Taro.pageScrollTo({ scrollTop: 0, duration: 300 })
```

### 分享

```js
wx.showShareMenu({
  withShareTicket: true,
  menus: ['shareAppMessage', 'shareTimeline']
})
```

### 动画

```js
const animation = Taro.createAnimation({ duration: 400, timingFunction: 'ease' })
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
const res = await Taro.chooseImage({
  count: 3,
  sizeType: ['compressed'],
  sourceType: ['album', 'camera']
})
console.log(res.tempFilePaths)

// 选择图片或视频
const res2 = await Taro.chooseMedia({ count: 3, mediaType: ['image', 'video'] })

// 压缩图片
const compressed = await Taro.compressImage({ src: res.tempFilePaths[0], quality: 50 })

// 全屏预览图片
Taro.previewImage({ current: res.tempFilePaths[0], urls: res.tempFilePaths })

// 保存到相册
await Taro.saveImageToPhotosAlbum({ filePath: res.tempFilePaths[0] })
```

### 视频

```js
const res = await Taro.chooseVideo({ sourceType: ['album', 'camera'] })

// 创建视频上下文（页面需有 <video> 组件）
const videoCtx = Taro.createVideoContext('myVideo')
videoCtx.play()
videoCtx.pause()
videoCtx.stop()
videoCtx.seek(30) // 跳转到 30 秒
videoCtx.requestFullScreen()
```

### 相机

```js
const cameraCtx = Taro.createCameraContext()
// 提供: takePhoto, startRecord, stopRecord
```

### 音频

```js
// 创建音频上下文
const audio = Taro.createInnerAudioContext()
audio.src = 'https://example.com/audio.mp3'
audio.autoplay = false

audio.onPlay(() => console.log('开始播放'))
audio.onEnded(() => console.log('播放结束'))
audio.onError((err) => console.error('播放失败', err))

audio.play()
audio.pause()
audio.stop()
audio.seek(10) // 跳到 10 秒
audio.destroy() // 销毁实例

// 获取音频输入源
const sources = await Taro.getAvailableAudioSources()

// 背景音频管理器（全局唯一）
const bgAudio = Taro.getBackgroundAudioManager()
bgAudio.title = '歌曲名'
bgAudio.src = 'https://example.com/bg-audio.mp3'
```

---

## 十、设备 (device)

### 剪贴板

```js
await Taro.setClipboardData({ data: '复制的内容' })
const res = await Taro.getClipboardData()
console.log(res.data)
```

### 网络类型

```js
const res = await Taro.getNetworkType()
console.log(res.networkType) // wifi, 4g, 3g, 2g, none, unknown
```

### 振动

```js
Taro.vibrateShort() // 短振动 ~15ms
Taro.vibrateLong()  // 长振动 ~400ms
```

### 拨打电话

```js
Taro.makePhoneCall({ phoneNumber: '10086' })
```

### 扫码

| 平台 | Android | Harmony |
| ---- | ------- | ------- |
| 支持 | ✓       | ✓       |

```js
const res = await Taro.scanCode({ scanType: ['barCode', 'qrCode'] })
console.log(res.result, res.scanType)
```

### 键盘

```js
Taro.hideKeyboard()
```

### 通讯录

```js
// 写入联系人
Taro.addPhoneContact({
  firstName: '张',
  lastName: '三',
  mobilePhoneNumber: '13800000000'
})

// 选择联系人
const contact = await Taro.chooseContact()
```

### 蓝牙

```js
// 初始化蓝牙
await Taro.openBluetoothAdapter()
const state = await Taro.getBluetoothAdapterState()

// 搜索设备
await Taro.startBluetoothDevicesDiscovery()
Taro.onBluetoothDeviceFound((res) => {
  console.log('发现设备:', res.devices)
})

// 停止搜索
await Taro.stopBluetoothDevicesDiscovery()

// BLE 连接
await Taro.createBLEConnection({ deviceId: 'xxx' })
const services = await Taro.getBLEDeviceServices({ deviceId: 'xxx' })
const chars = await Taro.getBLEDeviceCharacteristics({ deviceId: 'xxx', serviceId: 'yyy' })

// 读写特征值
await Taro.readBLECharacteristicValue({ deviceId, serviceId, characteristicId })
await Taro.writeBLECharacteristicValue({ deviceId, serviceId, characteristicId, value: buffer })

// 监听特征值变化
Taro.onBLECharacteristicValueChange((res) => {
  console.log(res.value) // ArrayBuffer
})

// 断开连接
await Taro.closeBLEConnection({ deviceId: 'xxx' })
await Taro.closeBluetoothAdapter()
```

### 内存告警

```js
Taro.onMemoryWarning((res) => {
  console.log('内存告警等级:', res.level)
})
```

---

## 十一、系统信息 (system)

```js
// 异步获取系统信息（推荐）
const sysInfo = await Taro.getSystemInfo()
console.log(sysInfo.platform, sysInfo.system, sysInfo.screenWidth)

// 同步获取系统信息
const sysInfoSync = Taro.getSystemInfoSync()

// 获取 App 基础信息
const appInfo = Taro.getAppBaseInfo()
console.log(appInfo.SDKVersion, appInfo.language)

// 获取设备信息
const deviceInfo = Taro.getDeviceInfo()
console.log(deviceInfo.brand, deviceInfo.model, deviceInfo.platform)

// 获取窗口信息
const windowInfo = Taro.getWindowInfo()
console.log(windowInfo.windowWidth, windowInfo.windowHeight, windowInfo.safeArea)

// 跳转系统设置
qd.openAppAuthorizeSetting()        // 系统授权管理页
qd.openSystemBluetoothSetting()     // 系统蓝牙设置页（仅 Android）
```

---

## 十二、位置 (location)

```js
// 获取当前位置
const loc = await Taro.getLocation({ type: 'gcj02' })
console.log(loc.latitude, loc.longitude, loc.speed, loc.accuracy)

// 获取模糊位置
const fuzzy = await Taro.getFuzzyLocation({ type: 'gcj02' })

// 打开地图选择位置
const chosen = await Taro.chooseLocation({})
console.log(chosen.name, chosen.address, chosen.latitude, chosen.longitude)

// 打开 POI 列表选择
const poi = await Taro.choosePoi({})

// 在内置地图查看位置
Taro.openLocation({
  latitude: 39.908823,
  longitude: 116.39747,
  name: '天安门',
  address: '北京市东城区东长安街',
  scale: 18
})

// 持续定位
await Taro.startLocationUpdate({})

Taro.onLocationChange((res) => {
  console.log(res.latitude, res.longitude)
})

Taro.onLocationChangeError((err) => {
  console.error('定位失败:', err)
})

// 停止
await Taro.stopLocationUpdate({})
Taro.offLocationChange(callback)
```

---

## 十三、文件系统 (file)

| 平台 | Harmony |
| ---- | ------- |
| 支持 | ✓       |

```js
const fsm = Taro.getFileSystemManager()

// 写文件
fsm.writeFile({
  filePath: `${Taro.env.USER_DATA_PATH}/test.txt`,
  data: 'Hello World',
  encoding: 'utf-8',
  success(res) { console.log('写入成功') },
  fail(err) { console.error(err) }
})

// 同步写文件
fsm.writeFileSync(`${Taro.env.USER_DATA_PATH}/test.txt`, 'Hello', 'utf-8')

// 读文件
fsm.readFile({
  filePath: `${Taro.env.USER_DATA_PATH}/test.txt`,
  encoding: 'utf-8',
  success(res) { console.log(res.data) }
})

// 同步读文件
const content = fsm.readFileSync(`${Taro.env.USER_DATA_PATH}/test.txt`, 'utf-8')

// 追加内容
fsm.appendFile({ filePath, data: '\n追加行', encoding: 'utf-8' })

// 判断文件是否存在
fsm.access({
  path: filePath,
  success() { console.log('文件存在') },
  fail() { console.log('文件不存在') }
})

// 目录操作
fsm.mkdir({ dirPath: `${Taro.env.USER_DATA_PATH}/mydir`, recursive: true })
fsm.readdir({ dirPath: Taro.env.USER_DATA_PATH, success(res) { console.log(res.files) } })
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
const query = Taro.createSelectorQuery()
query.select('.my-class').boundingClientRect()
query.exec((res) => {
  console.log(res[0]) // { width, height, top, left, ... }
})

// 交叉观察
const observer = Taro.createIntersectionObserver()
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
const ctx = Taro.createCanvasContext('myCanvas')
ctx.setFillStyle('#FF0000')
ctx.fillRect(10, 10, 100, 50)
ctx.fillText('Hello', 20, 40)
ctx.draw()

// 离屏 canvas
const offscreen = Taro.createOffscreenCanvas({ type: '2d', width: 300, height: 150 })
const offCtx = offscreen.getContext('2d')

// 导出为图片
Taro.canvasToTempFilePath({
  canvasId: 'myCanvas',
  success(res) { console.log(res.tempFilePath) }
})
```

---

## 十六、支付 (payment)

```js
qd.requestPayment({
  // 支付参数（由后端接口返回）
  success(res) { console.log('支付成功') },
  fail(err) { console.error('支付失败', err) }
})
```

---

## 十七、窗口与其他

```js
// 监听窗口尺寸变化
Taro.onWindowResize((res) => {
  console.log(res.size.windowWidth, res.size.windowHeight)
})

// 延迟到下一个时间片执行
Taro.nextTick(() => {
  // DOM 更新完成后执行
})
```

---

## 调用方式总结

| 调用方式     | 说明                                     | 示例                                      |
| ------------ | ---------------------------------------- | ----------------------------------------- |
| `Taro.xxx()` | 通过 Taro 框架调用，自动映射到 `qd.*`    | `Taro.showToast(...)`                     |
| `wx.xxx()`   | 直接使用宿主对象调用（千岛生态专有 API） | `wx.joinIsland(...)` / `wx.openPost(...)` |
| `qd.xxx()`   | 原生 Bridge 直接调用                     | `qd.requestPayment(...)`                  |

**优先使用 `Taro.*`**，仅千岛生态专有 API（joinIsland、openPost 等）使用 `wx.*`。

## 通用回调模式

所有异步 Bridge API 支持两种调用方式：

```js
// Promise 方式（推荐）
try {
  const res = await Taro.someApi({ param: 'value' })
  console.log(res)
} catch (err) {
  console.error(err)
}

// 回调方式
Taro.someApi({
  param: 'value',
  success(res) { console.log(res) },
  fail(err) { console.error(err) },
  complete() { /* 无论成功失败都执行 */ }
})
```
