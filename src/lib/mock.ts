// src/lib/mock.ts — shared UI config (not actual mock data; pages are wired to Supabase)

// Theme tokens, not hexes: the *-text shades stay readable on the 14% tint
// that pills and avatars draw behind them, in both themes.
export const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'var(--c-violet)',     bg: 'color-mix(in srgb, var(--c-violet) 10%, transparent)' },
  applied:   { label: 'Applied',   color: 'var(--c-teal-text)',  bg: 'color-mix(in srgb, var(--c-teal-text) 10%, transparent)' },
  interview: { label: 'Interview', color: 'var(--c-gold-text)',  bg: 'color-mix(in srgb, var(--c-gold-text) 10%, transparent)' },
  offer:     { label: 'Offer',     color: 'var(--c-green-text)', bg: 'color-mix(in srgb, var(--c-green-text) 10%, transparent)' },
  rejected:  { label: 'Rejected',  color: 'var(--c-red-text)',   bg: 'color-mix(in srgb, var(--c-red-text) 10%, transparent)' },
  ghosted:   { label: 'Ghosted',   color: 'var(--c-text-muted)', bg: 'color-mix(in srgb, var(--c-text-muted) 10%, transparent)' },
} as const
