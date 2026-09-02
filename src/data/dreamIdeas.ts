export type DreamIdeaId =
  | 'city-dream'
  | 'emotion-archaeology'
  | 'product-past-life'
  | 'reverse-trailer'

export type DreamIdeaBeat = {
  time: string
  title: string
  description: string
}

export type DreamIdea = {
  id: DreamIdeaId
  order: number
  title: string
  shortTitle: string
  summary: string
  anchor: string
  shift: string
  grammar: string
  beats: readonly DreamIdeaBeat[]
  production: readonly string[]
  promptSeed: string
  accent: string
}

export const DREAM_IDEAS: readonly DreamIdea[] = [
  {
    id: 'city-dream',
    order: 1,
    title: '让城市做一场不属于它的梦',
    shortTitle: '城市的陌生梦',
    summary: '把真实街景喂给 AI，让熟悉的楼宇在同一镜头里经历生长、坍塌与重生。',
    anchor: '一条任何人都认得的街道，以及始终不变的行进方向。',
    shift: '建筑像生物一样呼吸，影子先于实体坍塌，废墟又从水面倒着长回去。',
    grammar: '固定机位缓推，用一次遮挡完成三段时间跳跃，首尾保持同一轮廓。',
    beats: [
      { time: '00—03s', title: '现实仍然坚固', description: '雨后的普通街口，镜头沿路面缓慢前进，留住真实车灯与行人尺度。' },
      { time: '03—08s', title: '城市开始梦游', description: '楼宇长出肋骨般的拱架，窗户像眼睑闭合，地面积水向天空倒流。' },
      { time: '08—12s', title: '梦醒，却没有复原', description: '街道重新长回熟悉模样，只留下所有影子比主人早五秒移动。' },
    ],
    production: [
      '先拍一条构图稳定、遮挡关系清晰的真实街景作为现实锚点。',
      '用首尾帧控制建筑轮廓，仅让材质、结构和时间方向发生偏移。',
      '把最剧烈的形变压在一次车辆遮挡中，保住镜头连续性。',
    ],
    promptSeed: '雨夜的真实城市街口在固定镜头中缓慢梦化，现代楼宇长成湿润的肋骨拱架，积水倒流向天空，所有影子提前五秒行动，克制的深黑绿与暗红余烬，电影感，连续空间，不切镜。',
    accent: '#b84a37',
  },
  {
    id: 'emotion-archaeology',
    order: 2,
    title: '一分钟的情绪考古',
    shortTitle: '情绪考古',
    summary: '不解释一个人的悲伤，只把它拆成房间里不断出现、又被擦掉的微小证据。',
    anchor: '同一张餐桌、同一个空位，以及一杯从未被喝完的水。',
    shift: '每次眨眼，房间便老去十年；人物没有变，物件却逐渐记住曾经发生的事。',
    grammar: '十二个五秒固定镜头，用声音先行和匹配剪辑建立看不见的时间。',
    beats: [
      { time: '00—05s', title: '留下空位', description: '晨光中的餐桌，杯沿有一枚新鲜指纹，椅子轻轻向后晃。' },
      { time: '05—35s', title: '证据自行生长', description: '桌面裂纹、墙上水痕和落灰的碗逐段出现，却没有任何人进出画面。' },
      { time: '35—60s', title: '听见缺席', description: '声音回到第一秒，画面却只剩一座被植物覆盖的空房。' },
    ],
    production: [
      '先用实拍建立完全一致的机位与光线参考，再生成不同年代的房间状态。',
      '固定杯子、椅背和窗框三处结构，让变化被观众主动发现。',
      '用呼吸、瓷器轻碰和远处水管声做时间线，不加解释性旁白。',
    ],
    promptSeed: '同一间安静餐厅跨越六十年，固定镜头与固定空椅，桌上的一杯水从新鲜到蒸发，墙面和家具逐渐记住一个缺席的人，冷静、克制、旧胶片颗粒，声音先于画面变化。',
    accent: '#4f8e84',
  },
  {
    id: 'product-past-life',
    order: 3,
    title: '让产品拥有前世',
    shortTitle: '产品的前世',
    summary: '不再介绍参数，而是让一件当代产品记起自己曾经作为另一种东西活过。',
    anchor: '产品真实外形、品牌色和一个可以反复出现的材质细节。',
    shift: '耳机记起深海贝壳，咖啡机记起蒸汽机，镜头在材质纹理里穿越前世。',
    grammar: '极近微距开场，沿同一条曲线完成材质匹配，再回到标准产品英雄镜头。',
    beats: [
      { time: '00—03s', title: '触摸现在', description: '镜头贴近产品的一道纹理，真实灯光和材质先建立可信度。' },
      { time: '03—09s', title: '前世浮出表面', description: '纹理延展成陌生世界，产品结构被重新解释，却仍保持轮廓识别。' },
      { time: '09—12s', title: '带着记忆回来', description: '世界折回产品，唯一留下的是一次不可能的反光或呼吸。' },
    ],
    production: [
      '先锁定产品三视图和主材质，生成过程只改变语境，不改变身份。',
      '选择一个真实结构当转场通道，例如网孔、旋钮刻度或玻璃折射。',
      '最后三秒回到可用于品牌投放的干净画面，避免概念吞掉产品。',
    ],
    promptSeed: '一件当代工业产品在极近微距中回忆自己的前世，表面纹理延展成古老海洋与黄铜机械，轮廓和材质识别始终准确，单一连续运镜，最后回到克制的产品英雄镜头。',
    accent: '#a98553',
  },
  {
    id: 'reverse-trailer',
    order: 4,
    title: '反向生成一支预告片',
    shortTitle: '反向预告片',
    summary: '先写下观众看完后应该记住的最后一秒，再倒推一个从结局泄漏出来的世界。',
    anchor: '最后一帧的单一视觉符号，以及一句绝不解释世界观的声音。',
    shift: '每个镜头都像是结局的残片，因果顺序被打乱，但色彩和运动方向始终连续。',
    grammar: '从终极画面反推六个镜头；动作接动作、声音接声音，信息永远只给一半。',
    beats: [
      { time: '00—04s', title: '先看见后果', description: '城市上空悬着一轮黑色太阳，画外音只说：我们迟到了。' },
      { time: '04—09s', title: '寻找并不存在的原因', description: '六个碎片镜头逆着运动方向出现，让观众主动拼接世界。' },
      { time: '09—12s', title: '回到第一道裂缝', description: '最后一帧极度安静，只留一个可以无缝接回开场的微小动作。' },
    ],
    production: [
      '先生成结尾英雄帧，再以它的光线、色彩和运动方向约束所有镜头。',
      '每个镜头只回答上一个镜头的一半问题，同时制造一个新问题。',
      '预告片先做声音骨架，再按重音生成画面，避免堆砌无关奇观。',
    ],
    promptSeed: '从结局向开端倒流的十二秒电影预告片，黑色太阳、停摆的人群与逆向飞回的碎片，所有镜头共享同一暗红光源和向左运动，信息克制，因果破碎，最后一帧无缝接回开场。',
    accent: '#8e3030',
  },
] as const

export const DEFAULT_DREAM_IDEA_ID: DreamIdeaId = DREAM_IDEAS[0].id

export const DREAM_IDEA_BY_ID: ReadonlyMap<DreamIdeaId, DreamIdea> = new Map(
  DREAM_IDEAS.map((idea) => [idea.id, idea] as const),
)
