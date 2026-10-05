'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { useTheme } from '@/lib/useTheme'
import NotificationBell from './NotificationBell'

function IconButton({ label, onClick, title, children }: {
  label: string; onClick?: () => void; title?: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      style={{
        width: 36, height: 36, borderRadius: 'var(--r-md)',
        background: 'transparent', border: '1px solid var(--c-chrome-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--c-chrome-muted)',
        transition: 'all 0.15s', position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--c-chrome-hover)'
        e.currentTarget.style.color = 'var(--c-chrome-text)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--c-chrome-muted)'
      }}
    >
      {children}
    </button>
  )
}

export default function Header() {
  const router = useRouter()
  const { mode, cycle } = useTheme()
  const [initial, setInitial] = useState('U')

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      const name = user.user_metadata?.full_name as string | undefined
      setInitial((name ? name[0] : user.email?.[0] ?? 'U').toUpperCase())
    })
  }, [])

  async function signOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace('/auth')
  }

  const ModeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: 'var(--topbar-h)',
      // Square and flush. The bar is its own band; the panels BELOW it carry
      // the curves (sidebar top-left, content top-right), and this colour is
      // what fills the corners they leave behind — which is what produces the
      // inverted outer curve where the header meets them.
      background: 'var(--c-chrome-bar)',
      display: 'flex', alignItems: 'center',
      padding: '0 18px',
      zIndex: 100, gap: 10,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginRight: 'auto', paddingLeft: 2 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 'var(--r-md)',
          background: 'linear-gradient(135deg, var(--c-violet) 0%, var(--c-coral) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-accent)',
        }}>
          {/* Matches the app icon (design/icon.svg) and the loader mark. */}
          <BriefcaseBusiness size={17} color="#fff" strokeWidth={2.3} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-chrome-text)', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'var(--font-display)' }}>HireKit</div>
          <div style={{ fontSize: 10, color: 'var(--c-chrome-dim)', letterSpacing: '0.06em', marginTop: 1 }}>JOB SUITE</div>
        </div>
      </div>

      {/* Theme toggle */}
      <IconButton label="Toggle color mode" title={`Theme: ${mode}`} onClick={cycle}>
        <ModeIcon size={15} />
      </IconButton>

      {/* Notifications */}
      <NotificationBell />

      <div style={{ width: 1, height: 22, background: 'var(--c-chrome-border)', margin: '0 3px' }} />

      {/* Avatar */}
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--c-violet) 0%, var(--c-coral) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13.5, fontWeight: 700, color: '#fff',
        flexShrink: 0, boxShadow: 'var(--shadow-sm)',
      }}>
        {initial}
      </div>

      {/* Sign out */}
      <IconButton label="Sign out" onClick={signOut}>
        <LogOut size={15} />
      </IconButton>
    </header>
  )
}
