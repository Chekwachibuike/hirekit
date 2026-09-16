// src/lib/mock.ts — shared UI config (not actual mock data; pages are wired to Supabase)

export const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: '#7C5CFC', bg: 'rgba(124,92,252,0.10)'  },
  applied:   { label: 'Applied',   color: '#00A885', bg: 'rgba(0,168,133,0.10)'   },
  interview: { label: 'Interview', color: '#D4A017', bg: 'rgba(212,160,23,0.10)'  },
  offer:     { label: 'Offer',     color: '#1FAF6E', bg: 'rgba(31,175,110,0.10)'  },
  rejected:  { label: 'Rejected',  color: '#E03255', bg: 'rgba(224,50,85,0.10)'   },
  ghosted:   { label: 'Ghosted',   color: '#888',    bg: 'rgba(100,100,100,0.08)' },
} as const
