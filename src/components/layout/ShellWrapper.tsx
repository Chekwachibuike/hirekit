'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BriefcaseBusiness } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import Header from './Header'
import Sidebar from './Sidebar'

// ── Full-screen loader shown during the initial session check ──────────────
function AppLoader({ stage }: { stage: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 30,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'hk-fadeUp 0.4s ease both' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--c-violet) 0%, var(--c-coral) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-accent)',
        }}>
          <BriefcaseBusiness size={23} color="#fff" strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: 25, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.04em', fontFamily: 'var(--font-display)' }}>
          HireKit
        </span>
      </div>

      {/* Spinner */}
      <div style={{ position: 'relative', width: 42, height: 42, animation: 'hk-fadeUp 0.4s 0.1s ease both', opacity: 0 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--c-bg-4)' }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '3px solid transparent',
          borderTopColor: 'var(--c-violet)',
          animation: 'hk-spin 0.8s cubic-bezier(0.5,0.15,0.5,0.85) infinite',
        }} />
      </div>

      {/* Status text */}
      <div style={{ textAlign: 'center', animation: 'hk-fadeUp 0.4s 0.2s ease both', opacity: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)', fontFamily: 'var(--font-body)' }}>{stage}</p>
      </div>

      <style>{`
        @keyframes hk-spin    { to { transform: rotate(360deg); } }
        @keyframes hk-fadeUp  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  )
}

// ── Shell ──────────────────────────────────────────────────────────────────
export default function ShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const bare     = pathname.startsWith('/auth')

  // `ready` means: auth check passed, safe to render the protected shell.
  // Starts false (show loader) and only becomes true once a valid session is confirmed.
  // Bare pages (login/signup) skip the check entirely.
  const [ready,  setReady]  = useState(false)
  const [stage,  setStage]  = useState('Connecting…')

  useEffect(() => {
    if (bare) return

    const supabase = createSupabaseBrowserClient()
    setStage('Verifying your session…')

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setStage('Redirecting to sign-in…')
        router.replace('/auth')
      } else {
        setStage('Loading your workspace…')
        setReady(true)
      }
    })
  }, [bare, router])

  // Auth / sign-up pages — render with no shell
  if (bare) return <>{children}</>

  // Protected pages — show loader until session is confirmed
  if (!ready) return <AppLoader stage={stage} />

  return (
    <>
      <Header />
      {/* The surface colour here is what shows through main's rounded corner,
          so it matches the header and sidebar rather than leaking the body
          background. */}
      <div style={{ display: 'flex', flex: 1, paddingTop: 'var(--topbar-h)', background: 'var(--c-surface)' }}>
        <Sidebar />
        <main style={{
          marginLeft: 'var(--sidebar-w)',
          flex: 1,
          minHeight: 'calc(100vh - var(--topbar-h))',
          background: 'var(--c-bg)',
          // Shopify's signature move: the content area curves away from the
          // chrome at the one corner where the sidebar and header meet, so it
          // reads as a panel set into the frame instead of a flat region.
          borderTopLeftRadius: 'var(--r-xl)',
          borderLeft: '1px solid var(--c-border)',
          borderTop: '1px solid var(--c-border)',
        }}>
          {children}
        </main>
      </div>
    </>
  )
}
