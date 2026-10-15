'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  LayoutDashboard, Briefcase, Search, FileText, Ellipsis, Settings, LogOut,
  Sun, Moon, Monitor,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { useTheme } from '@/lib/useTheme'
import { useDialog } from '@/lib/useDialog'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { clearPersistentState } from '@/lib/usePersistentState'
import { NAV_MAIN, NAV_AI } from './Sidebar'

// Phone navigation. Below 860px the sidebar is gone (tokens.css) and this
// takes its place: a tab bar for the four destinations used most, and a
// More sheet for everything else, the theme and signing out.
//
// The tab bar is a translucent material over the page, so content scrolls
// under it instead of being cut off by an opaque strip. The sheet rises from
// the bottom and leaves the same way, follows the finger when dragged down,
// and closes on release once it has travelled far or fast enough.

const TABS = [
  { href: '/dashboard',    label: 'Home',         icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: Briefcase },
  { href: '/job-search',   label: 'Jobs',         icon: Search },
  { href: '/cv-builder',   label: 'CV',           icon: FileText },
]

const isActive = (path: string, href: string) => path === href || path.startsWith(href + '/')

// iOS sheet curve: fast out, long gentle settle, no overshoot.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OPEN_MS = 340

export default function MobileNav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const inMore = !TABS.some(t => isActive(path, t.href))

  // Navigating closes the sheet.
  useEffect(() => { setOpen(false) }, [path])

  return (
    <>
      <nav className="hk-tabbar" aria-label="Main">
        {TABS.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href)
          return (
            <Link key={href} href={href} aria-current={on ? 'page' : undefined} className="hk-tab" data-on={on || undefined}>
              <Icon size={22} strokeWidth={on ? 2.3 : 1.8} />
              <span>{label}</span>
            </Link>
          )
        })}
        <button type="button" className="hk-tab" data-on={(inMore || open) || undefined}
          aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <Ellipsis size={22} strokeWidth={inMore || open ? 2.3 : 1.8} />
          <span>More</span>
        </button>
      </nav>
      {open && <MoreSheet path={path} onClose={() => setOpen(false)} />}
    </>
  )
}

function MoreSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const router = useRouter()
  const { data: caps } = useSWR<{ whatsapp?: boolean }>('/api/capabilities', fetcher)
  const { mode, cycle } = useTheme()
  const ModeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor

  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)

  // ── Motion: everything goes through transform/opacity on the live element,
  // so a drag can grab the sheet mid-animation from where it actually is.
  const setY = (y: number, ms = 0) => {
    const el = sheetRef.current, scrim = scrimRef.current
    if (!el || !scrim) return
    const h = el.offsetHeight || 1
    el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none'
    scrim.style.transition = ms ? `opacity ${ms}ms ${EASE}` : 'none'
    el.style.transform = `translateY(${y}px)`
    scrim.style.opacity = String(Math.max(0, 1 - y / h))
  }

  const dismiss = (ms = 260) => {
    if (closing.current) return
    closing.current = true
    setY(sheetRef.current?.offsetHeight ?? 600, ms)
    setTimeout(onClose, ms)
  }

  useDialog(sheetRef, () => dismiss())

  // Enter: start below the screen, then rise along the path it will leave by.
  useEffect(() => {
    setY(sheetRef.current?.offsetHeight ?? 600)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setY(0, OPEN_MS)))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Drag to dismiss: 1:1 with the finger, from where it was grabbed.
  const drag = useRef<{ startY: number; base: number; samples: { y: number; t: number }[] } | null>(null)

  const currentY = () => {
    const m = sheetRef.current ? new DOMMatrixReadOnly(getComputedStyle(sheetRef.current).transform) : null
    return m ? m.m42 : 0
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Only from the grabber and the header area: dragging the list scrolls it.
    if (!(e.target as HTMLElement).closest('[data-grab]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const base = currentY()           // presentation value, not the target
    setY(base)
    drag.current = { startY: e.clientY, base, samples: [{ y: e.clientY, t: e.timeStamp }] }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    let y = d.base + (e.clientY - d.startY)
    // Above its resting place the sheet resists instead of stopping dead.
    if (y < 0) y = -(Math.abs(y) * 0.55 * 60) / (60 + 0.55 * Math.abs(y))
    setY(y)
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    if (d.samples.length > 5) d.samples.shift()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    const first = d.samples[0], last = { y: e.clientY, t: e.timeStamp }
    const v = (last.y - first.y) / Math.max(1, last.t - first.t)   // px/ms, down is +
    const y = currentY()
    const h = sheetRef.current?.offsetHeight ?? 600
    // Decide by where the flick was heading, not just where it was let go.
    const projected = y + v * 180
    if (v > 0.5 || projected > h * 0.4) dismiss(Math.max(140, Math.min(300, (h - y) / Math.max(v, 0.8))))
    else setY(0, 300)
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut()
    clearPersistentState()
    router.replace('/auth')
  }

  const items = [...NAV_MAIN, ...NAV_AI]
    .filter(i => !TABS.some(t => t.href === i.href))
    .filter(i => !i.needs || caps?.[i.needs] === true)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      <div ref={scrimRef} onClick={() => dismiss()} aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'var(--c-overlay)', opacity: 0 }} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="More" tabIndex={-1}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className="hk-sheet">
        <div data-grab style={{ padding: '8px 0 4px', display: 'flex', justifyContent: 'center', touchAction: 'none', cursor: 'grab' }}>
          <span aria-hidden style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--c-border-md)' }} />
        </div>
        <div data-grab style={{ padding: '4px 20px 10px', touchAction: 'none' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>More</h2>
        </div>

        <div style={{ padding: '0 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {items.map(({ href, label, icon: Icon }) => {
            const on = isActive(path, href)
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined} className="hk-sheet-item" data-on={on || undefined}>
                <Icon size={22} strokeWidth={on ? 2.3 : 1.9} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>

        <div style={{ margin: '14px 12px 0', borderTop: '1px solid var(--c-border)', paddingTop: 8, display: 'flex', flexDirection: 'column' }}>
          <Link href="/settings" className="hk-sheet-row" aria-current={isActive(path, '/settings') ? 'page' : undefined}>
            <Settings size={18} /> Settings
          </Link>
          <button type="button" className="hk-sheet-row" onClick={cycle}>
            <ModeIcon size={18} /> Theme: {mode === 'auto' ? 'Automatic' : mode === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button type="button" className="hk-sheet-row" onClick={signOut} style={{ color: 'var(--c-red-text)' }}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
