export function EditLayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3" />
      <path d="M8 12h8M12 8v8" />
      <path d="m14.5 9.5 2-2M14.5 14.5l2 2M9.5 14.5l-2 2M9.5 9.5l-2-2" />
    </svg>
  )
}

/** The public viewer does not download the full composer until it is opened. */
export function StudioEditorLauncher({
  onOpen,
  loading = false,
}: {
  onOpen: () => void
  loading?: boolean
}) {
  return (
    <div className="studio-editor">
      <button
        className="studio-editor__toggle"
        type="button"
        aria-pressed={false}
        aria-expanded={false}
        aria-busy={loading}
        disabled={loading}
        onClick={onOpen}
      >
        <EditLayoutIcon />
        {loading ? '正在打开编辑器…' : '编辑画面'}
      </button>
    </div>
  )
}
