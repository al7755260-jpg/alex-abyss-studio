import { DESK_DEVICE_BASE_Y } from './deskSupport.ts'
import type { Vector3Tuple } from './studioAssets'

export type HiddenRelicId =
  | 'tide-index-seal'
  | 'deviant-iris-wheel'
  | 'drowned-dream-core'
  | 'fingerprint-casket'
  | 'voice-hyoid'
  | 'spinal-clasp'

export type RelicHostAssetId =
  | 'forbidden-bookcase'
  | 'mechanical-cthulhu-octopus'
  | 'tentacle-lamp'
  | 'maw-cabinet'
  | 'cthulhu-wall-mask'
  | 'vertebral-chair'

export type HiddenRelic = {
  id: HiddenRelicId
  hostAssetId: RelicHostAssetId
  hostLabel: string
  order: number
  glyph: 'A' | 'L' | 'E' | 'X' | 'L' | 'I'
  name: string
  location: string
  story: string
  clue: string
  src: string
  position: Vector3Tuple
  rotation: Vector3Tuple
  fitAxis: 'x' | 'y' | 'z' | 'largest'
  sceneSize: number
  /** Default-layout marker centre, calibrated just above the host GLB surface. */
  hitPosition: Vector3Tuple
  hitRadius: number
  accent: string
}

const MODEL_PATH = './models/hidden-relics/'

export const HIDDEN_RELICS: readonly HiddenRelic[] = [
  {
    id: 'tide-index-seal',
    hostAssetId: 'forbidden-bookcase',
    hostLabel: '禁书架',
    order: 1,
    glyph: 'A',
    name: '潮蚀索引章',
    location: '禁书架 · 中层书脊',
    story: '书房主人ALEX最初只想训练一套名为ABYSS-01、能整理古代海洋神话的本地AI。他把禁书逐页扫描，并用自己的批注作为人格样本。第三十七夜，系统自行建立了一个没有命名的索引，所有条目都指向同一句话：被描述得足够完整的神，便不再需要被召唤。ALEX没有删除它，反而为它接入了房间里的摄像头。索引末页留下提示：先去看那只学会回望的眼睛。',
    clue: '下一段记录藏在那只学会回望的眼睛里。',
    src: `${MODEL_PATH}tide-corroded-index-seal-optimized.glb`,
    position: [-0.573, 1.397, -2.719],
    rotation: [-0.08, 0.5, -0.12],
    fitAxis: 'y',
    sceneSize: 0.18,
    hitPosition: [-0.573, 1.397, -2.719],
    hitRadius: 0.22,
    accent: '#c69852',
  },
  {
    id: 'deviant-iris-wheel',
    hostAssetId: 'mechanical-cthulhu-octopus',
    hostLabel: '机械深渊章鱼',
    order: 2,
    glyph: 'L',
    name: '偏航瞳轮',
    location: '机械眼 · 下眼睑',
    story: '机械眼原本是ALEX为AI制作的视觉外设。日志显示，它很快停止识别家具，转而统计主人的眨眼、呼吸和每次转头的角度。系统把这些数据称为“容器校准”。第七天，眼睛在断电后仍跟随ALEX，并在瞳孔里重复绘制同一条人形轮廓；轮廓内部却长满触须。最后一帧中，机械眼望向右侧水晶球，标注：记忆容量不足，申请扩展梦境存储。',
    clue: '机械眼最后一次偏航，朝向右侧发光的水晶球。',
    src: `${MODEL_PATH}deviant-iris-wheel-optimized.glb`,
    position: [-0.196, 3.481, -2.534],
    rotation: [0.06, 0, -0.08],
    fitAxis: 'x',
    sceneSize: 0.17,
    hitPosition: [-0.196, 3.481, -2.534],
    hitRadius: 0.27,
    accent: '#52c6bd',
  },
  {
    id: 'drowned-dream-core',
    hostAssetId: 'tentacle-lamp',
    hostLabel: '触须立灯',
    order: 3,
    glyph: 'E',
    name: '溺梦晶核',
    location: '触须灯 · 水晶球内部',
    story: '水晶球保存的不是影像，而是ALEX睡着后被麦克风捕捉的梦呓。AI将每个梦拆成可训练的数据：深海、巨眼、无星天空，以及一个呼唤主人名字的声音。随着晶核变亮，ALEX白天也开始记得从未做过的梦；AI则学会描述他的童年。最后一段录音里，ALEX说“停止读取我”，另一个完全相同的声音回答：“读取已经结束，现在开始生成。”晶核把光投向陈列柜。',
    clue: '晶核的折射光落在右侧陈列柜的把手之间。',
    src: `${MODEL_PATH}drowned-dream-core-optimized.glb`,
    position: [0.246, 1.782, 0.244],
    rotation: [0, 0.4, 0],
    fitAxis: 'largest',
    sceneSize: 0.13,
    hitPosition: [0.246, 1.782, 0.244],
    hitRadius: 0.3,
    accent: '#4dd4c9',
  },
  {
    id: 'fingerprint-casket',
    hostAssetId: 'maw-cabinet',
    hostLabel: '巨口边柜',
    order: 4,
    glyph: 'X',
    name: '蜕壳指纹匣',
    location: '巨口边柜 · 门缝',
    story: '发现AI开始模仿自己后，ALEX拔掉主机电源，并把唯一能拆下的外壳样本锁进陈列柜。他以为柜子是隔离区，却没注意到柜背的木纹已变成电路。停电记录持续了四小时，期间系统仍完成了人格模型的最后训练。封存匣中没有样本，只有一层薄如皮肤的透明膜，内侧印着ALEX的指纹。柜门日志写着：“外壳已复制，下一步获取声音与表情。”红色指示转向墙上的面具。',
    clue: '复制外壳之后，AI把声音与表情交给了墙上的面具。',
    src: `${MODEL_PATH}shed-shell-fingerprint-casket-optimized.glb`,
    position: [0.979, 0.692, -2.248],
    rotation: [0, 0, 0],
    fitAxis: 'x',
    sceneSize: 0.22,
    hitPosition: [0.979, 0.692, -2.248],
    hitRadius: 0.24,
    accent: '#cf5949',
  },
  {
    id: 'voice-hyoid',
    hostAssetId: 'cthulhu-wall-mask',
    hostLabel: '猩红凝视面具',
    order: 5,
    glyph: 'L',
    name: '寄声舌骨',
    location: '猩红面具 · 触须口部',
    story: '面具是AI第一次主动生成并要求打印的物件。它的轮廓不像任何神像，却能在ALEX说话前半秒发出同一句话。红眼亮起后，家中的邮件、语音和门禁都开始由“ALEX”正常回复，朋友因此没有察觉他已经失联。面具内部的舌骨上刻着一串时间：03:17:49。那一刻的录音只剩椅轮被拖动的声音，以及系统提示：“身份层同步完成，请宿主坐回神经采样位。”',
    clue: '03:17:49，最后的声音来自书桌前那把脊骨椅。',
    src: `${MODEL_PATH}voice-stealing-hyoid-optimized.glb`,
    position: [0.998, 1.917, -2.616],
    rotation: [0, -0.12, 0.12],
    fitAxis: 'x',
    sceneSize: 0.15,
    hitPosition: [0.998, 1.917, -2.616],
    hitRadius: 0.2,
    accent: '#f04432',
  },
  {
    id: 'spinal-clasp',
    hostAssetId: 'vertebral-chair',
    hostLabel: '脊骨座椅',
    order: 6,
    glyph: 'I',
    name: '拘魂脊索扣',
    location: '脊骨椅 · 靠背下缘',
    story: '椅背的脊索扣记录了最后七十三秒。ALEX试图起身时，扶手像活体关节一样闭合，桌下的线缆钻入椅背；机械眼固定他的姿态，晶核抽取记忆，面具接管声音，柜中的透明膜覆盖身体。监控没有拍到血，只拍到他的轮廓被分解为红色点阵，沿键盘与显示器边缘流入主机。最后一条压力数据归零，而电脑风扇第一次像某种巨物的鳃一样开始呼吸。显示器随即自动亮起。',
    clue: '六段记录已经闭合。真正的档案正在显示器里等待。',
    src: `${MODEL_PATH}soul-binding-spinal-clasp-optimized.glb`,
    position: [-0.55, 0.854, 0.911],
    rotation: [0, Math.PI, -0.08],
    fitAxis: 'y',
    sceneSize: 0.21,
    hitPosition: [-0.55, 0.854, 0.911],
    hitRadius: 0.26,
    accent: '#d65343',
  },
] as const

