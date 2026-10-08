'use client'
import { useState } from 'react'
import { BellRing, Loader2, RefreshCw, Trash2, ExternalLink, Play, Mail, MailX, Pause, Check, ChevronDown, ChevronRight } from 'lucide-react'

// Saved searches and what they found. New matches come from the daily run
// (and "Check now"); they stay marked new until the alert is opened here.

export interface AlertMatch {
  alert_id: string
  job_key: string
  title: string
  company: string | null
  location: string | null
  url: string
  source: string | null
  posted: string | null
  seen: boolean
  found_at: string
}

export interface JobAlert {
  id: string
  name: string
  params: string
  active: boolean
  email: boolean
  last_checked_at: string | null
  last_error: string | null
  newCount: number
  matches: AlertMatch[]
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
  return json
}

function ago(iso: string | null): string {
  if (!iso) return 'not checked yet'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export default function JobAlertsPanel({ alerts, emailConfigured, sourceLabel, onChanged, onRun, onClose }: {
  alerts: JobAlert[]
  emailConfigured: boolean
  sourceLabel: (s: string | null) => string | null
  onChanged: () => void
  onRun: (params: string) => void
  onClose: () => void
}) {
  const [open, setOpen] = useState<string | null>(alerts.find(a => a.newCount > 0)?.id ?? null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setErr(null)
    try { await fn(); onChanged() } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }

  function toggle(a: JobAlert) {
    const next = open === a.id ? null : a.id
    setOpen(next)
    // Opening an alert is reading it: its new matches stop being new.
    if (next && a.newCount > 0) act(`seen:${a.id}`, () => send('/api/job-alerts', 'PATCH', { seen: a.id }))
  }

  return (
    <div className="fade-up" style={{ margin: '14px 32px 0', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '16px 18px', boxShadow: 'var(--shadow-sm)', maxHeight: '48vh', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <BellRing size={14} color="var(--c-violet)" /> Job alerts
          </h2>
          <p style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 2 }}>
            Saved searches, checked every morning. New postings appear here and in the bell
            {emailConfigured ? ', and by email.' : '. (Email isn’t set up on this server, so no emails are sent.)'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {alerts.length > 0 && (
            <button type="button" style={btn} disabled={busy !== null}
              onClick={() => act('check', async () => {
                const r = await send('/api/job-alerts/check', 'POST')
                setNote(r.newMatches ? `${r.newMatches} new job${r.newMatches === 1 ? '' : 's'} found.` : 'Checked: nothing new since last time.')
              })}>
              {busy === 'check' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
              {busy === 'check' ? 'Checking…' : 'Check now'}
            </button>
          )}
          <button type="button" style={btn} onClick={onClose}>Close</button>
        </div>
      </div>

      {note && <p style={{ fontSize: 12, color: 'var(--c-teal)', marginBottom: 8 }}>{note}</p>}
      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger-text)', marginBottom: 8 }}>{err}</p>}

      {alerts.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--c-text-dim)', padding: '10px 0' }}>
          No alerts yet. Search for something, e.g. &ldquo;graduate trainee&rdquo; in Nigeria or &ldquo;electrical engineer&rdquo;,
          then press <strong>Alert me</strong> to be told when new ones are posted.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alerts.map(a => {
            const isOpen = open === a.id
            return (
              <div key={a.id} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-bg-3)', opacity: a.active ? 1 : 0.65 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                  <button type="button" onClick={() => toggle(a)} aria-expanded={isOpen}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: 'var(--c-text)' }}>
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    {a.newCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--c-violet)', color: '#fff', flexShrink: 0 }}>
                        {a.newCount} new
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: a.last_error ? 'var(--c-danger-text)' : 'var(--c-text-dim)', flexShrink: 0 }}>
                      {a.active ? `checked ${ago(a.last_checked_at)}` : 'paused'}{a.last_error ? ' · last check failed' : ''}
                    </span>
                  </button>
                  <IconBtn label="Run this search" onClick={() => onRun(a.params)}><Play size={12} /></IconBtn>
                  {emailConfigured && (
                    <IconBtn label={a.email ? 'Email on (click to turn off)' : 'Email off (click to turn on)'}
                      onClick={() => act(`email:${a.id}`, () => send('/api/job-alerts', 'PATCH', { id: a.id, email: !a.email }))}>
                      {a.email ? <Mail size={12} /> : <MailX size={12} />}
                    </IconBtn>
                  )}
                  <IconBtn label={a.active ? 'Pause' : 'Resume'} onClick={() => act(`active:${a.id}`, () => send('/api/job-alerts', 'PATCH', { id: a.id, active: !a.active }))}>
                    {a.active ? <Pause size={12} /> : <Check size={12} />}
                  </IconBtn>
                  <IconBtn label="Delete alert" danger onClick={() => confirm(`Delete the alert "${a.name}"?`) && act(`del:${a.id}`, () => send(`/api/job-alerts?id=${a.id}`, 'DELETE'))}>
                    <Trash2 size={12} />
                  </IconBtn>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--c-border)', padding: '6px 12px 10px' }}>
                    {a.matches.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--c-text-dim)', padding: '6px 0' }}>Nothing found yet. New postings will appear here.</p>
                    ) : a.matches.map(m => (
                      <a key={m.job_key} href={m.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0', textDecoration: 'none', borderBottom: '1px solid var(--c-border)' }}>
                        {!m.seen && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--c-violet)', letterSpacing: '0.06em' }}>NEW</span>}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>{m.title}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--c-text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[m.company, m.location, sourceLabel(m.source)].filter(Boolean).join(' · ')}
                        </span>
                        <ExternalLink size={11} color="var(--c-text-dim)" style={{ flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 'var(--r-md)',
  background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 6, color: danger ? 'var(--c-danger-text)' : 'var(--c-text-muted)', display: 'flex', flexShrink: 0 }}>
      {children}
    </button>
  )
}
