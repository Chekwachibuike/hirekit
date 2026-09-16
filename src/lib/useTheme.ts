'use client'
import { useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'
const STORAGE_KEY = 'hirekit-theme'

// Kept in sync with the blocking inline script in layout.tsx.
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

function apply(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolve(mode)
}

/**
 * Persisted light / dark / auto theme.
 * `auto` follows the OS and re-resolves live when the OS preference flips.
 * The document attribute is set pre-paint by the inline script in layout.tsx,
 * so mounting here never causes a flash.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('auto')

  // Hydrate from storage after mount (localStorage is client-only).
  useEffect(() => {
    const stored = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null) as ThemeMode | null
    if (stored === 'light' || stored === 'dark' || stored === 'auto') setMode(stored)
  }, [])

  // Re-resolve when in auto mode and the OS preference changes.
  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
    apply(next)
  }, [])

  const cycle = useCallback(() => {
    setTheme(mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto')
  }, [mode, setTheme])

  return { mode, resolved: resolve(mode), setTheme, cycle }
}
