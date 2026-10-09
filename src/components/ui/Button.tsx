'use client'
import { forwardRef } from 'react'

type Variant = 'primary' | 'ghost' | 'subtle' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  border: '1px solid transparent', borderRadius: 'var(--r-md)',
  fontFamily: 'var(--font-body)', fontWeight: 600, cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.05s',
  whiteSpace: 'nowrap', userSelect: 'none',
}

const SIZES: Record<Size, React.CSSProperties> = {
  sm: { padding: '7px 13px', fontSize: 12.5 },
  md: { padding: '9px 17px', fontSize: 13.5 },
}

const VARIANTS: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--c-violet-fill)', color: '#fff', boxShadow: 'var(--shadow-accent)' },
  ghost:   { background: 'transparent', color: 'var(--c-text-muted)', borderColor: 'var(--c-border-md)' },
  subtle:  { background: 'var(--c-bg-4)', color: 'var(--c-text)' },
  danger:  { background: 'var(--c-red-dim)', color: 'var(--c-red)' },
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', style, disabled, onMouseEnter, onMouseLeave, onFocus, onBlur, children, ...rest },
  ref,
) {
  const hover = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return
    const el = e.currentTarget
    if (variant === 'primary')      el.style.background = 'var(--c-violet-hot)'
    else if (variant === 'ghost')   { el.style.background = 'var(--c-bg-4)'; el.style.color = 'var(--c-text)' }
    else if (variant === 'subtle')  el.style.background = 'var(--c-border-md)'
    else if (variant === 'danger')  el.style.background = 'color-mix(in srgb, var(--c-red) 22%, transparent)'
  }
  const unhover = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget
    Object.assign(el.style, {
      background: (VARIANTS[variant].background as string) ?? '',
      color: (VARIANTS[variant].color as string) ?? '',
    })
  }
  return (
    <button
      ref={ref}
      disabled={disabled}
      {...rest}
      style={{
        ...BASE, ...SIZES[size], ...VARIANTS[variant],
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      onMouseEnter={(e) => { hover(e); onMouseEnter?.(e) }}
      onMouseLeave={(e) => { unhover(e); onMouseLeave?.(e) }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `${VARIANTS[variant].boxShadow ?? ''}, var(--ring)`.replace(/^, /, ''); onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = (VARIANTS[variant].boxShadow as string) ?? 'none'; onBlur?.(e) }}
    >
      {children}
    </button>
  )
})

export default Button
