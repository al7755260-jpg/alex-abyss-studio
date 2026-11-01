export type PlacementPhoto = {
  src: string
  width: number
  height: number
  caption: string
  alt: string
}

export type CommercialPlacement = {
  location: string
  description: string
  photos: readonly PlacementPhoto[]
}

/** Media imported from the client-provided review link; keep permanent local URLs. */
export type CommercialWork = {
  id: string
  title: string
  client?: string
  englishTitle: string
  year?: string
  portrait?: boolean
  description?: string
  stills?: readonly PlacementPhoto[]
  duration: number
  videoUrl: string
  posterUrl: string
  placement?: CommercialPlacement
}

export const COMMERCIAL_WORKS: readonly CommercialWork[] = [
  {
    id: 'shougang-2026',
    title: '首钢园 2026',
    client: '首钢园',
    englishTitle: 'SHOUGANG PARK',
    year: '2026',
    duration: 178.004,
    videoUrl: `${import.meta.env.BASE_URL}media/commissions/shougang-2026.mp4`,
    posterUrl: `${import.meta.env.BASE_URL}media/commissions/shougang-2026-poster.jpg`,
    placement: {
      location: '北京 · BEIJING',
      // Coverage supplied by the creator; captions describe visible scenes, not inferred venues.
      description: '《首钢园 2026》投放覆盖北京所有高铁站与机场，让创意走进人们的真实旅程。',
      photos: [
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-01.jpg`, width: 1280, height: 959, caption: '大厅巨幕', alt: '公共交通大厅中，首钢园航拍影像在旅客上方的巨幅屏幕播放' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-02.jpg`, width: 1280, height: 824, caption: '扶梯旁的光影', alt: '旅客乘坐扶梯，旁边的大屏展示首钢园烟花与水岸客厅画面' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-03.jpg`, width: 1280, height: 862, caption: '水岸客厅 · 活力秀场', alt: '三联巨幕播放首钢园夜景、烟花与水岸客厅活力秀场主题画面' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-04.jpg`, width: 1280, height: 853, caption: '驶过未来的想象', alt: '车辆经过公共屏幕，画面展示虚拟人物与机器人' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-05.jpg`, width: 1280, height: 959, caption: '旅途中的相遇', alt: '旅客拉着行李穿过大厅，首钢园影像在停车场导向标识旁的大屏播放' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-06.jpg`, width: 1280, height: 853, caption: '一屏湖光与工业记忆', alt: '弧形大屏呈现夕阳下首钢园的工业建筑与湖面倒影' },
        { src: `${import.meta.env.BASE_URL}media/commissions/shougang-placements/placement-07.jpg`, width: 1280, height: 877, caption: '人流之上的风景', alt: '排队通行的旅客上方，多块屏幕播放首钢园湖景与建筑画面' },
      ],
    },
  },
  {
    id: 'fila-agility',
    title: '多维敏捷',
    client: 'FILA 斐乐',
    englishTitle: 'MULTIDIMENSIONAL AGILITY',
    duration: 178.496,
    portrait: true,
    description: '从球场上的一次转向，深入鞋履内部的精密结构。以机械组装、材质剖面与动态光影，把运动科技转化为可见的想象。',
    videoUrl: `${import.meta.env.BASE_URL}media/commissions/multidimensional-agility.mp4`,
    posterUrl: `${import.meta.env.BASE_URL}media/commissions/fila-agility/poster.jpg`,
    stills: [
      { src: `${import.meta.env.BASE_URL}media/commissions/fila-agility/frame-01.webp`, width: 2048, height: 1152, caption: '机械组装 · 精密诞生', alt: '两侧橙色机械臂围绕直立鞋履工作，冷蓝光环照亮组装台' },
      { src: `${import.meta.env.BASE_URL}media/commissions/fila-agility/frame-02.webp`, width: 2048, height: 1152, caption: '结构展开 · 由内而外', alt: '机械臂之间，绿色镂空支撑结构与鞋底分层展开' },
      { src: `${import.meta.env.BASE_URL}media/commissions/fila-agility/frame-03.webp`, width: 2048, height: 1152, caption: '光束雕刻 · 力量的轮廓', alt: '紫色光束落在绿色网格部件上，边缘迸发橙色火花' },
      { src: `${import.meta.env.BASE_URL}media/commissions/fila-agility/frame-04.webp`, width: 2048, height: 1152, caption: '层层拆解 · 材质与形态', alt: '银色鞋面与鞋底分层悬浮，展示内部的网格结构' },
      { src: `${import.meta.env.BASE_URL}media/commissions/fila-agility/frame-05.webp`, width: 2048, height: 1152, caption: '成品呈现 · 多维敏捷', alt: '完整银色运动鞋悬浮在蓝紫色与红色数字光影之间' },
    ],
  },
  {
    id: 'oppo-tianjin',
    title: 'OPPO 天津旗舰店开业预热',
    client: 'OPPO',
    englishTitle: 'TIANJIN FLAGSHIP OPENING',
    duration: 31.530667,
    portrait: true,
    description: '从天津街巷的烟火气，走进一座建筑的百年变迁。以城市影像与历史场景重现，迎接 OPPO 天津旗舰店的新篇章。',
    videoUrl: `${import.meta.env.BASE_URL}media/commissions/oppo-tianjin.mp4`,
    posterUrl: `${import.meta.env.BASE_URL}media/commissions/oppo-tianjin-poster.jpg`,
  },
  {
    id: 'steel-ambition',
    title: '钢铁雄心',
    client: '首钢园',
    englishTitle: 'STEEL AMBITION',
    duration: 180.535147,
    videoUrl: `${import.meta.env.BASE_URL}media/commissions/steel-ambition.mp4`,
    posterUrl: `${import.meta.env.BASE_URL}media/commissions/steel-ambition-poster.jpg`,
  },
  {
    id: 'haidian-space',
    title: '海淀商业航天',
    englishTitle: 'HAIDIAN COMMERCIAL SPACE',
    duration: 202.013605,
    videoUrl: `${import.meta.env.BASE_URL}media/commissions/haidian-space.mp4`,
    posterUrl: `${import.meta.env.BASE_URL}media/commissions/haidian-space-poster.jpg`,
  },
]
