'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Plus, X, Mail, Loader2, Copy, Check, Trash2, FileText, Send, LayoutTemplate, Wand2, Download, Printer } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import { printElementAsPdf } from '@/lib/print-pdf'
import type { CoverLetter } from '@/lib/supabase'

const TONE_OPTIONS = [
  { value: 'formal',    label: 'Formal',     desc: 'Polished, professional' },
  { value: 'confident', label: 'Confident',  desc: 'Bold, direct' },
  { value: 'casual',    label: 'Casual',     desc: 'Warm, conversational' },
] as const

type Tone  = 'formal' | 'confident' | 'casual'
type Mode  = 'freeform' | 'template'

const TEMPLATE_EXAMPLE = `Dear Hiring Team at {company name},

My name is {your full name}, a {your professional title with X years of experience in your main skill}. I've spent the past {relevant time period} building {brief description of your work focus that relates to the role}.

What drew me to {company name} specifically is {one specific thing about this company's product, mission, or engineering culture that genuinely interests you}.

At {most recent or most relevant company name}, I {built / led / designed} {a specific project or system — name it, describe what it did, and mention the tech stack}. This resulted in {a measurable outcome: performance improvement, users served, revenue impact, etc.}.

My experience with {top 2–3 skills directly from the job description} makes me confident I can {specific contribution you would make in the role}.

I'd love to bring this to {company name}. I'm available for a call at your convenience.`

