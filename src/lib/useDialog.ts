'use client'
import { useEffect, useRef, type RefObject } from 'react'

// Keyboard behaviour every modal needs, in one place:
//   - Escape closes it (only the topmost, when dialogs are stacked)
//   - focus moves into it on open and cannot Tab out behind the scrim
//   - focus returns to whatever opened it on close
// The dialog element itself should carry role="dialog", aria-modal="true",
// an aria-label and tabIndex={-1} (the focus target when it has no fields).

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const stack: symbol[] = []

export function useDialog(ref: RefObject<HTMLElement>, onClose: () => void, open = true) {
  // The latest onClose without re-running the effect (which would steal
  // focus back on every render).
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const me = Symbol('dialog')
    stack.push(me)
    const opener = document.activeElement as HTMLElement | null

    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter(el => el.offsetParent !== null || el === document.activeElement)

    const raf = requestAnimationFrame(() => {
      const el = ref.current
      if (!el || el.contains(document.activeElement)) return // an autoFocus field already has it
      const first = el.querySelector<HTMLElement>('[autofocus]') ?? focusables()[0]
      ;(first ?? el).focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close.current()
      } else if (e.key === 'Tab') {
        const items = focusables()
        if (!items.length) { e.preventDefault(); return }
        const first = items[0], last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      const i = stack.indexOf(me)
      if (i >= 0) stack.splice(i, 1)
      // Back to the button that opened it, if it is still on the page.
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open, ref])
}
