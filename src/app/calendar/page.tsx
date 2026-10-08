'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import {
  ChevronLeft, ChevronRight, Plus, X, Loader2, Trash2, Clock,
  Calendar as CalendarIcon, Edit2, Link2, Unlink, Check, AlertCircle,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { fetcher } from '@/lib/fetcher'
import type { CalendarEvent } from '@/lib/supabase'
import {
  toISO, todayISO as today, expandRecurrence,
  buildRRule, parseRRule, REPEAT_OPTIONS, type RepeatKey,
} from '@/lib/recurrence'

const CALENDAR_KEY = 'calendar-events'
const GOOGLE_STATUS_KEY = '/api/calendar/google/status'

async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []
  const { data } = await supabase.from('calendar_events').select('*').order('date')
  return data ?? []
}

// ── Config ──────────────────────────────────────────────────
const TYPE_CONFIG = {
  interview:  { label: 'Interview',   color: '#7C5CFC', bg: 'rgba(124,92,252,0.12)' },
  deadline:   { label: 'Deadline',    color: '#E03255', bg: 'rgba(224,50,85,0.12)'  },
  study:      { label: 'Study',       color: '#00A885', bg: 'rgba(0,168,133,0.12)'  },
  follow_up:  { label: 'Follow-up',   color: '#D4A017', bg: 'rgba(212,160,23,0.12)' },
  other:      { label: 'Other',       color: '#6b7280', bg: 'rgba(107,114,128,0.12)'},
} as const

type EventType = keyof typeof TYPE_CONFIG
type View = 'month' | 'week'

// Shape returned by /api/calendar/google/events
interface GoogleFeedEvent {
  googleId: string
  title: string
  date: string
  time: string | null
  notes: string | null
  htmlLink: string | null
}

// A HireKit event, or one read from Google. `source` marks the latter: those
// live only in Google, are not in our database, and cannot be edited here.
type DisplayEvent = CalendarEvent & {
  source?: 'google'
  htmlLink?: string | null
  /** Set on expanded repeats of a recurring event — a React key only. The
   *  `id` stays the master's, so editing an occurrence edits the series. */
  instanceKey?: string
}

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const HOURS  = Array.from({ length: 16 }, (_, i) => i + 6) // 6am – 9pm

// Delivery is Google's, not ours: a reminder set here fires on the user's
// phone and desktop whether or not HireKit is running. '' means inherit the
// calendar's own default; -1 means explicitly none.
const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: '',     label: 'Default (from Google)' },
  { value: '-1',   label: 'No reminder' },
  { value: '0',    label: 'At time of event' },
  { value: '10',   label: '10 minutes before' },
  { value: '30',   label: '30 minutes before' },
  { value: '60',   label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

// ── Helpers ──────────────────────────────────────────────────
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const cells: Date[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push(new Date(year, month, -first.getDay() + i + 1))
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(new Date(year, month + 1, cells.length - last.getDate() - first.getDay() + 1))
  return cells
}

function buildWeekDays(anchor: Date): Date[] {
  const dow = anchor.getDay()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor)
    d.setDate(anchor.getDate() - dow + i)
    return d
  })
}

