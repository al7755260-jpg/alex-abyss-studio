import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import './TelevisionTransmission.css'

export const DOUYIN_SIGNALS = [
  {
    id: 'memory-fragment-01',
    videoId: '7646446323129994534',
    playerUrl: 'https://open.douyin.com/player/video?vid=7646446323129994534&autoplay=0',
    code: 'CH-01',
    selectorLabel: '残片 01',
    noise: '87.4%',
    comments: [
      { author: '晓颜动漫', text: 'Gemini更方便，简直不要太逆天', likes: 1156 },
      { author: '万河汇海', text: 'codex接deepseekapi的话能做出这种效果吗？', likes: 351 },
      { author: '闲来无事，唯独睡眠不足', text: '之前我也有这方面的想法，可惜完全不会 blender，', likes: 17 },
    ],
  },
  {
    id: 'memory-fragment-02',
    videoId: '7655263012642622763',
    playerUrl: 'https://open.douyin.com/player/video?vid=7655263012642622763&autoplay=0',
    code: 'CH-02',
    selectorLabel: '残片 02',
    noise: '91.6%',
    comments: [
      { author: '吴呼呼hanzwoo', text: '超能陆战队', likes: 18 },
      {
        author: '团子成长课堂100集',
        text: '全网独一份了吧 用coeex操控blender做出那么好效果的？其它up基本都是空谈',
        likes: 7,
      },
      { author: '³√1/9', text: '好强的实景合成', likes: 1 },
    ],
  },
  {
    id: 'memory-fragment-03',
    videoId: '7657219695199800627',
    playerUrl: 'https://open.douyin.com/player/video?vid=7657219695199800627&autoplay=0',
    code: 'CH-03',
    selectorLabel: '残片 03',
    noise: '93.1%',
    comments: [
      { author: 'HAWEO', text: '不仅是学习…他还能24小时不停干', likes: 8 },
      { author: '575735353sdhg', text: '现在应该做的是学会如何学习', likes: 6 },
      { author: 'abstrakti', text: 'X上有人偷你视频火了，兄弟，搁那赚收益呢', likes: 4 },
    ],
  },
  {
    id: 'memory-fragment-04',
    videoId: '7666136052129697060',
    playerUrl: 'https://open.douyin.com/player/video?vid=7666136052129697060&autoplay=0',
    code: 'CH-04',
    selectorLabel: '残片 04',
    noise: '88.9%',
    comments: [
      { author: 'Alex的AI训练营（有课）', text: '放心 不会火的。你能看到就够了', likes: 2 },
      { author: 'Neuroblue', text: '这么牛逼这么点浏览量', likes: 0 },
      { author: '团子成长课堂100集', text: '这么牛怎么就不火呢🔥🔥🔥', likes: 0 },
    ],
  },
  {
    id: 'memory-fragment-05',
    videoId: '7647585532972682523',
    playerUrl: 'https://open.douyin.com/player/video?vid=7647585532972682523&autoplay=0',
    code: 'CH-05',
    selectorLabel: '残片 05',
    noise: '95.2%',
    comments: [
      { author: '高兴', text: '只用了codex+blender？还有哪些工具啊', likes: 3 },
      {
        author: '山有明露止于枝',
        text: '提示词不是核心，是你得有这个创意或者想法，能结构出来，然后才是提示词',
        likes: 3,
      },
      { author: 'Tripo AI', text: '太厉害了劳斯！', likes: 2 },
    ],
  },
  {
    id: 'memory-fragment-06',
    videoId: '7642270012888568745',
    playerUrl: 'https://open.douyin.com/player/video?vid=7642270012888568745&autoplay=0',
    code: 'CH-06',
    selectorLabel: '残片 06',
    noise: '89.7%',
    comments: [
      {
        author: '小文子的大管家',
        text: '首先你们需要有正价购买的gpt会员，仅仅是api接入的codex是无法实现的，其次是会操作codex，否则时间和金钱成本依然会持续升级',
        likes: 158,
      },
      { author: '冰块豆豆🧊', text: 'codex是真的厉害，俩小时干完我一周的活，退休了属于是', likes: 6 },
      { author: '勇猛无敌小朵朵', text: '直接调用blender？', likes: 1 },
    ],
  },
  {
    id: 'memory-fragment-07',
    videoId: '7641169512897793491',
    playerUrl: 'https://open.douyin.com/player/video?vid=7641169512897793491&autoplay=0',
    code: 'CH-07',
    selectorLabel: '残片 07',
    noise: '92.4%',
    comments: [
      {
        author: '9磅十五便士📸',
        text: '是实景拍摄了一段视频然后传到blander再用blander建模做那个液态金属的东西然后做光影然后blande导出的完整视频吗',
        likes: 45,
      },
      { author: '大帅设计', text: '用的Hunyuan3D吗？本地布置吗？还是从BlenderKit下载布置？', likes: 3 },
      { author: 'suss', text: '你用的是blender lab的官方mcp 还是github的社区blender mcp', likes: 2 },
    ],
  },
] as const

const DOUYIN_PLAYER_BASE_WIDTH = 324
const DOUYIN_PLAYER_BASE_HEIGHT = 672

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const DOUYIN_COPY: {
  label: string
  status: string
} = {
  label: '记忆残片',
  status: '7 路 9:16 竖屏信号已锁定，评论随残片同步切换',
}

