'use client'
// Deletes that can be taken back. The item leaves the screen at once, a
// toast offers Undo for a few seconds, and only then is the delete sent.
// Forgiveness instead of a confirmation dialog: a slip costs one click to
// reverse, and deliberate deletes are not slowed down by an "Are you sure?".
//
// The store lives at module level and the toaster in the app shell, so a
// pending delete still completes if the page that started it unmounts.
// Closing the window commits everything pending (see flushPending).

export interface PendingDelete {
  id: number
  label: string
  startedAt: number
  ms: number
}

interface Entry extends PendingDelete {
  timer: ReturnType<typeof setTimeout>
  commit: () => Promise<unknown> | void
  restore: () => void
}

const DEFAULT_MS = 6000
let nextId = 1
const entries = new Map<number, Entry>()
const listeners = new Set<(items: PendingDelete[]) => void>()

function emit() {
  const items = Array.from(entries.values()).map(({ id, label, startedAt, ms }) => ({ id, label, startedAt, ms }))
  listeners.forEach(l => l(items))
}

export function subscribePending(l: (items: PendingDelete[]) => void): () => void {
  listeners.add(l)
  emit()
  return () => { listeners.delete(l) }
}

function commitEntry(id: number) {
  const e = entries.get(id)
  if (!e) return
  clearTimeout(e.timer)
  entries.delete(id)
  emit()
  try {
    const r = e.commit()
    // A failed delete puts the item back rather than losing it silently.
    if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch(() => e.restore())
  } catch {
    e.restore()
  }
}

/**
 * remove: take the item off screen now (optimistic).
 * restore: bring it back (usually: re-fetch, since nothing was deleted yet).
 * commit: the real delete. Use fetch(..., { keepalive: true }) so it survives
 *         the window closing.
 */
export function deleteWithUndo(opts: {
  label: string
  remove: () => void
  restore: () => void
  commit: () => Promise<unknown> | void
  ms?: number
}) {
  const id = nextId++
  const ms = opts.ms ?? DEFAULT_MS
  opts.remove()
  entries.set(id, {
    id, label: opts.label, startedAt: Date.now(), ms,
    commit: opts.commit, restore: opts.restore,
    timer: setTimeout(() => commitEntry(id), ms),
  })
  emit()
}

export function undoDelete(id: number) {
  const e = entries.get(id)
  if (!e) return
  clearTimeout(e.timer)
  entries.delete(id)
  emit()
  e.restore()
}

/** Dismissing the toast means "yes, delete it now". */
export function commitNow(id: number) {
  commitEntry(id)
}

/** Window closing or hidden for good: send every pending delete now. */
export function flushPending() {
  Array.from(entries.keys()).forEach(commitEntry)
}
