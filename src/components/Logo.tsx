// The one HireKit mark. Every surface renders this, so the sign-in screen,
// the loading screen, the header, the favicon and the taskbar cannot drift
// apart — they had, into a lightning bolt, two different briefcases and a
// briefcase-with-check.
//
// Geometry matches design/icon.svg. The app icon uses a charcoal tile and a
// violet check; in-app the tile carries the brand gradient and the check is
// knocked through it. Same mark, two colourways.

interface LogoProps {
  /** Tile edge in px. The mark scales with it. */
  size?: number
  /** Mark only, no tile — for surfaces that supply their own background. */
  bare?: boolean
  className?: string
}

export default function Logo({ size = 34, bare = false, className }: LogoProps) {
  // Unique per instance: two Logos on a page would otherwise share one
  // gradient/mask id and the second would render against the first's.
  const uid = `hk-logo-${size}-${bare ? 'b' : 't'}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--c-violet)" />
          <stop offset="1" stopColor="var(--c-coral)" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect x="96" y="178" width="320" height="214" rx="30" fill="#fff" />
          <path
            d="M 194 286 L 238 330 L 322 246"
            fill="none" stroke="#000" strokeWidth="46"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </mask>
      </defs>

      {!bare && <rect width="512" height="512" rx="112" fill={`url(#${uid}-g)`} />}

      <path
        d="M 186 178 V 142 a 26 26 0 0 1 26 -26 h 88 a 26 26 0 0 1 26 26 v 36"
        fill="none" stroke={bare ? 'currentColor' : '#fff'}
        strokeWidth="30" strokeLinecap="round"
      />
      <rect
        x="96" y="178" width="320" height="214" rx="30"
        fill={bare ? 'currentColor' : '#fff'} mask={`url(#${uid}-m)`}
      />
    </svg>
  )
}