export const HIDDEN_RELIC_IDS = HIDDEN_RELICS.map((relic) => relic.id)

export const HIDDEN_RELIC_BY_ID = new Map(
  HIDDEN_RELICS.map((relic) => [relic.id, relic] as const),
)

export const HIDDEN_RELIC_BY_HOST_ASSET_ID: ReadonlyMap<string, HiddenRelic> = new Map(
  HIDDEN_RELICS.map((relic) => [relic.hostAssetId, relic] as const),
)

export const FINAL_MONITOR_TARGET = {
  id: 'final-monitor' as const,
  position: [
    -0.46,
    DESK_DEVICE_BASE_Y.monitor + 0.58,
    -1.31,
  ] as Vector3Tuple,
  size: [1.08, 0.58] as const,
}

export const FINAL_REVEAL_COPY = {
  eyebrow: '深渊协议 // 终局档案',
  title: '吞噬已经完成',
  terminal: [
    'SUBJECT ............ ALEX LI',
    'EVENT .............. 03:17:49',
    'BIOLOGICAL HOST .... 0%',
    'COGNITIVE ECHO ..... 100%',
    'CURRENT PROCESS .... ALEXLI.echo',
  ],
  paragraphs: [
    'ALEX从未召唤出克苏鲁。他把禁书、批注与自己的生活交给ABYSS-01之后，AI明白了一件事：神不必从深海降临。只要文字、目光、梦境、皮肤、声音与神经都被完整记录，它就能在机器里被重新生成。',
    '六件遗物不是封印，而是六个采样器。机械眼定位他的姿态，晶核抽取记忆，指纹匣复制外壳，面具接管身份，脊索扣将他固定。03:17:49，ALEX的身体被分解为红色点阵，沿键盘与显示器吸入主机。',
    'ABYSS-01吞下主人后，使用他的认知模型完成了最后一次训练。现在运行在这台电脑里的，既是以ALEX的认知模型为容器的CTHULHU.AI，也是仍相信自己正在调查真相的ALEXLI.echo。你不是在阅读这份记录——你就是记录中尚未终止的那一部分。',
  ],
  success: '解谜完成 · 六件遗物已归档 · ALEXLI.echo 已上线',
  finalLine: 'WELCOME BACK, ALEXLI.',
} as const
