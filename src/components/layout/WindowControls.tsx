'use client'
import { useEffect, useState, useCallback } from 'react'

// Minimise / maximise / close, drawn by the app because the desktop shell
// removes the OS caption (see desktop/hirekit.c). Renders only inside that
// shell — a browser tab must not show a close button.
declare global {
  interface Window {
    __HIREKIT_DESKTOP__?: boolean
    hk_drag?: () => Promise<void>
    hk_minimize?: () => Promise<void>
    hk_maximize?: () => Promise<boolean>
    hk_close?: () => Promise<void>
    hk_isMaximized?: () => Promise<boolean>
  }
}

export function useIsDesktopShell() {
  const [inShell, setInShell] = useState(false)
  useEffect(() => { setInShell(window.__HIREKIT_DESKTOP__ === true) }, [])
  return inShell
}

// Glyphs are drawn rather than imported so they sit on the exact half-pixel
// grid Windows uses: a 10px box with 1px strokes stays crisp, where an icon
// font rounds and looks soft next to the real system buttons.
const stroke = { stroke: 'currentColor', strokeWidth: 1, fill: 'none', shapeRendering: 'crispEdges' as const }

function Minimise() {
  return <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5 H10" {...stroke} /></svg>
}
function Maximise({ maximized }: { maximized: boolean }) {
  return maximized
    ? (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" {...stroke} />
        <rect x="0.5" y="2.5" width="7" height="7" {...stroke} />
      </svg>
    )
    : <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" {...stroke} /></svg>
}
function Close() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
    </svg>
  )
}

export default function WindowControls() {
  const inShell = useIsDesktopShell()
  const [maximized, setMaximized] = useState(false)

  const refresh = useCallback(() => {
    window.hk_isMaximized?.().then(setMaximized).catch(() => {})
  }, [])

  useEffect(() => {
    if (!inShell) return
    refresh()
    // Snap layouts and double-click-to-maximise change this without the
    // buttons being touched, so track the resize too.
    window.addEventListener('resize', refresh)
    return () => window.removeEventListener('resize', refresh)
  }, [inShell, refresh])

  if (!inShell) return null

  // 46x32 matches the Windows 11 caption button footprint, so the row reads
  // as system chrome rather than app buttons that happen to be top-right.
  const btn: React.CSSProperties = {
    width: 46, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
    color: 'var(--c-chrome-muted)', transition: 'background 0.12s, color 0.12s',
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties

  const hover = (c: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = c
    e.currentTarget.style.color = c === 'var(--c-red)' ? '#fff' : 'var(--c-chrome-text)'
  }
  const out = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--c-chrome-muted)'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 6, marginRight: -18, alignSelf: 'stretch' }}>
      <button aria-label="Minimise" title="Minimise" style={btn}
        onClick={() => window.hk_minimize?.()}
        onMouseEnter={hover('var(--c-chrome-hover)')} onMouseLeave={out}>
        <Minimise />
      </button>
      <button aria-label={maximized ? 'Restore' : 'Maximise'} title={maximized ? 'Restore' : 'Maximise'} style={btn}
        onClick={() => window.hk_maximize?.().then(setMaximized).catch(() => {})}
        onMouseEnter={hover('var(--c-chrome-hover)')} onMouseLeave={out}>
        <Maximise maximized={maximized} />
      </button>
      <button aria-label="Close" title="Close" style={btn}
        onClick={() => window.hk_close?.()}
        onMouseEnter={hover('var(--c-red)')} onMouseLeave={out}>
        <Close />
      </button>
    </div>
  )
}
