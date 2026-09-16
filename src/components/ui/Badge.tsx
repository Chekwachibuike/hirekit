'use client'

interface BadgeProps {
  /** any accent/status token color, e.g. var(--c-violet) or a status color */
  color: string
  /** optional explicit tint background; defaults to a 14% tint of `color` */
  bg?: string
  children: React.ReactNode
  dot?: boolean
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}

/** Small status pill. Tinted background + colored text, theme-agnostic. */
export default function Badge({ color, bg, children, dot = false, size = 'md', style }: BadgeProps) {
  const pad = size === 'sm' ? '2px 8px' : '4px 10px'
  const fs  = size === 'sm' ? 10.5 : 11.5
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, borderRadius: 999,
      background: bg ?? `color-mix(in srgb, ${color} 14%, transparent)`,
      color, fontSize: fs, fontWeight: 600, lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {children}
    </span>
  )
}
