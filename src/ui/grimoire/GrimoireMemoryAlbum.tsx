import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { ChevronIcon, CloseIcon } from '../game/GameIcons'
import './GrimoireMemoryAlbum.css'

const MEMORY_ASSET_ROOT = `${import.meta.env.BASE_URL}images/grimoire-memories`

const MEMORY_PAGES = [
  {
    id: 'water',
    src: `${MEMORY_ASSET_ROOT}/memory-01-water.jpg`,
    title: '水幕留影',
    alt: '三位同行者在水上游乐设施中的合影',
    objectPosition: '50% 53%',
  },
  {
    id: 'rain',
    src: `${MEMORY_ASSET_ROOT}/memory-02-rain.jpg`,
    title: '雨衣与笑意',
    alt: '三位同行者穿着雨衣乘坐游乐设施的合影',
    objectPosition: '50% 55%',
  },
  {
    id: 'city',
    src: `${MEMORY_ASSET_ROOT}/memory-03-city.jpg`,
    title: '晴空旧墙',
    alt: '三位同行者在历史建筑前的合影',
    objectPosition: '50% 58%',
  },
] as const

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type GrimoireMemoryAlbumProps = {
  onClose: () => void
}

function wrapPage(index: number) {
  return (index + MEMORY_PAGES.length) % MEMORY_PAGES.length
}

export default function GrimoireMemoryAlbum({ onClose }: GrimoireMemoryAlbumProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const activePage = MEMORY_PAGES[pageIndex]

  const showPage = useCallback((index: number) => {
    setPageIndex(wrapPage(index))
  }, [])

  const showPreviousPage = useCallback(() => {
    setPageIndex((current) => wrapPage(current - 1))
  }, [])

  const showNextPage = useCallback(() => {
    setPageIndex((current) => wrapPage(current + 1))
  }, [])

  useLayoutEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus({ preventScroll: true })
    return () => {
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    const hasModifier = event.altKey || event.ctrlKey || event.metaKey
    if (!hasModifier && event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      showPreviousPage()
      return
    }
    if (!hasModifier && event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      showNextPage()
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
    const focused = document.activeElement
    if (event.shiftKey && (focused === first || focused === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && focused === last) {
      event.preventDefault()
      first.focus()
    }
  }, [onClose, showNextPage, showPreviousPage])

  return (
    <section
      ref={dialogRef}
      className="grimoire-memory"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grimoire-memory-title"
      aria-describedby="grimoire-memory-description"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="grimoire-memory__veil" aria-hidden="true" />

      <article className="grimoire-memory__book">
        <div className="grimoire-memory__book-light" aria-hidden="true" />

        <button
          ref={closeButtonRef}
          className="grimoire-memory__close"
          type="button"
          onClick={onClose}
          aria-label="关闭失落相册"
        >
          <CloseIcon />
        </button>

        <section className="grimoire-memory__left-page" aria-label="旧日影像目录">
          <header className="grimoire-memory__heading">
            <span>ABYSSAL MEMORY ARCHIVE</span>
            <h1 id="grimoire-memory-title">失落相册</h1>
            <p id="grimoire-memory-description">被旧书封存的三页影像</p>
          </header>

          <nav className="grimoire-memory__chapters" aria-label="选择相册页面">
            {MEMORY_PAGES.map((page, index) => (
              <button
                key={page.id}
                type="button"
                aria-label={`查看第 ${index + 1} 页：${page.title}`}
                aria-pressed={pageIndex === index}
                onClick={() => showPage(index)}
              >
                <img
                  src={page.src}
                  alt=""
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{ objectPosition: page.objectPosition }}
                />
                <span>0{index + 1}</span>
                <strong>{page.title}</strong>
              </button>
            ))}
          </nav>

          <p className="grimoire-memory__folio-mark" aria-hidden="true">
            MEMORIAE / III
          </p>
        </section>

        <figure
          key={activePage.id}
          className="grimoire-memory__right-page"
          aria-live="polite"
        >
          <div className="grimoire-memory__photo-mat">
            <img
              className="grimoire-memory__photo"
              src={activePage.src}
              alt={activePage.alt}
              draggable="false"
              decoding="async"
              style={{ objectPosition: activePage.objectPosition }}
            />
            <span className="grimoire-memory__photo-wear" aria-hidden="true" />
          </div>
          <figcaption>
            <span>PAGE 0{pageIndex + 1} / 03</span>
            <strong>{activePage.title}</strong>
            <small>旧日影像 · 深渊留存</small>
          </figcaption>
        </figure>

        <button
          className="grimoire-memory__turn grimoire-memory__turn--previous"
          type="button"
          onClick={showPreviousPage}
          aria-label="上一页照片"
        >
          <ChevronIcon />
        </button>
        <button
          className="grimoire-memory__turn grimoire-memory__turn--next"
          type="button"
          onClick={showNextPage}
          aria-label="下一页照片"
        >
          <ChevronIcon />
        </button>

        <div className="grimoire-memory__page-dots" aria-hidden="true">
          {MEMORY_PAGES.map((page, index) => (
            <i key={page.id} data-active={pageIndex === index || undefined} />
          ))}
        </div>
      </article>
    </section>
  )
}
