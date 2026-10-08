'use client'
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'

// useState that outlives the page. Leaving Job Search or Interview Prep used
// to throw away the search, the generated questions and every answer typed.
//
// Two layers:
//   - a module-level map, which survives client-side navigation (the module
//     stays loaded), so coming back renders the old state on the first frame;
//   - sessionStorage, which also survives a reload of the window, and is
//     cleared when the window closes.
//
// Writes go to the store, not to the component, so a request that finishes
// after you navigated away still lands: come back and the result is there.
// Every mounted copy of a key is subscribed and re-renders on writes.

const PREFIX = 'hirekit:'
const memory = new Map<string, unknown>()
const listeners = new Map<string, Set<(v: unknown) => void>>()

interface Options {
  /** false keeps the value in memory only. For in-flight flags (searching,
   *  generating): after a reload the request is gone, and a restored
   *  "loading" flag would spin forever. */
  session?: boolean
}

function readSession(key: string): { found: boolean; value?: unknown } {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    return raw === null ? { found: false } : { found: true, value: JSON.parse(raw) }
  } catch {
    return { found: false }
  }
}

function write(key: string, value: unknown, session: boolean) {
  memory.set(key, value)
  if (session) {
    // Quota or a blocked store must not break the page; memory still holds it.
    try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* ignore */ }
  }
  listeners.get(key)?.forEach(l => l(value))
}

export function usePersistentState<T>(key: string, initial: T, opts: Options = {}) {
  const session = opts.session !== false
  const initialRef = useRef(initial)

  // Memory only on the first render: it is empty on a full page load, so
  // this matches the server-rendered HTML and hydration stays clean.
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial))

  useEffect(() => {
    // Full reload: memory is empty, so restore from sessionStorage now that
    // hydration is done.
    if (!memory.has(key) && session) {
      const s = readSession(key)
      if (s.found) {
        memory.set(key, s.value)
        setValue(s.value as T)
      }
    }
    const listener = (v: unknown) => setValue(v as T)
    let set = listeners.get(key)
    if (!set) listeners.set(key, (set = new Set()))
    set.add(listener)
    return () => { set!.delete(listener) }
  }, [key, session])

  const update = useCallback((next: SetStateAction<T>) => {
    // The previous value comes from the store, not this component's state:
    // after a remount, this closure's state may be stale.
    const prev = (memory.has(key) ? memory.get(key) : initialRef.current) as T
    const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
    write(key, v, session)
  }, [key, session])

  return [value, update] as const
}

/** Forgets everything, e.g. on sign-out, so the next account starts clean. */
export function clearPersistentState() {
  memory.clear()
  try {
    const keys: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i)
      if (k?.startsWith(PREFIX)) keys.push(k)
    }
    keys.forEach(k => window.sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
