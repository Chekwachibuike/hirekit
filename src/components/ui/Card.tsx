'use client'
import { forwardRef } from 'react'

type Elevation = 'flat' | 'sm' | 'md' | 'lg'

const SHADOW: Record<Elevation, string> = {
  flat: 'none',
  sm:   'var(--shadow-sm)',
  md:   'var(--shadow-md)',
  lg:   'var(--shadow-lg)',
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
  /** raise + accent border on hover */
  interactive?: boolean
  surface?: 'surface' | 'surface-2'
  pad?: number | string
}

/**
 * The single source of truth for a "card" surface: theme-aware background,
 * hairline border and soft elevation. Replaces the flat, shadowless boxes
 * that made every page read as gray-on-gray.
 */
const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { elevation = 'sm', interactive = false, surface = 'surface', pad, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      style={{
        background: surface === 'surface-2' ? 'var(--c-surface-2)' : 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)',
        boxShadow: SHADOW[elevation],
        padding: pad,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
        ...style,
      }}
      onMouseEnter={interactive ? (e) => {
        const el = e.currentTarget
        el.style.boxShadow = 'var(--shadow-lg)'
        el.style.borderColor = 'var(--c-border-hot)'
        el.style.transform = 'translateY(-2px)'
        rest.onMouseEnter?.(e)
      } : rest.onMouseEnter}
      onMouseLeave={interactive ? (e) => {
        const el = e.currentTarget
        el.style.boxShadow = SHADOW[elevation]
        el.style.borderColor = 'var(--c-border)'
        el.style.transform = 'translateY(0)'
        rest.onMouseLeave?.(e)
      } : rest.onMouseLeave}
    >
      {children}
    </div>
  )
})

export default Card
