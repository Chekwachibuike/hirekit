'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { Bell, BriefcaseBusiness, CalendarClock, AlarmClock, Clock, X, Check } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import type { CalendarEvent } from '@/lib/supabase'
import {
  buildNotifications, readDismissed, writeDismissed,
  type AppNotification, type ApplicationRow,
} from '@/lib/notifications'

const KEY = 'notification-sources'

async function fetchSources(): Promise<{ events: CalendarEvent[]; applications: ApplicationRow[] }> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { events: [], applications: [] }

  const [ev, ap] = await Promise.all([
    supabase.from('calendar_events').select('*'),
    supabase.from('job_applications').select('id,company,role,status,applied_date'),
  ])
  return { events: ev.data ?? [], applications: ap.data ?? [] }
}

const ICONS: Record<AppNotification['kind'], React.ElementType> = {
  interview: BriefcaseBusiness,
  deadline: AlarmClock,
  event: CalendarClock,
  'follow-up': Clock,
}

export default function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const wrapRef = useRef<HTMLDivElement>(null)

  // localStorage is not available during SSR, so read it after mount.
  useEffect(() => { setDismissed(readDismissed()) }, [])

  const { data } = useSWR(KEY, fetchSources, { refreshInterval: 5 * 60 * 1000 })

  const items = useMemo(() => {
    if (!data) return []
    return buildNotifications(data.events, data.applications)
      .filter(n => !dismissed.has(n.id))
  }, [data, dismissed])

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev).add(id)
      writeDismissed(next)
      return next
    })
  }, [])

  const dismissAll = useCallback(() => {
    setDismissed(prev => {
      const next = new Set(prev)
      items.forEach(i => next.add(i.id))
      writeDismissed(next)
      return next
    })
  }, [items])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const urgent = items.some(i => i.urgent)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={items.length ? `Notifications (${items.length})` : 'Notifications'}
        aria-expanded={open}
        title={items.length ? `${items.length} need${items.length === 1 ? 's' : ''} attention` : 'Nothing needs attention'}
        style={{
          width: 36, height: 36, borderRadius: 'var(--r-md)',
          background: open ? 'var(--c-chrome-hover)' : 'transparent',
          border: '1px solid var(--c-chrome-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--c-chrome-muted)',
          transition: 'all 0.15s', position: 'relative',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-chrome-hover)'; e.currentTarget.style.color = 'var(--c-chrome-text)' }}
        onMouseLeave={e => { e.currentTarget.style.background = open ? 'var(--c-chrome-hover)' : 'transparent'; e.currentTarget.style.color = 'var(--c-chrome-muted)' }}
      >
        <Bell size={15} />
        {/* Only when there is genuinely something — the old dot was hardcoded
            and permanently lit, which made it meaningless. */}
        {items.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
            padding: '0 4px', borderRadius: 999,
            background: urgent ? 'var(--c-red)' : 'var(--c-coral)',
            border: '2px solid var(--c-chrome)',
            color: '#fff', fontSize: 9.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>{items.length > 9 ? '9+' : items.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 340, maxHeight: 420,
          overflowY: 'auto', zIndex: 200,
          background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.22))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: '1px solid var(--c-border)',
            position: 'sticky', top: 0, background: 'var(--c-bg-3)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)' }}>
              Needs attention
            </span>
            {items.length > 0 && (
              <button onClick={dismissAll} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11.5, color: 'var(--c-text-muted)', fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Check size={12} /> Clear all
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '26px 16px', textAlign: 'center' }}>
              <p style={{ fontSize: 12.5, color: 'var(--c-text-muted)' }}>
                Nothing needs attention.
              </p>
              <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginTop: 6, lineHeight: 1.5 }}>
                Interviews, deadlines and stale applications show up here.
              </p>
            </div>
          ) : items.map(n => {
            const Icon = ICONS[n.kind]
            return (
              <div key={n.id} style={{
                display: 'flex', gap: 10, padding: '11px 14px',
                borderBottom: '1px solid var(--c-border)', alignItems: 'flex-start',
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 'var(--r-sm)', flexShrink: 0,
                  background: n.urgent ? 'var(--c-red-dim)' : 'var(--c-bg-4)',
                  color: n.urgent ? 'var(--c-red)' : 'var(--c-text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={13} />
                </span>

                <button
                  onClick={() => { setOpen(false); router.push(n.href) }}
                  style={{
                    flex: 1, textAlign: 'left', background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.35 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 2, lineHeight: 1.45 }}>
                    {n.detail}
                  </div>
                </button>

                <button
                  aria-label={`Dismiss ${n.title}`}
                  onClick={() => dismiss(n.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--c-text-dim)', padding: 2, flexShrink: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