export type TelevisionTransmissionProps = {
  onClose: () => void
}

export default function TelevisionTransmission({ onClose }: TelevisionTransmissionProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const [activeSignal, setActiveSignal] = useState<(typeof DOUYIN_SIGNALS)[number]>(
    DOUYIN_SIGNALS[0],
  )

  useLayoutEffect(() => {
    const screen = screenRef.current
    if (!screen) return

    const syncPlayerScale = () => {
      const { width: screenWidth, height: screenHeight } = screen.getBoundingClientRect()
      if (screenWidth <= 0 || screenHeight <= 0) return
      screen.style.setProperty(
        '--douyin-player-scale',
        String(Math.min(
          screenWidth / DOUYIN_PLAYER_BASE_WIDTH,
          screenHeight / DOUYIN_PLAYER_BASE_HEIGHT,
        )),
      )
    }

    syncPlayerScale()
    const resizeObserver = new ResizeObserver(syncPlayerScale)
    resizeObserver.observe(screen)

    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus())

    return () => {
      window.cancelAnimationFrame(focusFrame)
      previouslyFocused?.focus()
    }
  }, [])

  const handleDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [onClose])

  return (
    <section
      ref={dialogRef}
      className="television-transmission"
      role="dialog"
      aria-modal="true"
      aria-labelledby="television-transmission-title"
      aria-describedby="television-transmission-description"
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
    >
      <div className="television-transmission__void" aria-hidden="true" />
      <div className="television-transmission__noise" aria-hidden="true" />
      <div className="television-transmission__tracking" aria-hidden="true" />

      <button
        ref={closeButtonRef}
        className="television-transmission__close"
        type="button"
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
        切断信号
      </button>

      <div className="television-transmission__shell">
        <header className="television-transmission__header">
          <div>
            <p>DOUYIN VERTICAL SIGNAL / 09:16</p>
            <h1 id="television-transmission-title" data-text="失真信号接收室">
              失真信号接收室
            </h1>
          </div>
          <p id="television-transmission-description">
            七段来历不明的竖屏影像正在雪花深处重复播送。播放时，请不要凝视黑场中的倒影。
          </p>
        </header>

        <section
          className="television-transmission__receiver"
          aria-label="抖音异常竖屏信号播放器"
        >
          <div className="television-transmission__set">
            <div className="television-transmission__bezel">
              <div ref={screenRef} className="television-transmission__screen">
                <iframe
                  id="television-transmission-player"
                  key={activeSignal.videoId}
                  src={activeSignal.playerUrl}
                  title={`${DOUYIN_COPY.label} ${activeSignal.selectorLabel} 抖音竖屏播放器`}
                  width={DOUYIN_PLAYER_BASE_WIDTH}
                  height={DOUYIN_PLAYER_BASE_HEIGHT}
                  loading="lazy"
                  scrolling="no"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  referrerPolicy="unsafe-url"
                />
                <div className="television-transmission__screen-static" aria-hidden="true" />
                <div className="television-transmission__screen-scan" aria-hidden="true" />
              </div>
            </div>
            <div className="television-transmission__controls" aria-hidden="true">
              <span />
              <span />
              <span />
              <i />
            </div>
          </div>

          <aside className="television-transmission__readout" aria-live="polite">
            <span>{activeSignal.code} / VERTICAL FEED</span>
            <h2>{DOUYIN_COPY.label}</h2>
            <p>{DOUYIN_COPY.status}</p>
            <div
              className="television-transmission__fragments"
              role="group"
              aria-label="选择记忆残片"
            >
              {DOUYIN_SIGNALS.map((signal) => (
                <button
                  key={signal.id}
                  type="button"
                  aria-controls="television-transmission-player"
                  aria-pressed={signal.id === activeSignal.id}
                  onClick={() => setActiveSignal(signal)}
                >
                  <span>{signal.code}</span>
                  <strong>{signal.selectorLabel}</strong>
                </button>
              ))}
            </div>
            <section
              className="television-transmission__comments"
              aria-labelledby="television-transmission-comments-title"
            >
              <header>
                <div>
                  <span>TOP COMMENTS / PUBLIC SNAPSHOT</span>
                  <h3 id="television-transmission-comments-title">高赞评论</h3>
                </div>
                <em>2026.08.31</em>
              </header>
              <ol>
                {activeSignal.comments.map((comment) => (
                  <li key={`${activeSignal.id}-${comment.author}-${comment.text}`}>
                    <div>
                      <strong>{comment.author}</strong>
                      <span aria-label={`获赞 ${comment.likes}`}>♥ {comment.likes}</span>
                    </div>
                    <p>{comment.text}</p>
                  </li>
                ))}
              </ol>
              <p className="television-transmission__comments-note">
                抖音未登录公开页当前可见评论快照 · 不是完整评论区排名
              </p>
            </section>
          </aside>
        </section>

        <footer className="television-transmission__footer">
          <span aria-hidden="true" />
          七段抖音竖屏载波已锁定 · 播放器仅挂载当前记忆残片
        </footer>
      </div>
    </section>
  )
}
