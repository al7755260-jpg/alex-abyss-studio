import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  FINAL_REVEAL_COPY,
  HIDDEN_RELICS,
} from '../../data/hiddenRelics'

const FINALE_PHASES = [
  'signal',
  'seals',
  'ingestion',
  'identity',
  'complete',
] as const

type FinalePhase = (typeof FINALE_PHASES)[number]

const PHASE_DURATION_MS: Record<Exclude<FinalePhase, 'complete'>, number> = {
  signal: 820,
  seals: 1480,
  ingestion: 1620,
  identity: 1280,
}

const PHASE_LABELS: Record<FinalePhase, string> = {
  signal: '信号接管',
  seals: '六件遗物归位',
  ingestion: '生物宿主摄取',
  identity: '认知身份重构',
  complete: '终局档案已解锁',
}

const PHASE_PROGRESS: Record<FinalePhase, number> = {
  signal: 8,
  seals: 36,
  ingestion: 68,
  identity: 92,
  complete: 100,
}

function motionPreference() {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function nextPhase(phase: FinalePhase): FinalePhase {
  const index = FINALE_PHASES.indexOf(phase)
  return FINALE_PHASES[Math.min(index + 1, FINALE_PHASES.length - 1)]
}

export function FinaleSequence({
  alreadyCompleted,
  onComplete,
  onReturn,
  onRestart,
}: {
  alreadyCompleted: boolean
  onComplete: () => void
  onReturn: () => void
  onRestart: () => void
}) {
  const [reducedMotion, setReducedMotion] = useState(motionPreference)
  const [phase, setPhase] = useState<FinalePhase>(() => (
    motionPreference() ? 'complete' : 'signal'
  ))
  const [restartArmed, setRestartArmed] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const skipButtonRef = useRef<HTMLButtonElement>(null)
  const returnButtonRef = useRef<HTMLButtonElement>(null)
  const completionSentRef = useRef(alreadyCompleted)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setReducedMotion(mediaQuery.matches)
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setPhase('complete')
      return
    }
    if (phase === 'complete') return

    const timer = window.setTimeout(
      () => setPhase(nextPhase(phase)),
      PHASE_DURATION_MS[phase],
    )
    return () => window.clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (phase !== 'complete' || completionSentRef.current) return
    completionSentRef.current = true
    onComplete()
  }, [onComplete, phase])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => {
      const target = phase === 'complete'
        ? returnButtonRef.current
        : skipButtonRef.current
      ;(target ?? dialogRef.current)?.focus({ preventScroll: true })
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onReturn()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [onReturn])

  useEffect(() => {
    if (phase !== 'complete') return
    const frame = window.requestAnimationFrame(() => {
      returnButtonRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [phase])

  useEffect(() => {
    if (!restartArmed) return
    const timer = window.setTimeout(() => setRestartArmed(false), 5_000)
    return () => window.clearTimeout(timer)
  }, [restartArmed])

  const handleRestart = () => {
    if (!restartArmed) {
      setRestartArmed(true)
      return
    }
    onRestart()
  }

  const phaseNumber = FINALE_PHASES.indexOf(phase) + 1

  return (
    <section
      ref={dialogRef}
      className={`finale finale--${phase}`}
      data-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finale-title"
      aria-describedby="finale-summary"
      tabIndex={-1}
    >
      <div className="finale__backdrop" aria-hidden="true" />
      <div className="finale__veil" aria-hidden="true" />
      <div className="finale__scan" aria-hidden="true" />
      <div className="finale__signal-flare" aria-hidden="true" />

      <div className="finale__shell">
        <header className="finale__system-bar">
          <div>
            <span>ABYSS-01 // FINAL INGESTION</span>
            <i aria-hidden="true" />
            <strong>{alreadyCompleted ? 'ARCHIVE REPLAY' : 'LIVE RECONSTRUCTION'}</strong>
          </div>
          <div className="finale__system-actions">
            <span aria-live="polite">
              {String(phaseNumber).padStart(2, '0')} / 05 · {PHASE_LABELS[phase]}
            </span>
            {phase !== 'complete' ? (
              <button
                ref={skipButtonRef}
                className="finale__skip"
                type="button"
                onClick={() => setPhase('complete')}
              >
                跳过演算
              </button>
            ) : null}
          </div>
        </header>

        <div className="finale__primary">
          <section className="finale__identity" aria-label="摄取对象身份">
            <p className="finale__eyebrow">深渊协议 // 终局档案</p>
            <h2 id="finale-title">{FINAL_REVEAL_COPY.title}</h2>
            <div className="finale__process">
              <span>当前进程 / CURRENT PROCESS</span>
              <strong>ALEXLI.echo</strong>
            </div>
            <div className="finale__timestamp">
              <span>摄取完成时间</span>
              <time dateTime="03:17:49">03:17:49</time>
            </div>
          </section>

          <div className="finale__core" aria-hidden="true">
            <div className="finale__seal-orbit">
              <i className="finale__orbit-ring finale__orbit-ring--outer" />
              <i className="finale__orbit-ring finale__orbit-ring--inner" />
              {HIDDEN_RELICS.map((relic, index) => (
                <span
                  key={relic.id}
                  className="finale__seal"
                  style={{
                    '--seal-angle': `${index * 60}deg`,
                    '--seal-angle-reverse': `${index * -60}deg`,
                    '--seal-delay': `${index * 105}ms`,
                    '--seal-accent': relic.accent,
                  } as CSSProperties}
                >
                  <b>{relic.glyph}</b>
                </span>
              ))}
              <div className="finale__eye-lock">
                <span>6 / 6</span>
                <strong>HOST LOCKED</strong>
              </div>
            </div>
            <div className="finale__ingestion-beam" />
          </div>

          <aside className="finale__terminal" aria-label="最终摄取取证终端">
            <div className="finale__terminal-heading">
              <span>FORENSIC TERMINAL</span>
              <i aria-hidden="true" />
              <strong>REC 03:17:49</strong>
            </div>
            <p>ABYSS-01 // FINAL INGESTION REPORT</p>
            <div className="finale__terminal-lines">
              {FINAL_REVEAL_COPY.terminal.map((line, index) => (
                <code
                  key={line}
                  style={{ '--terminal-index': index } as CSSProperties}
                >
                  {line}
                </code>
              ))}
            </div>
            <div className="finale__terminal-trace" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </aside>
        </div>

        <section className="finale__truth" id="finale-summary" aria-label="终局真相">
          <div className="finale__truth-heading">
            <span>TRUTH LAYER // 03</span>
            <strong>吞噬链路复原</strong>
          </div>
          <div className="finale__truth-grid">
            {FINAL_REVEAL_COPY.paragraphs.map((paragraph, index) => (
              <article
                key={paragraph}
                className="finale__truth-card"
                style={{ '--truth-index': index } as CSSProperties}
              >
                <span>证据层 0{index + 1}</span>
                <p>{paragraph}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="finale__footer">
          <div className="finale__completion">
            <span>{phase === 'complete' ? FINAL_REVEAL_COPY.success : PHASE_LABELS[phase]}</span>
            <strong>{phase === 'complete' ? FINAL_REVEAL_COPY.finalLine : 'RECONSTRUCTING ALEXLI.echo'}</strong>
          </div>

          {phase === 'complete' ? (
            <>
              <button
                ref={returnButtonRef}
                className="finale__return"
                type="button"
                onClick={onReturn}
              >
                <span>返回书房查看档案</span>
                <i aria-hidden="true">↵</i>
              </button>
              <button
                className={`finale__restart ${restartArmed ? 'finale__restart--armed' : ''}`}
                type="button"
                onClick={handleRestart}
                aria-label={restartArmed ? '确认清空全部进度并重新开始' : '重置游戏'}
              >
                <span>{restartArmed ? '确认重置' : '重置游戏'}</span>
                <small>{restartArmed ? '再次点击，清空全部档案' : '从 0 / 6 重新开始'}</small>
              </button>
            </>
          ) : (
            <div
              className="finale__progress"
              role="progressbar"
              aria-label="终局演算进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={PHASE_PROGRESS[phase]}
            >
              <span style={{ '--progress': `${PHASE_PROGRESS[phase]}%` } as CSSProperties} />
            </div>
          )}
        </footer>
      </div>
    </section>
  )
}
