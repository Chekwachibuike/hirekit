'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import {
  UserCircle, LogOut, Calendar, MessageSquare, Mail,
  ExternalLink, Check, X, Loader2, FileText,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { fetcher } from '@/lib/fetcher'
import { clearPersistentState } from '@/lib/usePersistentState'

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail]       = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  // Integration statuses (best-effort — cards degrade gracefully if a check fails)
  const { data: googleStatus } = useSWR<{ connected: boolean }>('/api/calendar/google/status', fetcher)
  const { data: waStatus }     = useSWR<{ ready: boolean }>('/api/whatsapp', fetcher)
  const { data: caps }         = useSWR<{ email: boolean }>('/api/capabilities', fetcher)

  useEffect(() => {
    createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null)
    })
  }, [])

  async function signOut() {
    setSigningOut(true)
    await createSupabaseBrowserClient().auth.signOut()
    // Saved searches and practice answers belong to this account.
    clearPersistentState()
    router.replace('/auth')
  }

  const integrations = [
    {
      name: 'Google Calendar',
      icon: Calendar,
      connected: !!googleStatus?.connected,
      desc: 'Events sync to your Google Calendar automatically',
      href: '/calendar',
      action: 'Manage on Calendar page',
    },
    {
      name: 'WhatsApp Monitor',
      icon: MessageSquare,
      connected: !!waStatus?.ready,
      desc: 'Watches your chats for job opportunities',
      href: '/whatsapp',
      action: 'Manage on WhatsApp page',
    },
    {
      // A server setting, not something each account connects: the label
      // says so, rather than claiming every user is "Connected".
      name: 'Email sending',
      icon: Mail,
      connected: !!caps?.email,
      labels: ['Set up on server', 'Not set up'] as const,
      desc: caps?.email
        ? 'Cover letters and job-alert emails are sent from the server\u2019s Gmail account'
        : 'Set GMAIL_USER and GMAIL_APP_PASSWORD on the server to send cover letters and alert emails',
      href: '/cover-letters',
      action: 'Configured on the server',
    },
  ]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 720 }}>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>Account, integrations, and resources</p>
      </div>

      {/* Account */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Account</p>
      <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '18px 22px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <UserCircle size={22} color="var(--c-violet)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
            {email ?? 'Loading…'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 2 }}>Signed in via Supabase Auth</p>
        </div>
        <button onClick={signOut} disabled={signingOut} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 16px', borderRadius: 'var(--r-md)',
          background: 'rgba(224,50,85,0.08)', border: '1px solid rgba(224,50,85,0.25)',
          color: 'var(--c-red)', fontSize: 13, fontWeight: 600,
          cursor: signingOut ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
        }}>
          {signingOut ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={14} />}
          Sign out
        </button>
      </div>

      {/* Integrations */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Integrations</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {integrations.map(item => (
          <Link key={item.name} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-lg)', padding: '14px 18px',
            textDecoration: 'none', transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'}
          >
            <item.icon size={18} color="var(--c-text-muted)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{item.name}</p>
              <p style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 1 }}>{item.desc}</p>
            </div>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, flexShrink: 0,
              background: item.connected ? 'rgba(0,168,133,0.1)' : 'var(--c-bg-4)',
              color: item.connected ? 'var(--c-teal)' : 'var(--c-text-dim)',
              border: `1px solid ${item.connected ? 'rgba(0,168,133,0.2)' : 'var(--c-border)'}`,
            }}>
              {item.connected ? <Check size={11} /> : <X size={11} />}
              {'labels' in item && item.labels ? item.labels[item.connected ? 0 : 1] : item.connected ? 'Connected' : 'Not connected'}
            </span>
          </Link>
        ))}
      </div>

      {/* Resources */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Resources</p>
      <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <FileText size={18} color="var(--c-text-muted)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Portable AI assistant prompt</p>
          <p style={{ fontSize: 12, color: 'var(--c-text-dim)', marginTop: 1 }}>
            Use HireKit&apos;s workflow in any AI chat — see <code style={{ fontSize: 11, background: 'var(--c-bg-4)', padding: '1px 6px', borderRadius: 4 }}>docs/AI-JOB-ASSISTANT-PROMPT.md</code> in the project folder
          </p>
        </div>
        <ExternalLink size={13} color="var(--c-text-dim)" style={{ flexShrink: 0 }} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