// ── Event Modal ───────────────────────────────────────────────
function EventModal({
  initial, onClose, onSave, onDelete, saving, deleting,
}: {
  initial: { date: string; event?: CalendarEvent }
  onClose: () => void
  onSave: (f: Omit<CalendarEvent, 'id' | 'created_at'>) => void
  onDelete?: () => void
  saving: boolean
  deleting: boolean
}) {
  const ev = initial.event
  const initialRepeat = parseRRule(ev?.recurrence)
  const [form, setForm] = useState({
    title: ev?.title ?? '',
    type: (ev?.type ?? 'other') as EventType,
    date: ev?.date ?? initial.date,
    time: ev?.time ?? '',
    notes: ev?.notes ?? '',
    repeat: initialRepeat.key,
    repeatUntil: initialRepeat.until,
    reminder: ev?.reminder_minutes === null || ev?.reminder_minutes === undefined
      ? '' : String(ev.reminder_minutes),
  })

  const valid = form.title.trim() && form.date

  // 'custom' means a rule this UI cannot render (edited in Google, most
  // likely). Keep the original string rather than rewriting it from a
  // dropdown that never represented it.
  const recurrence = form.repeat === 'custom'
    ? ev?.recurrence ?? null
    : buildRRule(form.repeat, form.repeatUntil, !!form.time)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: 28, width: 460 }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>
            {ev ? 'Edit Event' : 'New Event'}
          </h2>
          <button aria-label="Close" onClick={onClose} style={iconBtn}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <Field label="Title" htmlFor="ev-title">
            <input id="ev-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Google interview" autoFocus style={inp} />
          </Field>

          {/* Type chips */}
          <Field label="Type" htmlFor="ev-type">
            <div id="ev-type" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(Object.entries(TYPE_CONFIG) as [EventType, typeof TYPE_CONFIG[EventType]][]).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, type: k }))} style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  background: form.type === k ? v.bg : 'var(--c-bg-4)',
                  border: `1.5px solid ${form.type === k ? v.color : 'transparent'}`,
                  color: form.type === k ? v.color : 'var(--c-text-muted)',
                  transition: 'all 0.15s',
                }}>{v.label}</button>
              ))}
            </div>
          </Field>

          {/* Date + Time row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date" htmlFor="ev-date">
              <input id="ev-date" type="date" aria-label="Date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
            </Field>
            <Field label="Time (optional)" htmlFor="ev-time">
              <input id="ev-time" type="time" aria-label="Time (optional)" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={inp} />
            </Field>
          </div>

          {/* Repeat */}
          <div style={{ display: 'grid', gridTemplateColumns: form.repeat === 'none' ? '1fr' : '1fr 1fr', gap: 12 }}>
            <Field label="Repeat" htmlFor="ev-repeat">
              <select
                id="ev-repeat"
                value={form.repeat}
                onChange={e => setForm(f => ({ ...f, repeat: e.target.value as RepeatKey }))}
                style={inp}
              >
                {REPEAT_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
                {form.repeat === 'custom' && (
                  <option value="custom">Custom (set in Google)</option>
                )}
              </select>
            </Field>
            {form.repeat !== 'none' && (
              <Field label="Repeat until (optional)" htmlFor="ev-repeat-until">
                <input
                  id="ev-repeat-until" type="date" aria-label="Repeat until"
                  value={form.repeatUntil} min={form.date}
                  onChange={e => setForm(f => ({ ...f, repeatUntil: e.target.value }))}
                  style={inp}
                />
              </Field>
            )}
          </div>

          {/* Reminder — delivered by Google, so it reaches the phone too */}
          <Field label="Reminder" htmlFor="ev-reminder">
            <select
              id="ev-reminder"
              value={form.reminder}
              onChange={e => setForm(f => ({ ...f, reminder: e.target.value }))}
              style={inp}
            >
              {REMINDER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          {/* Notes */}
          <Field label="Notes" htmlFor="ev-notes">
            <textarea id="ev-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any extra details…" rows={3} style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
          {ev && onDelete ? (
            <button onClick={onDelete} disabled={deleting} style={{ ...ghostBtn, color: 'var(--c-red)', borderColor: 'rgba(224,50,85,0.3)' }}>
              {deleting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
              Delete
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={() => valid && onSave({ title: form.title, type: form.type, date: form.date, time: form.time || undefined, notes: form.notes || undefined, recurrence: recurrence || undefined, reminder_minutes: form.reminder === '' ? null : Number(form.reminder) })}
              disabled={!valid || saving} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 'var(--r-md)',
                background: valid && !saving ? TYPE_CONFIG[form.type].color : 'var(--c-bg-4)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: valid && !saving ? 'pointer' : 'default', fontFamily: 'var(--font-body)',
              }}>
              {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {saving ? 'Saving…' : ev ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mini Month Picker (left panel) ─────────────────────────────
function MiniMonth({ year, month, selected, onSelect, onNav }: {
  year: number; month: number; selected: string
  onSelect: (iso: string) => void; onNav: (dir: 1 | -1) => void
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])
  const todayISO = today()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button aria-label="Previous month" onClick={() => onNav(-1)} style={iconBtn}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>{MONTHS[month].slice(0, 3)} {year}</span>
        <button aria-label="Next month" onClick={() => onNav(1)} style={iconBtn}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {DAYS.map(d => <div key={d} style={{ fontSize: 9, color: 'var(--c-text-dim)', textAlign: 'center', padding: '2px 0', fontWeight: 600 }}>{d[0]}</div>)}
        {cells.map((cell, i) => {
          const iso = toISO(cell)
          const inMonth = cell.getMonth() === month
          const isToday = iso === todayISO
          const isSel   = iso === selected
          return (
            <button key={i} onClick={() => onSelect(iso)} style={{
              width: '100%', aspectRatio: '1', border: 'none', borderRadius: '50%',
              fontSize: 10, cursor: 'pointer', fontFamily: 'var(--font-body)',
              background: isSel ? 'var(--c-violet)' : isToday ? 'var(--c-violet-dim)' : 'transparent',
              color: isSel ? '#fff' : isToday ? 'var(--c-violet)' : inMonth ? 'var(--c-text)' : 'var(--c-text-dim)',
              fontWeight: isToday || isSel ? 700 : 400,
            }}>{cell.getDate()}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function CalendarPage() {
  const [view, setView]               = useState<View>('month')
  const [anchor, setAnchor]           = useState(new Date())
  const [modal, setModal]             = useState<{ date: string; event?: CalendarEvent } | null>(null)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [miniSel, setMiniSel]         = useState(today())
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)

  // Cached under CALENDAR_KEY — revisiting this page shows the last list
  // instantly while a background refetch keeps it current.
  //
  // Start empty, never with placeholder events. Defaulting to mock data meant
  // six invented interviews and deadlines rendered for the split second before
  // the real list arrived, then vanished — indistinguishable from real events
  // being lost. The "Loading events…" indicator already covers this window.
  const { data, isLoading: loading, mutate } = useSWR(CALENDAR_KEY, fetchCalendarEvents)
  const events = useMemo(() => data ?? [], [data])

  const year  = anchor.getFullYear()
  const month = anchor.getMonth()

  // Realtime — tell SWR to refetch this key instead of running a parallel
  // ad-hoc query and managing a second copy of the list in local state.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const ch = supabase.channel('cal')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => mutate())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [mutate])

  // ── Google Calendar connection ───────────────────────────────
  const { data: googleStatus, mutate: mutateGoogleStatus } =
    useSWR<{ connected: boolean }>(GOOGLE_STATUS_KEY, fetcher)
  const googleConnected = googleStatus?.connected ?? false

  // Pull the user's EXISTING Google events for the visible month. Padded by a
  // week each side so the grid's leading/trailing cells are covered too.
  const [gFrom, gTo] = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const end   = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    start.setDate(start.getDate() - 7)
    end.setDate(end.getDate() + 7)
    return [toISO(start), toISO(end)]
  }, [anchor])

  const { data: googleFeed } = useSWR<{ events: GoogleFeedEvent[]; error?: string }>(
    googleConnected ? `/api/calendar/google/events?from=${gFrom}&to=${gTo}` : null,
    fetcher,
  )

  // Events HireKit created were pushed to Google, so they come back in this
  // feed as well — drop those by id or every synced event renders twice.
  // Recurring ones need a prefix test too: Google identifies each instance as
  // "<masterId>_<timestamp>", so an exact match would only catch the first.
  const googleOnly = useMemo<DisplayEvent[]>(() => {
    const mine = events.map(e => e.google_event_id).filter(Boolean) as string[]
    const isMine = (gid: string) => mine.some(m => gid === m || gid.startsWith(`${m}_`))
    return (googleFeed?.events ?? [])
      .filter(g => !isMine(g.googleId))
      .map(g => ({
        id: `g:${g.googleId}`,
        title: g.title,
        type: 'other' as const,
        date: g.date,
        time: g.time ?? undefined,
        notes: g.notes ?? undefined,
        google_event_id: g.googleId,
        created_at: '',
        source: 'google' as const,
        htmlLink: g.htmlLink,
      }))
  }, [events, googleFeed])

  // Recurring HireKit events are stored once, as a master row with an RRULE.
  // Expand them across the visible window so the repeats actually appear on
  // the grid. Clones keep the master's id so editing one edits the series;
  // instanceKey exists only to give React a distinct key per occurrence.
  const localExpanded = useMemo<DisplayEvent[]>(() => {
    const out: DisplayEvent[] = []
    for (const e of events) {
      if (!e.recurrence) { out.push(e); continue }
      for (const d of expandRecurrence(e.date, e.recurrence, gFrom, gTo)) {
        out.push(d === e.date ? e : { ...e, date: d, instanceKey: `${e.id}@${d}` })
      }
    }
    return out
  }, [events, gFrom, gTo])

  const allEvents = useMemo<DisplayEvent[]>(
    () => [...localExpanded, ...googleOnly],
    [localExpanded, googleOnly],
  )

  // Google events are read-only here — editing them would need write-back
  // rules we do not have, so send the user to Google instead of a modal that
  // cannot save.
  const openEvent = useCallback((ev: DisplayEvent) => {
    if (ev.source === 'google') {
      if (ev.htmlLink) window.open(ev.htmlLink, '_blank', 'noopener,noreferrer')
      return
    }
    setModal({ date: ev.date, event: ev })
  }, [])

  // The connect/callback round-trip is a full-page redirect, not a SPA
  // action — read the result from the URL once, then strip it so a refresh
  // doesn't re-show the banner. useSearchParams() would force this page into
  // a Suspense boundary for static rendering; reading window.location avoids that.
  const [googleConnectedFlag, setGoogleConnectedFlag] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('google_connected')
    const error = params.get('google_error')
    if (!connected && !error) return
    setGoogleConnectedFlag(connected)
    setGoogleError(error)
    mutateGoogleStatus()
    window.history.replaceState({}, '', '/calendar')
    const t = setTimeout(() => { setGoogleConnectedFlag(null); setGoogleError(null) }, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function disconnectGoogle() {
    setDisconnecting(true)
    try {
      await fetch('/api/calendar/google/disconnect', { method: 'POST' })
      mutateGoogleStatus({ connected: false }, { revalidate: false })
    } finally {
      setDisconnecting(false)
    }
  }

  // Month grid cells
  const monthCells = useMemo(() => buildMonthGrid(year, month), [year, month])

  // Week days
  const weekDays = useMemo(() => buildWeekDays(anchor), [anchor])

  // Events indexed by date
  const byDate = useMemo(() => {
    const map: Record<string, DisplayEvent[]> = {}
    allEvents.forEach(e => { (map[e.date] ??= []).push(e) })
    return map
  }, [allEvents])

  // Navigation
  function navMonth(dir: 1 | -1) {
    setAnchor(a => { const d = new Date(a); d.setMonth(d.getMonth() + dir); return d })
  }
  function navWeek(dir: 1 | -1) {
    setAnchor(a => { const d = new Date(a); d.setDate(d.getDate() + dir * 7); return d })
  }
  function goToday() { setAnchor(new Date()); setMiniSel(today()) }

  // Mini cal nav
  const [miniYear, setMiniYear]   = useState(new Date().getFullYear())
  const [miniMonth, setMiniMonth] = useState(new Date().getMonth())
  function navMini(dir: 1 | -1) {
    setMiniMonth(m => {
      let nm = m + dir; let ny = miniYear
      if (nm < 0) { nm = 11; ny-- }
      if (nm > 11) { nm = 0; ny++ }
      setMiniYear(ny)
      return nm
    })
  }
  function pickMini(iso: string) {
    setMiniSel(iso)
    const d = new Date(iso + 'T00:00:00')
    setAnchor(d)
  }

  // CRUD
  const saveEvent = useCallback(async (form: Omit<CalendarEvent, 'id' | 'created_at'>, editId?: string) => {
    setSaving(true)
    try {
      const method = editId ? 'PATCH' : 'POST'
      // Only meaningful when Google Calendar is connected — lets the server
      // build the event at the right local time instead of assuming UTC.
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const body   = editId ? { id: editId, ...form, timeZone } : { ...form, timeZone }
      const res  = await fetch('/api/calendar', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // The event saved locally either way, but say so when Google did not
      // take it — otherwise the two quietly drift apart with nothing on
      // screen to suggest anything is wrong.
      setSyncWarning(json.googleSync === 'failed'
        ? `Saved here, but Google Calendar did not accept it${json.googleError ? `: ${json.googleError}` : '.'}`
        : null)
      if (editId) {
        mutate(ev => (ev ?? []).map(e => e.id === editId ? json.event : e), { revalidate: false })
      } else {
        mutate(ev => [...(ev ?? []), json.event ?? { id: Date.now().toString(), ...form, created_at: '' }], { revalidate: false })
      }
      setModal(null)
    } catch {
      // If no auth, optimistically add to local list
      const optimistic: CalendarEvent = { id: Date.now().toString(), ...form, created_at: '' }
      if (editId) mutate(ev => (ev ?? []).map(e => e.id === editId ? { ...e, ...form } : e), { revalidate: false })
      else mutate(ev => [...(ev ?? []), optimistic], { revalidate: false })
      setModal(null)
    } finally {
      setSaving(false)
    }
  }, [mutate])

  const deleteEvent = useCallback(async (id: string) => {
    setDeleting(true)
    try {
      await fetch(`/api/calendar?id=${id}`, { method: 'DELETE' })
    } finally {
      mutate(ev => (ev ?? []).filter(e => e.id !== id), { revalidate: false })
      setDeleting(false)
      setModal(null)
    }
  }, [mutate])

  // Upcoming events (next 10)
  const todayISO = today()
  const upcoming = useMemo(() =>
    allEvents.filter(e => e.date >= todayISO).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
  [allEvents, todayISO])

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-h))', overflow: 'hidden', background: 'var(--c-bg)' }}>

      {/* ── Left panel ── */}
      <aside style={{
        width: 240, flexShrink: 0, borderRight: '1px solid var(--c-border)',
        background: 'var(--c-bg-2)', display: 'flex', flexDirection: 'column',
        padding: '18px 14px', gap: 18, overflowY: 'auto',
      }}>
        {/* Create button */}
        <button onClick={() => setModal({ date: miniSel || today() })} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          width: '100%', padding: '9px 0', borderRadius: 'var(--r-md)',
          background: 'var(--c-violet)', border: 'none',
          color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-body)',
          boxShadow: '0 2px 12px rgba(124,92,252,0.28)',
        }}>
          <Plus size={15} /> New Event
        </button>

        {/* Mini calendar */}
        <MiniMonth year={miniYear} month={miniMonth} selected={miniSel}
          onSelect={pickMini} onNav={navMini} />

        <div style={{ height: 1, background: 'var(--c-border)' }} />

        {/* Event type legend */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Event Types
          </div>
          {(Object.entries(TYPE_CONFIG) as [EventType, typeof TYPE_CONFIG[EventType]][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>{v.label}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--c-border)' }} />

        {/* Upcoming */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
            Upcoming
          </div>
          {upcoming.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.5 }}>No upcoming events</p>
          )}
          {upcoming.map(e => {
            const cfg = TYPE_CONFIG[e.type as EventType] ?? TYPE_CONFIG.other
            const d   = new Date(e.date + 'T00:00:00')
            return (
              <button key={e.instanceKey ?? e.id} onClick={() => openEvent(e)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 10px', borderRadius: 'var(--r-md)',
                marginBottom: 4, cursor: 'pointer',
                background: 'transparent', border: 'none',
                transition: 'background 0.13s', fontFamily: 'var(--font-body)',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg-4)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.title}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--c-text-dim)', paddingLeft: 13 }}>
                  {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  {e.time && ` · ${e.time}`}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 20px', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-bg-2)', flexShrink: 0,
        }}>
          {/* Nav arrows */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button aria-label="Previous" onClick={() => view === 'month' ? navMonth(-1) : navWeek(-1)} style={iconBtn}><ChevronLeft size={17} /></button>
            <button aria-label="Next"     onClick={() => view === 'month' ? navMonth(1)  : navWeek(1)}  style={iconBtn}><ChevronRight size={17} /></button>
          </div>

          {/* Today */}
          <button onClick={goToday} style={{
            padding: '5px 13px', borderRadius: 'var(--r-md)',
            background: 'var(--c-bg-4)', border: '1px solid var(--c-border)',
            color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>Today</button>

          {/* Title */}
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginRight: 'auto' }}>
            {view === 'month'
              ? `${MONTHS[month]} ${year}`
              : `${weekDays[0].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </h2>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', padding: 3, gap: 2 }}>
            {(['month', 'week'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '5px 13px', borderRadius: 7, border: 'none',
                background: view === v ? 'var(--c-bg-2)' : 'transparent',
                color: view === v ? 'var(--c-text)' : 'var(--c-text-muted)',
                fontSize: 12, fontWeight: view === v ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                textTransform: 'capitalize', transition: 'all 0.15s',
              }}>{v}</button>
            ))}
          </div>

          {/* Google Calendar connect/disconnect */}
          {googleConnected ? (
            <button onClick={disconnectGoogle} disabled={disconnecting} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 13px', borderRadius: 'var(--r-md)',
              background: 'rgba(0,168,133,0.08)', border: '1px solid rgba(0,168,133,0.25)',
              color: 'var(--c-teal)', fontSize: 12, fontWeight: 600,
              cursor: disconnecting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
            }}>
              {disconnecting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={13} />}
              Google Connected
            </button>
          ) : (
            <a href="/api/calendar/google/connect" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 13px', borderRadius: 'var(--r-md)',
              background: 'var(--c-bg-4)', border: '1px solid var(--c-border)',
              color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none',
            }}>
              <Unlink size={13} /> Connect Google Calendar
            </a>
          )}
        </div>

        {/* Google connect/error banner — only shown right after the OAuth redirect back */}
        {(googleConnectedFlag || googleError) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', fontSize: 12, fontWeight: 500,
            background: googleError ? 'rgba(224,50,85,0.08)' : 'rgba(0,168,133,0.08)',
            color: googleError ? 'var(--c-red)' : 'var(--c-teal)',
            borderBottom: '1px solid var(--c-border)',
          }}>
            {googleError
              ? <><AlertCircle size={13} /> Couldn't connect Google Calendar ({googleError.replace(/_/g, ' ')}). Try again.</>
              : <><Check size={13} /> Google Calendar connected — your Google events show here (dashed, read-only), and events you create here sync to Google.</>}
          </div>
        )}

        {/* ── Month View ── */}
        {view === 'month' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--c-border)', flexShrink: 0, background: 'var(--c-bg-2)' }}>
              {DAYS.map(d => (
                <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.05em' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', overflow: 'hidden' }}>
              {monthCells.map((cell, i) => {
                const iso      = toISO(cell)
                const inMonth  = cell.getMonth() === month
                const isToday  = iso === todayISO
                const dayEvs   = byDate[iso] ?? []
                const visible  = dayEvs.slice(0, 3)
                const more     = dayEvs.length - 3

                return (
                  <div
                    key={i}
                    onClick={() => setModal({ date: iso })}
                    style={{
                      borderRight: '1px solid var(--c-border)',
                      borderBottom: '1px solid var(--c-border)',
                      padding: '6px 6px 4px',
                      minHeight: 100,
                      background: isToday ? 'rgba(124,92,252,0.04)' : 'var(--c-bg-2)',
                      cursor: 'pointer',
                      opacity: inMonth ? 1 : 0.45,
                      transition: 'background 0.13s',
                      position: 'relative',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = isToday ? 'rgba(124,92,252,0.08)' : 'var(--c-bg-3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = isToday ? 'rgba(124,92,252,0.04)' : 'var(--c-bg-2)')}
                  >
                    {/* Day number */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%', marginBottom: 4,
                      fontSize: 12, fontWeight: isToday ? 700 : 400,
                      background: isToday ? 'var(--c-violet)' : 'transparent',
                      color: isToday ? '#fff' : 'var(--c-text)',
                    }}>
                      {cell.getDate()}
                    </div>

                    {/* Event chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {visible.map(ev => {
                        const cfg = TYPE_CONFIG[ev.type as EventType] ?? TYPE_CONFIG.other
                        return (
                          <div
                            key={ev.instanceKey ?? ev.id}
                            onClick={e => { e.stopPropagation(); openEvent(ev) }}
                            title={ev.source === 'google' ? 'From Google Calendar — opens in Google' : undefined}
                            style={{
                              padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                              background: cfg.bg, color: cfg.color,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              cursor: 'pointer',
                              // Read-only Google events get a dashed edge, so it is
                              // obvious which ones this app cannot edit.
                              border: ev.source === 'google'
                                ? '1px dashed color-mix(in srgb, currentColor 45%, transparent)'
                                : '1px solid transparent',
                            }}
                          >
                            {ev.time && <span style={{ opacity: 0.7, marginRight: 4 }}>{ev.time.slice(0, 5)}</span>}
                            {ev.title}
                          </div>
                        )
                      })}
                      {more > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--c-text-dim)', paddingLeft: 4 }}>+{more} more</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Week View ── */}
        {view === 'week' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Week header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)',
              borderBottom: '1px solid var(--c-border)', flexShrink: 0, background: 'var(--c-bg-2)',
            }}>
              <div />
              {weekDays.map((d, i) => {
                const iso = toISO(d)
                const isT = iso === todayISO
                return (
                  <div key={i} style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--c-text-dim)', marginBottom: 4, letterSpacing: '0.05em' }}>
                      {DAYS[d.getDay()]}
                    </div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 30, height: 30, borderRadius: '50%',
                      background: isT ? 'var(--c-violet)' : 'transparent',
                      color: isT ? '#fff' : 'var(--c-text)',
                      fontSize: 14, fontWeight: isT ? 700 : 500,
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time slots */}
            <div style={{ flex: 1, position: 'relative' }}>
              {HOURS.map(h => (
                <div key={h} style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--c-border)' }}>
                  <div style={{ padding: '4px 8px 0', fontSize: 10, color: 'var(--c-text-dim)', textAlign: 'right', lineHeight: 1 }}>
                    {h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`}
                  </div>
                  {weekDays.map((d, di) => {
                    const iso = toISO(d)
                    const slotEvs = (byDate[iso] ?? []).filter(e => {
                      if (!e.time) return h === 8
                      const eh = parseInt(e.time.split(':')[0])
                      return eh === h
                    })
                    return (
                      <div key={di}
                        onClick={() => setModal({ date: iso })}
                        style={{
                          borderLeft: '1px solid var(--c-border)', minHeight: 52,
                          padding: 3, cursor: 'pointer',
                          background: toISO(d) === todayISO ? 'rgba(124,92,252,0.025)' : 'transparent',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--c-bg-3)')}
                        onMouseLeave={e => (e.currentTarget.style.background = toISO(d) === todayISO ? 'rgba(124,92,252,0.025)' : 'transparent')}
                      >
                        {slotEvs.map(ev => {
                          const cfg = TYPE_CONFIG[ev.type as EventType] ?? TYPE_CONFIG.other
                          return (
                            <div key={ev.instanceKey ?? ev.id}
                              onClick={e => { e.stopPropagation(); openEvent(ev) }}
                              style={{
                                padding: '3px 6px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                                background: cfg.bg, color: cfg.color, marginBottom: 2,
                                borderLeft: `3px solid ${cfg.color}`,
                                cursor: 'pointer',
                              }}>
                              {ev.title}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Event Modal ── */}
      {modal && (
        <EventModal
          initial={modal}
          onClose={() => !saving && !deleting && setModal(null)}
          onSave={form => saveEvent(form, modal.event?.id)}
          onDelete={modal.event ? () => deleteEvent(modal.event!.id) : undefined}
          saving={saving}
          deleting={deleting}
        />
      )}

      {loading && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '8px 14px', fontSize: 12, color: 'var(--c-text-muted)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 100 }}>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading events…
        </div>
      )}

      {syncWarning && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, maxWidth: 380, background: 'var(--c-bg-3)', border: '1px solid rgba(224,50,85,0.35)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 12, color: 'var(--c-text)', display: 'flex', alignItems: 'flex-start', gap: 8, zIndex: 120 }}>
          <AlertCircle size={13} style={{ color: 'var(--c-red)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.5 }}>{syncWarning}</span>
          <button aria-label="Dismiss" onClick={() => setSyncWarning(null)} style={{ ...iconBtn, marginLeft: 'auto' }}><X size={13} /></button>
        </div>
      )}
    </div>
  )
}

// ── Shared micro-styles ─────────────────────────────────────
const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--c-text-muted)', padding: 5, borderRadius: 'var(--r-sm)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 'var(--r-md)',
  background: 'transparent', border: '1px solid var(--c-border-md)',
  color: 'var(--c-text-muted)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font-body)',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 11px',
  background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-md)', color: 'var(--c-text)',
  fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)',
  boxSizing: 'border-box',
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
