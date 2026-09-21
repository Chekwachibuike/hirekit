// Turns the raw practice_attempts rows into the numbers the Progress panel
// shows. Pure functions over an array — no fetching, no dates beyond what is
// passed in — so the thresholds below can be reasoned about and tested
// directly rather than only observed through the UI.

export interface Attempt {
  id: string
  kind: string
  role: string | null
  topic: string | null
  question: string | null
  score: number
  created_at: string
}

export interface TopicStat {
  topic: string
  attempts: number
  average: number
  /** Same topic's average in the previous period, when it was practised then. */
  previousAverage: number | null
  /** average − previousAverage, null when there is nothing to compare against. */
  delta: number | null
}

export interface MonthlyReport {
  month: string            // YYYY-MM
  attempts: number
  average: number
  previousAverage: number | null
  improved: TopicStat[]    // practised in both periods, and better now
  declined: TopicStat[]    // practised in both periods, and worse now
  weakest: TopicStat[]     // lowest current averages, regardless of history
  unpractised: string[]    // seen before, absent this month
}

export interface Streak {
  current: number
  longest: number
  /** YYYY-MM-DD of the most recent day with an attempt. */
  lastDay: string | null
  /** True when the run continues through today or yesterday. */
  active: boolean
}

const dayOf = (iso: string) => iso.slice(0, 10)
const monthOf = (iso: string) => iso.slice(0, 7)

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  // Formatted from the local getters, NOT via toISOString(). The date is built
  // at local midnight, so converting to UTC lands on the previous day in any
  // positive-offset zone — WAT included — and every streak silently collapsed
  // to 1 because no two days ever looked adjacent.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mean(nums: number[]): number {
  if (!nums.length) return 0
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/**
 * Consecutive days with at least one rated answer.
 *
 * A streak stays "active" through yesterday, not only today: counting it
 * broken the moment midnight passes would mark someone as having lost a
 * 30-day run before they have had any chance to practise.
 */
export function computeStreak(attempts: Attempt[], today: string): Streak {
  if (!attempts.length) return { current: 0, longest: 0, lastDay: null, active: false }

  const days = Array.from(new Set(attempts.map(a => dayOf(a.created_at)))).sort()
  const lastDay = days[days.length - 1]

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    if (days[i] === addDays(days[i - 1], 1)) run++
    else run = 1
    if (run > longest) longest = run
  }

  const active = lastDay === today || lastDay === addDays(today, -1)
  let current = 0
  if (active) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i - 1] === addDays(days[i], -1)) current++
      else break
    }
  }

  return { current, longest, lastDay, active }
}

function statsByTopic(rows: Attempt[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const r of rows) {
    const t = (r.topic ?? '').trim()
    if (!t) continue
    const list = map.get(t) ?? []
    list.push(r.score)
    map.set(t, list)
  }
  return map
}

/**
 * Compares a month against the one before it.
 *
 * Topics need at least MIN_ATTEMPTS in both periods before a change counts as
 * improvement: a single lucky answer moving an average from 4 to 8 is noise,
 * and reporting it as progress would be worse than saying nothing.
 */
export function monthlyReport(
  attempts: Attempt[],
  month: string,
  opts: { minAttempts?: number; minDelta?: number } = {},
): MonthlyReport {
  const MIN_ATTEMPTS = opts.minAttempts ?? 2
  const MIN_DELTA = opts.minDelta ?? 0.5

  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const cur = attempts.filter(a => monthOf(a.created_at) === month)
  const prev = attempts.filter(a => monthOf(a.created_at) === prevMonth)

  const curTopics = statsByTopic(cur)
  const prevTopics = statsByTopic(prev)

  const stats: TopicStat[] = Array.from(curTopics.entries()).map(([topic, scores]) => {
    const prevScores = prevTopics.get(topic)
    const previousAverage = prevScores && prevScores.length >= MIN_ATTEMPTS ? mean(prevScores) : null
    const average = mean(scores)
    return {
      topic,
      attempts: scores.length,
      average,
      previousAverage,
      delta: previousAverage === null ? null : Math.round((average - previousAverage) * 10) / 10,
    }
  })

  const comparable = stats.filter(s => s.delta !== null && s.attempts >= MIN_ATTEMPTS)

  return {
    month,
    attempts: cur.length,
    average: mean(cur.map(a => a.score)),
    previousAverage: prev.length ? mean(prev.map(a => a.score)) : null,
    improved: comparable.filter(s => (s.delta as number) >= MIN_DELTA)
      .sort((a, b) => (b.delta as number) - (a.delta as number)),
    declined: comparable.filter(s => (s.delta as number) <= -MIN_DELTA)
      .sort((a, b) => (a.delta as number) - (b.delta as number)),
    weakest: [...stats].sort((a, b) => a.average - b.average).slice(0, 5),
    // Practised before but not this month — the gap that a rising average
    // hides, because dropping a weak topic raises the mean.
    unpractised: Array.from(prevTopics.keys()).filter(t => !curTopics.has(t)),
  }
}

export function currentMonth(today = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}
