# Alex 的奇思妙想：深渊工作室

React + Vite + TypeScript + React Three Fiber 制作的本地交互式 3D 个人创意作品展示网站。

当前展示版已移除任务、SAN 仪表、遗物收集及通关入口，保留场景动画和物体本身的光效，移除原线索位置独立闪烁的兴趣点。点击原“我的奇思妙想”书架入口会直接前往 `src/data/portfolioLinks.ts` 配置的天后宫项目。

点击魔法球会点亮球体，依次向周围投射安踏、首钢园、美的、斐乐、迪桑特、可隆六个立体 Logo；再次点击收起。Logo 位于不同前后深度，转动视角可以观察视差和厚度。投影使用本地 SVG 轮廓挤出，颜色与球体共用 `LAMP_EMISSION_COLOR`，布局与节奏配置见 `src/data/clientLogos.ts`。系统“减少动态效果”设置下直接显示或隐藏，关闭悬浮和扫描运动。Jev 仅在制作期辅助选择布局和动画方案，密钥不进入网页。

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

## 发布场景与 GitHub Pages

- 编辑时自动保存当前浏览器草稿；在 `npm run dev` 启动的本地站点点击右上角“保存并退出”，会将物体摆放、文字内容与位置、光照一起写入 `src/data/publishedScene.json`。
- 只有收到磁盘写入成功确认才退出编辑器并显示“已保存到本地文件”。保存中禁止重复提交；失败保留编辑页面与浏览器草稿，可重试同一按钮。
- 每次实际变更前，旧文件自动备份到 `.local-scene-backups/`；内容相同不重复备份。备份目录不进入 Git 或网站构建，也不能通过开发服务器下载。
- 本地保存接口只在开发服务器生效，仅接受本机、当前站点的完整场景请求，不支持指定任意文件路径。`npm run preview` 和公开网站不提供磁盘写入功能，公开版编辑仍只保存浏览器草稿。
- 保存不会上传 GitHub。要更新所有访客看到的场景，仍需重新构建发布。也可用“导出发布场景”备份 JSON，或迁移其他浏览器的编辑稿。
- 发布快照只包含物体位置、文字内容、文字变换和灯光，不包含游戏进度。当前浏览器已有的编辑存档仍优先，不会被部署清除。
- 保留源码里的原始 `DEFAULT_STUDIO_LAYOUT`：它是遗物附着点的坐标基准，不可直接替换为发布布局。

```powershell
npm test
npm run build -- --mode github-pages
npm run preview -- --mode github-pages
```

提交并推送 `main` 后，现有 GitHub Actions 自动构建和发布至 GitHub Pages。

## 资源加载优化

- GLB 几何与动画不变，贴图保留原分辨率：颜色贴图高质量 WebP，法线/金属度/粗糙度等数据贴图无损 WebP。
- 2026-09-03 首屏 26 个模型合计由 61.98 MiB 降至 43.58 MiB，全部 34 个模型由 94.07 MiB 降至 61.90 MiB。
- 模型请求最多并发 4 个，主体与主要家具优先；详情、结局及编辑器代码按需加载。
- 模型更新时同步递增 `src/main.tsx` 的 `assetRevision`，避免继续使用旧版同名模型缓存。
- `scripts/optimize-delivery-textures.mjs` 可复现贴图优化与几何保留校验；必须传入仓库外的 `--report-dir`，默认只产出候选，显式 `--apply` 才替换资产。

## 商业作品放映室

点击场景中的老式电视，打开横屏商业作品放映室。第一条为用户提供的《首钢园 2026》。页面保留暗金边框、背景纹理与青绿色光效；影片本身不叠加雪花或扫描线。原竖屏频道与公开评论已移除。

作品数据维护在 `src/data/commercialWorks.ts`，视频和真实影片封面放在 `public/media/commissions/`。本次接入的是分享页公开可播放的 1280×720 H.264/AAC 预览版本，约 178 秒、54 MB，已保存到本地避免临时签名地址过期；并非平台原始母版。支持原生播放控制、进度拖动、音量和全屏；关闭页面或切换作品会暂停上一条影片。点击「原始链接」可查看分享页。添加新作品时补充真实标题/客户信息与相应媒体资源即可。

《首钢园 2026》下方加入用户提供的 7 张投放现场照片，原件保存在 `public/media/commissions/shougang-placements/`，保持完整比例、原始颜色与水印。投放范围文案由用户提供，照片标题按可见场景描述，不推断具体站点。`placement` 是每个作品的可选数据，未配置时不显示展区。照片按需加载，点击可放大，支持按钮及左右方向键切换、Escape 关闭与焦点返回；打开照片会暂停影片。

Jev 在制作阶段辅助选择“横屏影片优先、资料与目录在下方”的布局和只作用于周边的光效；网站运行与视频播放不依赖 Jev。
