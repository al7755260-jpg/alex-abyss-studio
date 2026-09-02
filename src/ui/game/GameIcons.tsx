type IconProps = {
  className?: string
}

export function AbyssMark({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 44 44" aria-hidden="true">
      <path d="M4 22c4.8-8 10.8-12 18-12s13.2 4 18 12c-4.8 8-10.8 12-18 12S8.8 30 4 22Z" />
      <circle cx="22" cy="22" r="6.2" />
      <path d="M22 2v7M22 35v7M2 22h4M38 22h4" />
    </svg>
  )
}

export function ResetIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.7 8.3A8 8 0 1 1 4 13" />
      <path d="M4.7 3.8v4.5h4.5" />
    </svg>
  )
}

export function ChevronIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 9.75 4.5-4.5 4.5 4.5" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 4 12 12M16 4 4 16" />
    </svg>
  )
}

export function EyeRuneIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M6 32c7-11 15.7-16.5 26-16.5S51 21 58 32c-7 11-15.7 16.5-26 16.5S13 43 6 32Z" />
      <circle cx="32" cy="32" r="9.5" />
      <path d="M32 22.5v19M13 20l6 5M51 20l-6 5" />
    </svg>
  )
}

export function MatrixRuneIcon({ className }: IconProps) {
  const dots = [18, 26, 34, 42]
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="2" />
      {dots.flatMap((x) =>
        dots.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />),
      )}
      <path d="M16 48h32" />
    </svg>
  )
}

export function FlameRuneIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 7c4 9-1 13 5 20 4.5 5 9 9 9 16a14 14 0 0 1-28 0c0-7 4-12 9-17 4-4 3-11 5-19Z" />
      <path d="M32 31c4 5 7 8 7 13a7 7 0 0 1-14 0c0-4 3-8 7-13Z" />
      <path d="M15 55h34" />
    </svg>
  )
}

export function KeyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="19" cy="21" r="10" />
      <path d="m26 28 25 25M39 41l7-7M45 47l7-7" />
    </svg>
  )
}

export function LensIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="21" />
      <circle cx="32" cy="32" r="14" />
      <path d="M32 8v8M32 48v8M8 32h8M48 32h8" />
    </svg>
  )
}

export function AbyssKeyIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M12 20c7-10 17-10 24 0-7 10-17 10-24 0Z" />
      <circle cx="24" cy="20" r="4" />
      <path d="m31 27 21 21M40 36l7-7M46 42l7-7M9 53c8-8 18-8 26 0" />
    </svg>
  )
}

export function EmptySigilIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="20" />
      <path d="M32 12v40M12 32h40M18 18l28 28M46 18 18 46" />
    </svg>
  )
}

export function HeartEyeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 53S10 41 10 24c0-8 10-12 16-5l6 7 6-7c6-7 16-3 16 5 0 17-22 29-22 29Z" />
      <path d="M18 32h8l4-8 5 16 4-8h7" />
    </svg>
  )
}
