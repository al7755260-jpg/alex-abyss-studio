# Alex 的奇思妙想：深渊工作室

React + Vite + TypeScript + React Three Fiber 制作的本地交互式 3D 解谜网站。

## 3D 资产来源约定

从现在开始，项目新增或重做的 3D 元素统一通过 [Tripo API](https://developers.tripo3d.com/zh/docs/quick-start) 在**制作期**生成，再以本地 GLB 资产接入页面。网页运行时不会调用 Tripo，也不会接触 API Key。

仓库中已经存在的桌椅、电脑、柜子、机械章鱼等 GLB，有一部分历史上由 LUX3D 生成。它们会继续作为既有资产使用；只有真正通过 Tripo 重新生成并替换后，才能把对应资产来源改记为 Tripo，不能批量伪改历史来源。

完整资产流如下：

```text
文本 / 图片 URL / 本地参考图
  -> Tripo API 创建异步任务
  -> 轮询任务至 success
  -> 立即下载临时 model_url
  -> raw-models/tripo/<slug>/ 保留原始模型与生成记录
  -> 检查比例、朝向、PBR、贴图和穿模
  -> 优化后复制到 public/models/
  -> 前端加载本地 GLB
```

Tripo 返回的 `output.model_url` 约 **5 分钟后过期**，任务成功后必须立即下载，不能把临时 URL 写入前端或当作长期资产地址。

## 配置 Tripo API Key

在 [Tripo 控制台](https://platform.tripo3d.ai) 创建 API Key。密钥只允许放在服务端/本地制作环境变量 `TRIPO_API_KEY` 中，禁止写入源码、README、命令历史示例或提交到仓库。

特别注意：**绝对不要使用 `VITE_TRIPO_API_KEY` 或任何 `VITE_` 前缀**。Vite 会把这类变量注入浏览器构建产物，导致密钥泄露。

PowerShell 当前窗口临时设置：

```powershell
$env:TRIPO_API_KEY = '粘贴你的 Tripo API Key'
```

持久写入当前 Windows 用户环境变量：

```powershell
[Environment]::SetEnvironmentVariable(
  'TRIPO_API_KEY',
  '粘贴你的 Tripo API Key',
  'User'
)
```

持久设置后请重新打开 PowerShell。仓库中的 `.env.example` 只声明变量名，不包含真实密钥。

## 制作期命令

先检查本地密钥配置：

```powershell
npm run tripo:check
```

再做一次不会创建收费任务的在线鉴权探测：

```powershell
npm run tripo:check -- --online
```

通过文本生成：

```powershell
npm run tripo:generate -- --slug abyss-skull --text "unknown eldritch monster skull, Cthulhu gothic style, weathered bone, game-ready standalone prop"
```

通过公开图片 URL 生成：

```powershell
npm run tripo:generate -- --slug abyss-mask --image-url "https://example.com/reference.png"
```

通过本地图片生成（脚本会先上传图片，再提交 image-to-model 任务）：

```powershell
npm run tripo:generate -- --slug abyss-mask --image "C:\assets\abyss-mask-reference.png"
```

每次只能选择一种输入方式，并使用稳定、可读的 `slug`。原始结果统一写入：

```text
raw-models/tripo/<slug>/source.glb
raw-models/tripo/<slug>/preview.png
raw-models/tripo/<slug>/task.json
raw-models/tripo/<slug>/manifest.json
```

生成管线默认锁定以下质量配置，以保证资产可复现并满足网页近距离查看：

```json
{
  "model": "v3.1-20260211",
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "geometry_quality": "detailed"
}
```

不要在没有检查的情况下把原始生成结果直接覆盖线上资产。先确认模型没有白膜、材质通道齐全、轴向正确、比例合理，且放入场景后不悬空、不穿模；再执行优化：

```powershell
npm run tripo:optimize -- `
  -InputPath raw-models/tripo/<slug>/source.glb `
  -OutputPath public/models/<slug>-optimized.glb `
  -TextureSize 2048
```

优化脚本会做 Meshopt、优先尝试 WebP 纹理压缩并校验输出 GLB；若 Windows 本地贴图库无法识别原图色彩空间，会自动保留原始贴图继续发布，而不是让整次生成失败。页面始终加载 `public/models/` 内的本地成品，而不是 Tripo 临时 URL。

## 前端资产接入

例如书桌：

```ts
src: `${import.meta.env.BASE_URL}models/desk.glb`,
```

加载器会自动：

1. 计算模型包围盒；
2. 将模型底部落到 Y=0；
3. 将 X/Z 中心对齐资产槽原点；
4. 按 `fit.axis` 等比例缩放到目标尺寸；
5. 保留原始 PBR 材质并应用场景阴影。

如果 URL 无效或 GLB 加载失败，该资产会自动退回程序化占位模型。

## 运行

```powershell
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5173/`。生产预览使用：

```powershell
npm run build
npm run preview
```

请始终通过本地 HTTP 服务打开，不要直接用 `file://` 打开构建后的 HTML。

## 操作

- 左键拖动：旋转
- 右键拖动：平移
- 滚轮：缩放
- `R` 或右上角按钮：重置镜头