export default function CoverLettersPage() {
  // Cached under '/api/cover-letters' — list of previously generated
  // letters loads instantly on revisit instead of starting from mock data.
  const { data, isLoading: lettersLoading, mutate } =
    useSWR<{ data: CoverLetter[] }>('/api/cover-letters', fetcher)
  const letters = data?.data ?? []

  const [modal, setModal]           = useState(false)
  const [mode, setMode]             = useState<Mode>('freeform')
  const [form, setForm]             = useState({ company: '', role: '', job_description: '', tone: 'formal' as Tone })
  const [template, setTemplate]     = useState('')
  const [generating, setGenerating] = useState(false)
  const [viewing, setViewing]       = useState<CoverLetter | null>(null)
  const [copied, setCopied]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Email send state
  const [sendModal, setSendModal]     = useState(false)
  const [emailTo, setEmailTo]         = useState('')
  const [sending, setSending]         = useState(false)
  const [sendError, setSendError]     = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)

  // Count {placeholders} in template
  const placeholderCount = (template.match(/\{[^{}]+\}/g) ?? []).length

  async function generate() {
    if (!form.company || !form.role || !form.job_description) return
    if (mode === 'template' && !template.trim()) return
    setGenerating(true)
    setError(null)
    try {
      const body: Record<string, string> = { ...form }
      if (mode === 'template' && template.trim()) body.template = template

      const res  = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      mutate(cur => ({ data: [json.cover_letter, ...(cur?.data ?? [])] }), { revalidate: false })
      setViewing(json.cover_letter)
      setModal(false)
      setForm({ company: '', role: '', job_description: '', tone: 'formal' })
      setTemplate('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function downloadLetter(letter: CoverLetter) {
    const el = document.querySelector('[data-letter-preview]') as HTMLElement | null
    if (!el) return
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ])
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/jpeg', 0.97)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width
    let y = 0
    pdf.addImage(imgData, 'JPEG', 0, y, imgW, imgH)
    let remaining = imgH - pageH
    while (remaining > 0) {
      y -= pageH
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, y, imgW, imgH)
      remaining -= pageH
    }
    const safeName = letter.title.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'cover-letter'
    pdf.save(`${safeName}.pdf`)
  }

  async function deleteLetter(id: string) {
    mutate(cur => ({ data: (cur?.data ?? []).filter(l => l.id !== id) }), { revalidate: false })
    if (viewing?.id === id) setViewing(null)
    await fetch(`/api/cover-letters?id=${id}`, { method: 'DELETE' })
  }

  function openSend() {
    setEmailTo(''); setSendError(null); setSendSuccess(false); setSendModal(true)
  }

  async function sendEmail() {
    if (!emailTo || !viewing) return
    setSending(true); setSendError(null)
    try {
      const htmlBody = `<div style="font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:40px 32px;color:#1a1a1a;line-height:1.8;font-size:15px;">
        ${viewing.content.split('\n\n').map(p => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, '<br/>')}</p>`).join('')}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
        <p style="font-size:12px;color:#6b7280;">Sent via <strong>HireKit</strong></p>
      </div>`
      const res  = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo, subject: viewing.title, html: htmlBody }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Send failed')
      setSendSuccess(true)
      setTimeout(() => { setSendModal(false); setSendSuccess(false) }, 2000)
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const canGenerate = !generating && form.company && form.role && form.job_description &&
    (mode === 'freeform' || template.trim())

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <div style={{ padding: '22px 32px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 3 }}>Cover Letters</h1>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>AI-generated letters — free-form or from your own template</p>
        </div>
        <button onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--r-md)', background: 'var(--c-coral)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          <Plus size={15} /> Generate Letter
        </button>
      </div>

      {/* Split layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Letter list */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--c-border)', overflowY: 'auto', padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {lettersLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0', color: 'var(--c-text-muted)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!lettersLoading && letters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--c-text-dim)', fontSize: 13 }}>No cover letters yet.<br />Generate your first one.</div>
          )}
          {letters.map(l => (
            <div key={l.id} onClick={() => setViewing(l)} style={{
              padding: '12px 14px', borderRadius: 'var(--r-lg)', cursor: 'pointer',
              background: viewing?.id === l.id ? 'var(--c-violet-dim)' : 'var(--c-bg-2)',
              border: `1px solid ${viewing?.id === l.id ? 'rgba(124,92,252,0.25)' : 'var(--c-border)'}`,
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (viewing?.id !== l.id) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)' }}
              onMouseLeave={e => { if (viewing?.id !== l.id) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3 }}>{l.title}</p>
                <button aria-label="Delete letter" onClick={e => { e.stopPropagation(); deleteLetter(l.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: 2, flexShrink: 0 }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, fontWeight: 600, background: l.status === 'final' ? 'rgba(0,168,133,0.1)' : 'rgba(124,92,252,0.1)', color: l.status === 'final' ? 'var(--c-teal)' : 'var(--c-violet)', textTransform: 'capitalize' }}>{l.status}</span>
                <span style={{ fontSize: 11, color: 'var(--c-text-dim)', textTransform: 'capitalize' }}>{l.tone}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginTop: 4 }}>
                {new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          ))}
        </div>

        {/* Preview panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
          {viewing ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)', marginBottom: 5 }}>{viewing.title}</h2>
                  <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--c-text-muted)' }}>
                    <span>Tone: <strong style={{ textTransform: 'capitalize' }}>{viewing.tone}</strong></span>
                    <span>·</span>
                    <span>{new Date(viewing.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => copyText(viewing.content)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', background: copied ? 'var(--c-teal)' : 'var(--c-bg-3)', border: '1px solid var(--c-border)', color: copied ? '#fff' : 'var(--c-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'var(--font-body)' }}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={() => downloadLetter(viewing)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <Download size={13} /> Download PDF
                  </button>
                  <button onClick={() => printElementAsPdf('[data-letter-preview]', viewing.title)} title="Selectable-text PDF that ATS systems can read" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <Printer size={13} /> ATS PDF
                  </button>
                  <button onClick={openSend} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 'var(--r-md)', background: 'var(--c-violet)', border: '1px solid transparent', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <Send size={13} /> Send via Email
                  </button>
                </div>
              </div>
              <div data-letter-preview="" style={{ background: '#ffffff', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: '40px 48px', fontSize: 14, lineHeight: 1.85, color: '#1a1a1a', whiteSpace: 'pre-wrap', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
                {viewing.content}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--c-text-dim)' }}>
              <Mail size={40} style={{ marginBottom: 14, opacity: 0.25 }} />
              <p style={{ fontSize: 14, fontWeight: 500 }}>Select a letter to preview</p>
              <p style={{ fontSize: 12, marginTop: 5 }}>or generate a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Generate Modal ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !generating && setModal(false)}>
          <div style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: '28px', width: 580, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>Generate Cover Letter</h2>
              <button aria-label="Close" onClick={() => !generating && setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', padding: 3, gap: 2, marginBottom: 20 }}>
              {([
                { key: 'freeform', icon: Wand2,          label: 'AI Free-form',  desc: 'AI writes it from scratch' },
                { key: 'template', icon: LayoutTemplate,  label: 'My Template',   desc: 'AI fills your {placeholders}' },
              ] as const).map(({ key, icon: Icon, label, desc }) => (
                <button key={key} onClick={() => setMode(key)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', borderRadius: 7, border: 'none',
                  background: mode === key ? 'var(--c-bg-2)' : 'transparent',
                  color: mode === key ? 'var(--c-text)' : 'var(--c-text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  boxShadow: mode === key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  <Icon size={14} style={{ color: mode === key ? 'var(--c-violet)' : 'var(--c-text-dim)', flexShrink: 0 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Company + Role */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <ModalField label="Company *" htmlFor="gen-company">
                  <input id="gen-company" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Andela" style={fieldInput} />
                </ModalField>
                <ModalField label="Role *" htmlFor="gen-role">
                  <input id="gen-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Fullstack Engineer" style={fieldInput} />
                </ModalField>
              </div>

              {/* Tone (only for free-form) */}
              {mode === 'freeform' && (
                <ModalField label="Tone" htmlFor="gen-tone">
                  <div id="gen-tone" style={{ display: 'flex', gap: 8 }}>
                    {TONE_OPTIONS.map(t => (
                      <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, tone: t.value }))} style={{
                        flex: 1, padding: '8px 10px', borderRadius: 'var(--r-md)',
                        border: `1px solid ${form.tone === t.value ? 'var(--c-coral)' : 'var(--c-border)'}`,
                        background: form.tone === t.value ? 'rgba(255,100,80,0.08)' : 'var(--c-bg-2)',
                        color: form.tone === t.value ? 'var(--c-coral)' : 'var(--c-text-muted)',
                        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{t.label}</div>
                        <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>{t.desc}</div>
                      </button>
                    ))}
                  </div>
                </ModalField>
              )}

              {/* Template textarea */}
              {mode === 'template' && (
                <ModalField label={`Your Template — ${placeholderCount} placeholder${placeholderCount !== 1 ? 's' : ''} detected`} htmlFor="gen-template">
                  <div style={{ marginBottom: 6, fontSize: 11, color: 'var(--c-text-dim)', lineHeight: 1.5 }}>
                    Write anything you want. Where you want AI to fill in content, type <code style={{ background: 'var(--c-bg-4)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{'{describe what you want here}'}</code>.
                  </div>
                  <textarea id="gen-template" value={template} onChange={e => setTemplate(e.target.value)}
                    placeholder={TEMPLATE_EXAMPLE}
                    rows={12} style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.65, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setTemplate(TEMPLATE_EXAMPLE)} style={{ fontSize: 10, color: 'var(--c-violet)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0, textDecoration: 'underline' }}>
                      Load example template
                    </button>
                  </div>
                </ModalField>
              )}

              {/* Job Description */}
              <ModalField label="Job Description *" htmlFor="gen-jd">
                <textarea id="gen-jd" value={form.job_description} onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))}
                  placeholder="Paste the full job description here — the AI uses exact keywords from it for ATS matching…"
                  rows={7} style={{ ...fieldInput, resize: 'vertical', lineHeight: 1.6 }} />
              </ModalField>
            </div>

            {/* Hint */}
            {mode === 'template' && placeholderCount > 0 && (
              <div style={{ background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.18)', borderRadius: 'var(--r-md)', padding: '8px 12px', marginTop: 12, fontSize: 11, color: 'var(--c-violet)' }}>
                The AI will fill <strong>{placeholderCount} placeholder{placeholderCount !== 1 ? 's' : ''}</strong> and leave the rest of your text exactly as written.
              </div>
            )}

            {error && (
              <div style={{ background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', color: 'var(--c-danger-text)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginTop: 12, fontSize: 13 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} disabled={generating} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={generate} disabled={!canGenerate} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 'var(--r-md)',
                background: canGenerate ? 'var(--c-coral)' : 'var(--c-bg-4)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: canGenerate ? 'pointer' : 'default',
                fontFamily: 'var(--font-body)', opacity: generating ? 0.7 : 1,
              }}>
                {generating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : mode === 'template' ? <LayoutTemplate size={14} /> : <FileText size={14} />}
                {generating ? 'Generating…' : mode === 'template' ? 'Fill Template' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send via Email Modal ── */}
      {sendModal && viewing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !sending && setSendModal(false)}>
          <div style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: '28px', width: 440 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>Send via Email</h2>
              <button aria-label="Close" onClick={() => !sending && setSendModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4 }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-text-dim)', marginBottom: 20 }}>Sending: <strong style={{ color: 'var(--c-text-muted)' }}>{viewing.title}</strong></p>
            <ModalField label="Recipient email *" htmlFor="send-to">
              <input id="send-to" type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="recruiter@company.com" disabled={sending || sendSuccess} style={fieldInput} autoFocus />
            </ModalField>
            {sendError && <div style={{ background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', color: 'var(--c-danger-text)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginTop: 14, fontSize: 13 }}>{sendError}</div>}
            {sendSuccess && <div style={{ background: 'rgba(0,168,133,0.08)', border: '1px solid rgba(0,168,133,0.3)', color: 'var(--c-teal)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginTop: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Check size={14} /> Email sent!</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setSendModal(false)} disabled={sending} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button onClick={sendEmail} disabled={sending || !emailTo || sendSuccess} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 'var(--r-md)', background: sending || !emailTo || sendSuccess ? 'var(--c-bg-4)' : 'var(--c-violet)', border: 'none', color: sending || !emailTo || sendSuccess ? 'var(--c-text-dim)' : '#fff', fontSize: 13, fontWeight: 600, cursor: sending || !emailTo || sendSuccess ? 'default' : 'pointer', fontFamily: 'var(--font-body)', opacity: sending ? 0.7 : 1 }}>
                {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const fieldInput: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-md)', color: 'var(--c-text)',
  fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)',
  boxSizing: 'border-box',
}

function ModalField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
