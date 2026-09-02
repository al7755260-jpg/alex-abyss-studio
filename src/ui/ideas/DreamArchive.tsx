import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  DEFAULT_DREAM_IDEA_ID,
  DREAM_IDEA_BY_ID,
  DREAM_IDEAS,
  type DreamIdeaId,
} from '../../data/dreamIdeas'
import { CloseIcon } from '../game/GameIcons'
import './DreamArchive.css'

const SAVED_IDEAS_STORAGE_KEY = 'alex-abyss-studio:saved-dream-ideas:v1'
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')
const VALID_DREAM_IDEA_IDS = new Set<string>(DREAM_IDEAS.map(({ id }) => id))

type DreamArchiveProps = {
  onClose: () => void
}

function readSavedIdeaIds(): DreamIdeaId[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SAVED_IDEAS_STORAGE_KEY) ?? '[]') as unknown
    return Array.isArray(stored)
      ? stored.filter((id): id is DreamIdeaId => typeof id === 'string' && VALID_DREAM_IDEA_IDS.has(id))
      : []
  } catch {
    return []
  }
}

function DreamArchive({ onClose }: DreamArchiveProps) {
  const [selectedIdeaId, setSelectedIdeaId] = useState<DreamIdeaId>(DEFAULT_DREAM_IDEA_ID)
  const [deepDiveOpen, setDeepDiveOpen] = useState(false)
  const [savedIdeaIds, setSavedIdeaIds] = useState<readonly DreamIdeaId[]>(readSavedIdeaIds)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const activeIdea = DREAM_IDEA_BY_ID.get(selectedIdeaId) ?? DREAM_IDEAS[0]
  const activeSaved = savedIdeaIds.includes(activeIdea.id)

  const closeArchive = useCallback(() => {
    onClose()
  }, [onClose])

  const closeOrStepBack = useCallback(() => {
    if (deepDiveOpen) {
      setDeepDiveOpen(false)
      return
    }
    onClose()
  }, [deepDiveOpen, onClose])

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
      closeOrStepBack()
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
  }, [closeOrStepBack])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - bounds.left) / bounds.width) * 100
    const y = ((event.clientY - bounds.top) / bounds.height) * 100
    event.currentTarget.style.setProperty('--dream-x', `${x.toFixed(2)}%`)
    event.currentTarget.style.setProperty('--dream-y', `${y.toFixed(2)}%`)
  }, [])

  const resetPointerLight = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty('--dream-x', '56%')
    event.currentTarget.style.setProperty('--dream-y', '42%')
  }, [])

  const selectIdea = useCallback((ideaId: DreamIdeaId) => {
    setSelectedIdeaId(ideaId)
    setDeepDiveOpen(false)
  }, [])

  const toggleSavedIdea = useCallback(() => {
    setSavedIdeaIds((current) => {
      const next = current.includes(activeIdea.id)
        ? current.filter((ideaId) => ideaId !== activeIdea.id)
        : [...current, activeIdea.id]
      try {
        window.localStorage.setItem(SAVED_IDEAS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // The archive remains usable when private browsing blocks persistence.
      }
      return next
    })
  }, [activeIdea.id])

  return (
    <section
      ref={dialogRef}
      className={`dream-archive${deepDiveOpen ? ' dream-archive--deep' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dream-archive-title"
      aria-describedby="dream-archive-description"
      tabIndex={-1}
      data-idea={activeIdea.id}
      style={{ '--dream-accent': activeIdea.accent } as CSSProperties}
      onKeyDown={handleDialogKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointerLight}
    >
      <div className="dream-archive__backdrop" aria-hidden="true" />
      <div className="dream-archive__grain" aria-hidden="true" />
      <div className="dream-archive__cursor-light" aria-hidden="true" />

      <button
        ref={closeButtonRef}
        className="dream-archive__close"
        type="button"
        onClick={closeArchive}
      >
        <CloseIcon />
        <span>返回工作室</span>
      </button>

      <div className="dream-archive__shell">
        <aside className="dream-archive__library" aria-label="奇思妙想目录">
          <header className="dream-archive__heading">
            <h1 id="dream-archive-title">我的奇思妙想</h1>
            <p id="dream-archive-description">那些没有被现实驯服的念头，都藏在这里</p>
            <span>DREAM INDEX / 私人梦境档案</span>
          </header>

          <div className="dream-archive__chapters" role="tablist" aria-orientation="vertical">
            {DREAM_IDEAS.map((idea) => {
              const selected = idea.id === activeIdea.id
              return (
                <button
                  id={`dream-tab-${idea.id}`}
                  key={idea.id}
                  className={`dream-chapter${selected ? ' dream-chapter--selected' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="dream-idea-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectIdea(idea.id)}
                >
                  <span>{String(idea.order).padStart(2, '0')}</span>
                  <strong>{idea.shortTitle}</strong>
                  <i aria-hidden="true" />
                </button>
              )
            })}
          </div>

          <p className="dream-archive__library-note">
            悬停书脊，让红线牵引记忆。每个念头都只是一个还没拍完的梦。
          </p>
        </aside>

        <svg
          className="dream-archive__thread"
          viewBox="0 0 640 250"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M8 112 C 126 78, 206 210, 314 148 S 492 42, 632 124" />
          <path className="dream-archive__thread-glow" d="M8 112 C 126 78, 206 210, 314 148 S 492 42, 632 124" />
        </svg>

        <article
          id="dream-idea-panel"
          className="dream-archive__folio"
          role="tabpanel"
          aria-labelledby={`dream-tab-${activeIdea.id}`}
          tabIndex={0}
        >
          <div className="dream-archive__visual" aria-hidden="true">
            <span className="dream-archive__iris" />
            <span className="dream-archive__manuscript dream-archive__manuscript--one" />
            <span className="dream-archive__manuscript dream-archive__manuscript--two" />
          </div>

          <header className="dream-archive__idea-heading" key={`heading-${activeIdea.id}`}>
            <p>{String(activeIdea.order).padStart(2, '0')} / DREAM FRAGMENT</p>
            <h2>{activeIdea.title}</h2>
            <span>{activeIdea.summary}</span>
          </header>

          <dl className="dream-archive__recipe" key={`recipe-${activeIdea.id}`}>
            <div>
              <dt>现实锚点</dt>
              <dd>{activeIdea.anchor}</dd>
            </div>
            <div>
              <dt>梦境偏移</dt>
              <dd>{activeIdea.shift}</dd>
            </div>
            <div>
              <dt>镜头语法</dt>
              <dd>{activeIdea.grammar}</dd>
            </div>
          </dl>

          <button
            className="dream-archive__enter"
            type="button"
            aria-expanded={deepDiveOpen}
            aria-controls="dream-deep-dive"
            onClick={() => setDeepDiveOpen(true)}
          >
            <span>进入这场梦</span>
            <i aria-hidden="true">↗</i>
          </button>

          {deepDiveOpen ? (
            <section id="dream-deep-dive" className="dream-deep-dive" aria-label={`${activeIdea.title}创作手记`}>
              <header>
                <div>
                  <span>12 秒发生了什么</span>
                  <h3>{activeIdea.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeepDiveOpen(false)}
                >
                  退回梦外
                </button>
              </header>

              <ol className="dream-deep-dive__timeline">
                {activeIdea.beats.map((beat) => (
                  <li key={beat.time}>
                    <time>{beat.time}</time>
                    <div>
                      <strong>{beat.title}</strong>
                      <p>{beat.description}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="dream-deep-dive__making">
                <div>
                  <span>让它成形</span>
                  <ol>
                    {activeIdea.production.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                </div>
                <blockquote>
                  <span>提示词种子</span>
                  <p>{activeIdea.promptSeed}</p>
                </blockquote>
              </div>

              <button
                className={`dream-deep-dive__save${activeSaved ? ' dream-deep-dive__save--active' : ''}`}
                type="button"
                aria-pressed={activeSaved}
                onClick={toggleSavedIdea}
              >
                <span aria-hidden="true">{activeSaved ? '◈' : '◇'}</span>
                {activeSaved ? '已封存在梦瓶' : '收进梦瓶'}
              </button>
              <p className="dream-deep-dive__status" aria-live="polite">
                {activeSaved ? '这个念头会在你下次进入书架时继续发光。' : ''}
              </p>
            </section>
          ) : null}
        </article>
      </div>

      <p className="dream-archive__hint">
        <span aria-hidden="true" />
        鼠标点击选择 · Esc 返回上一层 · Tab 切换控件
      </p>
    </section>
  )
}

export default DreamArchive
