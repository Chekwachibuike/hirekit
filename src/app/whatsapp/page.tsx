'use client'
import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare, Wifi, WifiOff, Loader2, RefreshCw,
  Power, Clock, Search,
} from 'lucide-react'

interface WaMessage {
  id: string
  from: string
  body: string
  timestamp: number
  chatName: string
}

interface WaStatus {
  ready: boolean
  qr: string | null
  qrDataUrl: string | null
  messageCount: number
  messages: WaMessage[]
  error?: string | null
}

const BASE_KEYWORDS = ['hiring', 'job', 'remote', 'role', 'developer', 'engineer', 'salary', 'position', 'opportunity', 'vacancy', 'apply', 'recruit', 'fullstack', 'frontend', 'backend', 'react', 'node']

export default function WhatsAppPage() {
  const [status, setStatus]           = useState<WaStatus | null>(null)
  const [loading, setLoading]         = useState(false)
  const [polling, setPolling]         = useState(false)
  const [filter, setFilter]           = useState<'all' | 'jobs'>('jobs')
  const [search, setSearch]           = useState('')
  const [extraKeywords, setExtraKeywords] = useState<string[]>([])
  const intervalRef                   = useRef<NodeJS.Timeout | null>(null)

  const allKeywords = [...BASE_KEYWORDS, ...extraKeywords]
  const isJobRelated = (text: string) => {
    const lower = text.toLowerCase()
    return allKeywords.some(kw => lower.includes(kw))
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/whatsapp')
      if (res.ok) setStatus(await res.json())
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchStatus()
    // Pull user's skills from personal-info and use them as extra job-filter keywords
    fetch('/api/personal-info')
      .then(r => r.json())
      .then(({ data }) => {
        if (Array.isArray(data?.skills) && data.skills.length > 0) {
          setExtraKeywords(data.skills.map((s: string) => s.toLowerCase().trim()).filter(Boolean))
        }
      })
      .catch(() => {})
  }, [])

  // Poll while connecting (waiting for QR scan or ready)
  useEffect(() => {
    if (polling) {
      intervalRef.current = setInterval(fetchStatus, 3000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [polling])

  // Stop polling when ready or when the client reports a startup failure
  useEffect(() => {
    if (status?.ready || status?.error) setPolling(false)
  }, [status?.ready, status?.error])

  async function connect() {
    setLoading(true)
    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      })
      setPolling(true)
      await fetchStatus()
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    setLoading(true)
    setPolling(false)
    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  const messages = status?.messages ?? []
  const filtered = messages
    .filter(m => filter === 'all' || isJobRelated(m.body))
    .filter(m => !search || m.body.toLowerCase().includes(search.toLowerCase()) || m.chatName.toLowerCase().includes(search.toLowerCase()))

  const isConnected = status?.ready
  const hasQr       = !!status?.qrDataUrl
  const isConnecting = !isConnected && (polling || hasQr)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            WhatsApp Monitor
          </h1>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>
            Monitors your chats for job listings and auto-detects opportunities
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchStatus} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--c-bg-3)', border: '1px solid var(--c-border)',
            color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
            <RefreshCw size={12} /> Refresh
          </button>

          {isConnected ? (
            <button onClick={disconnect} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 'var(--r-md)',
              background: 'rgba(224,50,85,0.08)', border: '1px solid rgba(224,50,85,0.25)',
              color: '#E03255', fontSize: 13, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
            }}>
              {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Power size={14} />}
              Disconnect
            </button>
          ) : (
            <button onClick={connect} disabled={loading || isConnecting} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 'var(--r-md)',
              background: loading || isConnecting ? 'var(--c-bg-4)' : 'var(--c-teal)',
              border: 'none', color: '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: loading || isConnecting ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', opacity: loading ? 0.7 : 1,
            }}>
              {loading || isConnecting
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Wifi size={14} />}
              {isConnecting ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Startup error banner */}
      {status?.error && !isConnected && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
          borderRadius: 'var(--r-lg)', padding: '14px 18px', marginBottom: 24,
          fontSize: 13, lineHeight: 1.6,
        }}>
          <strong style={{ display: 'block', marginBottom: 4 }}>WhatsApp couldn&apos;t start</strong>
          {status.error}
        </div>
      )}

      {/* Status card */}
      <div style={{
        background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-xl)', padding: '20px 24px',
        marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: isConnected ? 'rgba(0,168,133,0.12)' : isConnecting ? 'rgba(212,160,23,0.12)' : 'var(--c-bg-4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isConnected
            ? <Wifi size={20} color="var(--c-teal)" />
            : isConnecting
            ? <Loader2 size={20} color="var(--c-gold)" style={{ animation: 'spin 1s linear infinite' }} />
            : <WifiOff size={20} color="var(--c-text-dim)" />}
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 3 }}>
            {isConnected ? 'Connected & Monitoring' : isConnecting ? 'Waiting for QR scan…' : 'Not connected'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            {isConnected
              ? `${messages.length} messages captured · ${messages.filter(m => isJobRelated(m.body)).length} job-related`
              : isConnecting
              ? 'Scan the QR code below with your phone to link your WhatsApp'
              : 'Click Connect to start monitoring your WhatsApp chats for job opportunities'}
          </p>
        </div>

        {isConnected && (
          <div style={{ padding: '4px 12px', borderRadius: 999, background: 'rgba(0,168,133,0.1)', border: '1px solid rgba(0,168,133,0.2)', fontSize: 11, fontWeight: 700, color: 'var(--c-teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-teal)', display: 'inline-block', animation: 'pulse 2s ease infinite' }} />
            LIVE
          </div>
        )}
      </div>

      {/* QR code panel */}
      {hasQr && !isConnected && (
        <div style={{
          background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-xl)', padding: '28px',
          marginBottom: 24, display: 'flex', gap: 28, alignItems: 'center',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status.qrDataUrl!}
            alt="WhatsApp QR code"
            style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid var(--c-border)', flexShrink: 0 }}
          />
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>
              Scan with WhatsApp
            </h3>
            <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Open WhatsApp on your phone',
                'Tap Menu (⋮) or Settings',
                'Tap Linked Devices → Link a Device',
                'Point your camera at this QR code',
              ].map((step, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>{step}</li>
              ))}
            </ol>
            <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginTop: 12 }}>
              QR refreshes automatically · your session is saved locally
            </p>
          </div>
        </div>
      )}

      {/* Setup instructions (when disconnected and no QR) */}
      {!isConnected && !isConnecting && !hasQr && (
        <div style={{
          background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-xl)', padding: '24px',
          marginBottom: 24,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 12 }}>How it works</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { n: 1, text: 'Click Connect — this starts a background WhatsApp Web session' },
              { n: 2, text: 'Scan the QR code with your phone (one-time, session is saved)' },
              { n: 3, text: 'HireKit silently monitors incoming messages for job listings' },
              { n: 4, text: 'Job-related messages are flagged here — you can add them to Applications' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--c-violet)', flexShrink: 0 }}>{s.n}</div>
                <p style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.5, paddingTop: 2 }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {isConnected && (
        <>
          {/* Filter + search bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 3 }}>
              {(['jobs', 'all'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none',
                  background: filter === f ? 'var(--c-bg-4)' : 'transparent',
                  color: filter === f ? 'var(--c-text)' : 'var(--c-text-muted)',
                  fontSize: 12, fontWeight: filter === f ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize',
                }}>
                  {f === 'jobs' ? `Job Leads (${messages.filter(m => isJobRelated(m.body)).length})` : `All (${messages.length})`}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '6px 12px', flex: 1 }}>
              <Search size={13} color="var(--c-text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search messages…" style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--c-text)', fontSize: 13, width: '100%', fontFamily: 'var(--font-body)' }} />
            </div>
          </div>

          {/* Message list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--c-text-dim)' }}>
                <MessageSquare size={32} style={{ marginBottom: 10, opacity: 0.25 }} />
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {filter === 'jobs' ? 'No job-related messages yet' : 'No messages captured yet'}
                </p>
              </div>
            ) : (
              filtered.map(msg => (
                <div key={msg.id} style={{
                  background: 'var(--c-bg-2)', border: `1px solid ${isJobRelated(msg.body) ? 'rgba(124,92,252,0.18)' : 'var(--c-border)'}`,
                  borderRadius: 'var(--r-lg)', padding: '14px 16px',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = isJobRelated(msg.body) ? 'rgba(124,92,252,0.18)' : 'var(--c-border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--c-violet)' }}>
                        {msg.chatName.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{msg.chatName}</span>
                      {isJobRelated(msg.body) && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--c-violet-dim)', color: 'var(--c-violet)', fontWeight: 600, border: '1px solid rgba(124,92,252,0.15)' }}>
                          Job Lead
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--c-text-dim)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <Clock size={10} />
                      {new Date(msg.timestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                    {msg.body}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>
    </div>
  )
}
