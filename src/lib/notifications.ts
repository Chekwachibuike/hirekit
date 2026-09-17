// Derives the notification feed from data the app already has. Nothing is
// stored and nothing is scheduled: the list is recomputed from calendar
// events and applications each time it is read.
//
// That is a deliberate limit. Without an always-on server HireKit cannot
// notify anyone while it is closed, so this feed only answers "what needs
// attention right now, while I am looking at it". Reminders that must reach
// you when the app is shut are set on the event and delivered by Google.
import type { CalendarEvent } from './supabase'
import { expandRecurrence, toISO } from './recurrence'

export type NotificationKind = 'interview' | 'deadline' | 'event' | 'follow-up'

export interface AppNotification {
  /** Stable across reloads, so dismissals survive. */
  id: string
  kind: NotificationKind
  title: string
  detail: string
  href: string
  /** ISO date the item refers to; used for ordering. */
  date: string
  urgent: boolean
}

export interface ApplicationRow {
  id: string
  company: string
  role: string
  status: string
  applied_date: string | null
}

const DAY = 86400000
const STALE_AFTER_DAYS = 14
const LOOKAHEAD_DAYS = 7

function daysBetween(fromISO: string, toISO_: string) {
  return Math.round(
    (new Date(`${toISO_}T00:00:00`).getTime() - new Date(`${fromISO}T00:00:00`).getTime()) / DAY,
  )
}

function whenLabel(days: number) {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export function buildNotifications(
  events: CalendarEvent[],
  applications: ApplicationRow[],
  now = new Date(),
): AppNotification[] {
  const from = toISO(now)
  const horizon = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY)
  const to = toISO(horizon)

  const out: AppNotification[] = []

  for (const e of events) {
    // A recurring event is one row, so its occurrences have to be expanded
    // before we can tell whether one falls inside the window.
    const dates = e.recurrence
      ? expandRecurrence(e.date, e.recurrence, from, to)
      : (e.date >= from && e.date <= to ? [e.date] : [])

    for (const date of dates) {
      const days = daysBetween(from, date)
      const time = e.time ? ` at ${e.time.slice(0, 5)}` : ''

      if (e.type === 'interview') {
        out.push({
          id: `ev:${e.id}:${date}`, kind: 'interview',
          title: e.title, detail: `Interview ${whenLabel(days)}${time}`,
          href: '/calendar', date, urgent: days <= 1,
        })
      } else if (e.type === 'deadline') {
        out.push({
          id: `ev:${e.id}:${date}`, kind: 'deadline',
          title: e.title, detail: `Deadline ${whenLabel(days)}${time}`,
          href: '/calendar', date, urgent: days <= 2,
        })
      } else if (days <= 1) {
        // Ordinary events are only worth surfacing when they are imminent —
        // a week of study blocks would bury everything that matters.
        out.push({
          id: `ev:${e.id}:${date}`, kind: 'event',
          title: e.title, detail: `${whenLabel(days)}${time}`,
          href: '/calendar', date, urgent: false,
        })
      }
    }
  }

  for (const a of applications) {
    if (a.status !== 'applied' || !a.applied_date) continue
    const age = daysBetween(a.applied_date, from)
    if (age < STALE_AFTER_DAYS) continue
    out.push({
      id: `app:${a.id}`, kind: 'follow-up',
      title: `${a.role} — ${a.company}`,
      detail: `Applied ${age} days ago with no update. Worth a follow-up.`,
      href: '/applications', date: a.applied_date, urgent: false,
    })
  }

  // Urgent first, then soonest.
  return out.sort((x, y) =>
    x.urgent === y.urgent ? x.date.localeCompare(y.date) : (x.urgent ? -1 : 1))
}

// ── Dismissals ─────────────────────────────────────────────────────
// Per-browser and deliberately not synced: this is "I have seen that", not
// data worth a table and a round trip.
const DISMISS_KEY = 'hirekit-dismissed-notifications'

export function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') as string[])
  } catch { return new Set() }
}

export function writeDismissed(ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    // Cap it so dismissing daily repeats cannot grow this without bound.
    localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(ids).slice(-300)))
  } catch { /* storage full or blocked — dismissals just will not persist */ }
}
