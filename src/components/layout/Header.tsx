'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Bell, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { useTheme } from '@/lib/useTheme'

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
      // Square edges on purpose. The curve in this layout belongs at the
      // interior corner where the chrome meets the content panel, not on the
      // bar itself — see ShellWrapper.
      background: 'var(--c-chrome)',
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
          <Sparkles size={16} color="#fff" fill="#fff" strokeWidth={2} />
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
      <IconButton label="Notifications">
        <Bell size={15} />
        <span style={{
          position: 'absolute', top: 8, right: 8,
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--c-coral)', border: '1.5px solid var(--c-chrome)',
        }} />
      </IconButton>

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
