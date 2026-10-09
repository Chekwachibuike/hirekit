'use client'
import { useEffect, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { subscribePending, undoDelete, commitNow, flushPending, type PendingDelete } from '@/lib/undo'

// The Undo toasts for deleteWithUndo (src/lib/undo.ts). Mounted once in the
// app shell, bottom-left, away from the page's own floating banners.

export default function UndoToaster() {
  const [items, setItems] = useState<PendingDelete[]>([])

  useEffect(() => subscribePending(setItems), [])

  // Closing the window (or the desktop app) sends anything still pending.
  useEffect(() => {
    const onHide = () => flushPending()
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [])

  if (!items.length) return null
  return (
    <div role="status" aria-live="polite"
      style={{ position: 'fixed', left: 'calc(var(--sidebar-w) + 20px)', bottom: 20, zIndex: 400, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.slice(-3).map(t => (
        <div key={t.id} className="fade-up" style={{
          position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 10px 10px 14px', minWidth: 300, maxWidth: 420,
          background: 'var(--c-text)', color: 'var(--c-bg-2)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-lg)', fontSize: 13,
        }}>
          <Trash2 size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
          <button type="button" onClick={() => undoDelete(t.id)}
            style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 'var(--r-sm)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Undo
          </button>
          <button type="button" aria-label="Delete now" title="Delete now" onClick={() => commitNow(t.id)}
            style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.7, cursor: 'pointer', padding: 6, display: 'flex' }}>
            <X size={14} />
          </button>
          {/* Time left before the delete is sent */}
          <span aria-hidden style={{
            position: 'absolute', left: 0, bottom: 0, height: 2, width: '100%', background: 'currentColor', opacity: 0.35,
            transformOrigin: 'left', animation: `undoCountdown ${t.ms}ms linear forwards`,
          }} />
        </div>
      ))}
      <style>{`@keyframes undoCountdown { from { transform: scaleX(1) } to { transform: scaleX(0) } }`}</style>
    </div>
  )
}
