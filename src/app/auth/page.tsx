'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Mail, Lock, Eye, EyeOff, Loader2, ArrowRight, User } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

type AuthMode = 'signin' | 'signup'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode]         = useState<AuthMode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [name, setName]         = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)

  // Redirect if already logged in
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()

    try {
      if (mode === 'signup') {
        const { error: signUpErr } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        })
        if (signUpErr) throw signUpErr
        setInfo('Check your email for a confirmation link, then sign in.')
        setMode('signin')
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) throw signInErr
        router.replace('/dashboard')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(m => m === 'signin' ? 'signup' : 'signin')
    setError(null)
    setInfo(null)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--c-bg)',
      fontFamily: 'var(--font-body)',
    }}>

      {/* ── Left panel — branding ── */}
      <div style={{
        width: '45%', flexShrink: 0,
        background: 'linear-gradient(145deg, #1a0a3c 0%, #2d1060 40%, #1a0a3c 100%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 56px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Orbs */}
        <div style={{ position: 'absolute', top: '15%', left: '5%',  width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,252,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '5%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,99,58,0.20) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '55%', left: '40%', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,168,133,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #7C5CFC, #F4633A)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} color="#fff" fill="white" />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>HireKit</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em' }}>Job Application Suite</div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 20 }}>
            Land the role<br />
            <span style={{ background: 'linear-gradient(90deg, #7C5CFC, #F4633A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              you deserve.
            </span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, maxWidth: 380 }}>
            AI-powered CV builder, cover letter generator, job tracker, and interview prep — all in one place.
          </p>
        </div>

        {/* Feature list */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            'ATS-optimised CVs curated from all your past CVs',
            'Cover letters with your template + AI placeholders',
            'Real-time job application tracker',
            'Google Calendar-style interview scheduler',
          ].map((feat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(124,92,252,0.25)', border: '1px solid rgba(124,92,252,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C5CFC' }} />
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--c-text-muted)' }}>
              {mode === 'signin'
                ? 'Sign in to continue your job search.'
                : 'Get started — it only takes a minute.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Name — sign up only */}
            {mode === 'signup' && (
              <FormField label="Full name" htmlFor="auth-name">
                <InputWrapper icon={<User size={15} />}>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Valour Onwuchekwa"
                    required
                    autoComplete="name"
                    style={inputStyle}
                  />
                </InputWrapper>
              </FormField>
            )}

            {/* Email */}
            <FormField label="Email address" htmlFor="auth-email">
              <InputWrapper icon={<Mail size={15} />}>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  style={inputStyle}
                />
              </InputWrapper>
            </FormField>

            {/* Password */}
            <FormField label="Password" htmlFor="auth-password">
              <InputWrapper icon={<Lock size={15} />} suffix={
                <button type="button" onClick={() => setShowPw(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: '0 12px', display: 'flex', alignItems: 'center' }} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }>
                <input
                  id="auth-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  style={inputStyle}
                />
              </InputWrapper>
            </FormField>

            {/* Errors / info */}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13 }}>
                {error}
              </div>
            )}
            {info && (
              <div style={{ background: 'rgba(0,168,133,0.08)', border: '1px solid rgba(0,168,133,0.25)', color: 'var(--c-teal)', borderRadius: 'var(--r-md)', padding: '10px 14px', fontSize: 13 }}>
                {info}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '12px', borderRadius: 'var(--r-md)',
                background: loading ? 'var(--c-bg-4)' : 'linear-gradient(135deg, var(--c-violet), var(--c-violet-deep))',
                border: 'none', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(124,92,252,0.35)',
                transition: 'all 0.2s',
                marginTop: 4,
              }}
            >
              {loading
                ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                : <ArrowRight size={16} />}
              {loading
                ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                : (mode === 'signin' ? 'Sign in' : 'Create account')}
            </button>
          </form>

          {/* Toggle */}
          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: 'var(--c-text-muted)' }}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={switchMode} style={{ background: 'none', border: 'none', color: 'var(--c-violet)', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', padding: 0, textDecoration: 'underline' }}>
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────
function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function InputWrapper({ icon, suffix, children }: { icon: React.ReactNode; suffix?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-md)', overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}
      onFocusCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-violet)'}
      onBlurCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'}
    >
      <span style={{ paddingLeft: 12, color: 'var(--c-text-dim)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      {children}
      {suffix}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '11px 12px',
  background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--c-text)', fontSize: 14,
  fontFamily: 'var(--font-body)',
}
