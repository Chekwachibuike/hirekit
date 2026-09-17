// Shared RRULE handling. Lives here rather than in the calendar page because
// the notification feed has to expand the same repeats to know what is coming
// up — two copies of this logic would drift apart immediately.
//
// A deliberately small subset: exactly the patterns the event modal can
// produce. A general RRULE engine would dwarf the UI that needs it, and the
// stored value goes to Google untouched, where the full spec is honoured.

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayISO() { return toISO(new Date()) }

export const REPEAT_OPTIONS = [
  { key: 'none',     label: 'Does not repeat', rule: null },
  { key: 'daily',    label: 'Daily',           rule: 'FREQ=DAILY' },
  { key: 'weekdays', label: 'Every weekday (Mon–Fri)', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { key: 'weekly',   label: 'Weekly',          rule: 'FREQ=WEEKLY' },
  { key: 'monthly',  label: 'Monthly',         rule: 'FREQ=MONTHLY' },
  { key: 'yearly',   label: 'Yearly',          rule: 'FREQ=YEARLY' },
] as const

export type RepeatKey = typeof REPEAT_OPTIONS[number]['key'] | 'custom'

export function buildRRule(key: RepeatKey, until: string, hasTime: boolean): string | null {
  const base = REPEAT_OPTIONS.find(o => o.key === key)?.rule
  if (!base) return null
  if (!until) return base
  // UNTIL has to match DTSTART's type — a UTC date-time for timed events, a
  // plain date for all-day ones. Google rejects the mismatched form.
  const compact = until.replace(/-/g, '')
  return `${base};UNTIL=${hasTime ? `${compact}T235959Z` : compact}`
}

export function parseRRule(rrule?: string): { key: RepeatKey; until: string } {
  if (!rrule) return { key: 'none', until: '' }
  const m = rrule.match(/UNTIL=(\d{8})/)
  const until = m ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}` : ''
  const body = rrule.replace(/;?UNTIL=[^;]*/, '')
  const found = REPEAT_OPTIONS.find(o => o.rule === body)
  // Anything this UI cannot express — a rule edited in Google, say — is kept
  // verbatim rather than silently downgraded to "does not repeat".
  return { key: found ? found.key : 'custom', until }
}

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Occurrence dates of `rrule` (started on `startISO`) falling inside the window. */
export function expandRecurrence(startISO: string, rrule: string, fromISO: string, toISO_: string): string[] {
  const freq = rrule.match(/FREQ=(\w+)/)?.[1]
  if (!freq) return []

  const u = rrule.match(/UNTIL=(\d{8})/)?.[1]
  const untilISO = u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : null
  const days = rrule.match(/BYDAY=([A-Z,]+)/)?.[1]
    ?.split(',').map(d => BYDAY[d]).filter(n => n !== undefined)

  const end = untilISO && untilISO < toISO_ ? untilISO : toISO_
  const cur = new Date(`${startISO}T00:00:00`)
  const perDay = freq === 'DAILY' || (freq === 'WEEKLY' && days)

  // Jump to the window instead of walking from the original start date — a
  // daily event begun years ago would otherwise burn thousands of iterations
  // before reaching anything visible.
  if (toISO(cur) < fromISO) {
    const from = new Date(`${fromISO}T00:00:00`)
    const dayMs = 86400000
    if (perDay) {
      cur.setTime(from.getTime())
    } else if (freq === 'WEEKLY') {
      const weeks = Math.ceil((from.getTime() - cur.getTime()) / (7 * dayMs))
      cur.setDate(cur.getDate() + weeks * 7)
    } else if (freq === 'MONTHLY') {
      const months = (from.getFullYear() - cur.getFullYear()) * 12 + (from.getMonth() - cur.getMonth())
      if (months > 0) cur.setMonth(cur.getMonth() + months)
    } else if (freq === 'YEARLY') {
      const years = from.getFullYear() - cur.getFullYear()
      if (years > 0) cur.setFullYear(cur.getFullYear() + years)
    }
  }

  const out: string[] = []
  let guard = 0
  while (toISO(cur) <= end && guard++ < 400) {
    const iso = toISO(cur)
    if (iso >= fromISO && (!days || days.includes(cur.getDay()))) out.push(iso)
    if (freq === 'DAILY' || (freq === 'WEEKLY' && days)) cur.setDate(cur.getDate() + 1)
    else if (freq === 'WEEKLY') cur.setDate(cur.getDate() + 7)
    else if (freq === 'MONTHLY') cur.setMonth(cur.getMonth() + 1)
    else if (freq === 'YEARLY') cur.setFullYear(cur.getFullYear() + 1)
    else break
  }
  return out
}
