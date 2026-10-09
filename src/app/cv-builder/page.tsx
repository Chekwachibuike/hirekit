'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useDialog } from '@/lib/useDialog'
import { useDropzone } from 'react-dropzone'
import useSWR, { mutate as globalMutate } from 'swr'
import {
  Loader2, Zap, Copy, Check, FileText, Eye, Edit3,
  ArrowRight, Upload, Trash2, Plus, Clock, X, Sparkles, Download, ImageDown,
  ArrowLeft, ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { fetcher } from '@/lib/fetcher'
import { printElementAsPdf } from '@/lib/print-pdf'
import { deleteWithUndo } from '@/lib/undo'
import type { CvVersion, PersonalInfo } from '@/lib/supabase'
import { takeCvTailorRequest, MIN_DESCRIPTION_CHARS, type CvTailorRequest } from '@/lib/cv-tailor-handoff'

// Scans canvas pixel rows near each page boundary to find a mostly-white
// row (a gap between sections) so we never cut through text mid-glyph.
function findSafeCuts(canvas: HTMLCanvasElement, pageHpx: number): number[] {
  const ctx = canvas.getContext('2d')!
  const points: number[] = [0]
  let from = 0
  while (from + pageHpx < canvas.height) {
    const ideal = from + pageHpx
    const lo = Math.max(from + Math.floor(pageHpx * 0.85), ideal - 60)
    const hi = Math.min(canvas.height, ideal + 60)
    const { data } = ctx.getImageData(0, lo, canvas.width, hi - lo)
    let bestRow = ideal
    let bestScore = -1
    for (let r = 0; r < hi - lo; r++) {
      let white = 0
      for (let c = 0; c < canvas.width; c++) {
        const idx = (r * canvas.width + c) * 4
        if (data[idx] > 248 && data[idx + 1] > 248 && data[idx + 2] > 248) white++
      }
      if (white > bestScore) { bestScore = white; bestRow = lo + r }
    }
    points.push(bestRow)
    from = bestRow
  }
  points.push(canvas.height)
  return points
}

// ── Placeholder ───────────────────────────────────────────────
const PLACEHOLDER = `# Your Name
Full-Stack Developer · Software Engineer
your@email.com · +234 000 0000 · Lagos, Nigeria · github.com/you

## Summary
A brief professional summary will appear here. Click **Generate for Role** or upload a PDF to get started — the AI tailors sections, skill groupings, and keywords to the target role (fullstack, QA automation, embedded, engineering) and keeps everything ATS-readable.

## Technical Skills
**Languages:** TypeScript, JavaScript, SQL
**Frontend:** React, Next.js, responsive UI development
**Backend:** Node.js, REST API design, Supabase (Postgres, RLS, Auth)

## Experience

Senior Frontend Engineer — Acme Corp | Jan 2023 – Present
- Built and shipped X feature, reducing load time by 40%
- Led a team of 4 engineers to deliver Y project on time

Software Engineer — Startup Inc | Mar 2021 – Dec 2022
- Architected the real-time notifications system used by 50k+ users
- Migrated legacy codebase to TypeScript, eliminating 300+ runtime errors

## Projects

HireKit — Job Application Suite | Next.js, Supabase, AI
- Built a personal job-search tool combining CV generation, ATS optimization, and cover letter generation

## Education
B.Sc. Computer Science, University of Lagos (2021) — First Class Honours`

// ── Markdown renderer ─────────────────────────────────────────
// Styled after the classic professional resume look: Word-blue section
// headings with a full-width rule, centered caps name + blue subtitle,
// right-aligned dates, italic blue tech stacks, justified body text.

const CV_BLUE = '#2E74B5'   // classic Word heading blue
const CV_FONT = 'Calibri, Carlito, "Segoe UI", "Trebuchet MS", sans-serif'

// Handles **bold**, *italic* and [text](url) inline patterns
function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} style={{ fontWeight: 700, color: '#111' }}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
          return <em key={i} style={{ color: CV_BLUE }}>{part.slice(1, -1)}</em>
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link)
          return <span key={i} style={{ color: CV_BLUE }}>{link[2]}</span>
        return part
      })}
    </>
  )
}

// "Role — Company | Jan 2023 – Present"  →  ["Role — Company", "Jan 2023 – Present"]
// "Project Title | React, Node.js"       →  ["Project Title", "React, Node.js"]
function splitTitleRow(line: string): [string, string] | null {
  const idx = line.lastIndexOf(' | ')
  if (idx <= 0 || line.length > 120) return null
  return [line.slice(0, idx).trim(), line.slice(idx + 3).trim()]
}

function CVPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const nodes: React.ReactNode[] = []
  const listBuf: React.ReactNode[] = []
  let headerZone = true   // everything before the first "## " section

  function flushList(key: string) {
    if (!listBuf.length) return
    nodes.push(
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '5px 0 9px' }}>
        {listBuf.splice(0)}
      </div>
    )
  }

  lines.forEach((line, i) => {
    const key = String(i)

    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuf.push(
        <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color: '#333', fontSize: 13, lineHeight: '1.65', flexShrink: 0 }}>•</span>
          <span style={{ fontSize: 13, lineHeight: 1.65, color: '#1f2937', textAlign: 'left', flex: 1 }}>{parseInline(line.slice(2))}</span>
        </div>
      )
      return
    }

    flushList(`fl-${i}`)

    if (line.startsWith('# ')) {
      nodes.push(
        <h1 key={key} style={{
          textAlign: 'center', fontSize: 25, fontWeight: 700, color: '#111',
          textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.2, margin: 0,
        }}>
          {line.slice(2)}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      headerZone = false
      nodes.push(
        <p key={key} style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: CV_BLUE, borderBottom: `1.5px solid ${CV_BLUE}`,
          paddingBottom: 3, margin: '22px 0 10px',
        }}>
          {line.slice(3)}
        </p>
      )
    } else if (line.startsWith('### ')) {
      nodes.push(
        <p key={key} style={{ fontSize: 13.5, fontWeight: 700, color: '#111', margin: '12px 0 3px' }}>
          {parseInline(line.slice(4))}
        </p>
      )
    } else if (line.startsWith('---')) {
      nodes.push(<hr key={key} style={{ border: 'none', borderTop: '1px solid #d1d5db', margin: '14px 0' }} />)
    } else if (line.trim() === '') {
      nodes.push(<div key={key} style={{ height: 6 }} />)
    } else if (headerZone) {
      // Between the name and the first section: contact line(s) and/or a
      // professional-title subtitle ("Full-Stack Developer · Backend Engineer")
      const isContact = /@|https?:\/\/|linkedin\.com|github\.com|\+?\d{7,}/i.test(line) || line.includes('|')
      nodes.push(
        <p key={key} style={{
          textAlign: 'center', margin: isContact ? '5px 0 0' : '6px 0 0',
          fontSize: isContact ? 11.5 : 14,
          fontWeight: isContact ? 400 : 600,
          color: isContact ? '#555' : CV_BLUE,
          lineHeight: 1.5,
        }}>
          {parseInline(line)}
        </p>
      )
    } else {
      // Title rows: "Role — Company | dates" or "Project Title | Tech Stack".
      // Dates (contain digits) go right-aligned in gray; tech stacks in italic blue.
      const row = splitTitleRow(line)
      if (row) {
        const [main, side] = row
        const sideIsDate = /\d/.test(side)
        nodes.push(
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, margin: '12px 0 2px' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111' }}>{parseInline(main)}</span>
            <span style={{
              flexShrink: 0, fontSize: 12,
              color: sideIsDate ? '#555' : CV_BLUE,
              fontStyle: sideIsDate ? 'normal' : 'italic',
            }}>{side}</span>
          </div>
        )
      } else {
        nodes.push(
          <p key={key} style={{ fontSize: 13, color: '#1f2937', textAlign: 'left', lineHeight: 1.7, margin: '2px 0' }}>
            {parseInline(line)}
          </p>
        )
      }
    }
  })

  flushList('fl-end')

  return (
    <div data-cv-preview="" style={{
      maxWidth: 720, margin: '0 auto',
      background: '#fff',
      boxShadow: '0 4px 40px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
      borderRadius: 6,
      padding: '48px 54px 56px',
      minHeight: 900,
      fontFamily: CV_FONT,
    }}>
      {nodes}
    </div>
  )
}

// ── Version item ──────────────────────────────────────────────

function VersionItem({
  v, active, loading,
  onLoad, onDelete,
}: {
  v: Pick<CvVersion, 'id' | 'label' | 'created_at'>
  active: boolean
  loading: boolean
  onLoad: () => void
  onDelete: () => void
}) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
      background: active ? 'var(--c-violet-dim)' : 'var(--c-bg-3)',
      border: `1px solid ${active ? 'rgba(124,92,252,0.25)' : 'var(--c-border)'}`,
      transition: 'all 0.15s',
    }}
      onClick={onLoad}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v.label}
          </p>
          <p style={{ fontSize: 10, color: 'var(--c-text-dim)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />
            {new Date(v.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
          </p>
        </div>
        <button
          aria-label="Delete version"
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: '2px 3px', borderRadius: 4, flexShrink: 0, marginLeft: 4 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-red)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-text-dim)'}
        >
          {loading ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={11} />}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────

export default function CVBuilderPage() {
  const [markdown, setMarkdown]     = useState('')
  const [tab, setTab]               = useState<'edit' | 'preview'>('preview')
  const [copied, setCopied]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)

  const [versions, setVersions]     = useState<Pick<CvVersion, 'id' | 'label' | 'created_at'>[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [uploadErr, setUploadErr]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingVersion, setSavingVersion] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [pendingPdf, setPendingPdf] = useState(false)
  const labelRef = useRef<HTMLInputElement>(null)

  // Generate-for-role modal
  const [genModal, setGenModal]   = useState(false)
  const genRef = useRef<HTMLDivElement>(null)
  const [genForm, setGenForm]     = useState({ role: '', company: '', job_description: '' })
  const [sourcesUsed, setSourcesUsed] = useState<number | null>(null)

  // Set when the CV was tailored to a job picked in Job Search; drives the
  // "Tailored for…" bar and its links back to the posting and the search.
  const [tailoredFor, setTailoredFor] = useState<CvTailorRequest | null>(null)
  // A job handed over without a usable description waits here while the
  // user pastes one into the pre-filled form.
  const pendingTailor = useRef<CvTailorRequest | null>(null)

  // ── Load current CV + version list ─────────────────────────
  // Cached under these two /api/* keys — shared with the personal-info page,
  // so a saved profile shows up here without an extra fetch, and revisiting
  // this page after the first load is instant instead of refetching from zero.
  const { data: infoData } = useSWR<{ data: PersonalInfo | null }>('/api/personal-info', fetcher)
  const { data: versionsData } = useSWR<{ data: Pick<CvVersion, 'id' | 'label' | 'created_at'>[] }>('/api/cv-versions', fetcher)

  const seeded = useRef(false)
  useEffect(() => {
    if (infoData === undefined || versionsData === undefined || seeded.current) return
    setMarkdown(infoData.data?.cv_markdown || PLACEHOLDER)
    setVersions(versionsData.data ?? [])
    setPageLoading(false)
    seeded.current = true
  }, [infoData, versionsData])

  // Cancelling the pre-filled form drops the handed-over job, so a later
  // manual Generate is not labelled with it.
  function closeGenModal() {
    setGenModal(false)
    if (pendingTailor.current) {
      pendingTailor.current = null
      setGenForm({ role: '', company: '', job_description: '' })
    }
  }
  useDialog(genRef, closeGenModal, genModal)

  // ── Tailor request from Job Search ─────────────────────────
  // Runs once the CV and versions have loaded: the seeding effect above sets
  // the editor content, and must not land on top of the curated CV.
  const tookTailor = useRef(false)
  useEffect(() => {
    if (pageLoading || tookTailor.current) return
    tookTailor.current = true
    const req = takeCvTailorRequest()
    if (!req) return
    if (req.job_description.trim().length >= MIN_DESCRIPTION_CHARS) {
      setTailoredFor(req)
      setTab('preview')
      generate({ role: req.role, company: req.company, job_description: req.job_description })
    } else {
      // No usable description came with the job (some listings only link
      // out). Open the form pre-filled so only the description is missing.
      pendingTailor.current = req
      setGenForm({ role: req.role, company: req.company, job_description: req.job_description })
      setGenModal(true)
    }
    // generate is recreated each render; this must run once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoading])

  // ── Upload drop handler ────────────────────────────────────
  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setUploading(true)
    setUploadErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload/cv', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      const newMd = json.parsed?.cv_markdown || ''
      setMarkdown(newMd)
      setTab('preview')
      // Refresh versions list
      const vRes = await fetch('/api/cv-versions')
      const vJson = await vRes.json()
      setVersions(vJson.data ?? [])
      globalMutate('/api/cv-versions', vJson, { revalidate: false })
      if (vJson.data?.[0]) setActiveId(vJson.data[0].id)
    } catch (e: unknown) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false, disabled: uploading,
  })

  // ── Load a version ─────────────────────────────────────────
  async function loadVersion(id: string) {
    setActiveId(id)
    try {
      const res = await fetch('/api/cv-versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (res.ok && json.cv_markdown) {
        setMarkdown(json.cv_markdown)
        setTab('preview')
      }
    } catch { /* silent */ }
  }

  // ── Delete a version ───────────────────────────────────────
  async function deleteVersion(id: string) {
    const version = versions.find(v => v.id === id)
    try {
      deleteWithUndo({
        label: `Deleted CV version ${version ? `"${version.label}"` : ''}`.trim(),
        remove: () => {
          setVersions(prev => prev.filter(v => v.id !== id))
          globalMutate('/api/cv-versions', (cur: { data: typeof versions } | undefined) =>
            cur ? { data: cur.data.filter(v => v.id !== id) } : cur, { revalidate: false })
          if (activeId === id) setActiveId(null)
        },
        restore: async () => {
          const json = await (await fetch('/api/cv-versions')).json()
          setVersions(json.data ?? [])
          globalMutate('/api/cv-versions', json, { revalidate: false })
        },
        commit: () => fetch(`/api/cv-versions?id=${id}`, { method: 'DELETE', keepalive: true }),
      })
    } finally {
      setDeletingId(null)
    }
  }

  // ── Save current editor content as a new version ───────────
  async function saveAsVersion() {
    const label = labelRef.current?.value.trim() || `CV — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    setSavingVersion(true)
    try {
      const res = await fetch('/api/cv-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, cv_markdown: markdown }),
      })
      const json = await res.json()
      if (res.ok && json.data) {
        setVersions(prev => [json.data, ...prev])
        globalMutate('/api/cv-versions', (cur: { data: typeof versions } | undefined) =>
          ({ data: [json.data, ...(cur?.data ?? [])] }), { revalidate: false })
        setActiveId(json.data.id)
        if (labelRef.current) labelRef.current.value = ''
      }
    } finally {
      setSavingVersion(false)
    }
  }

  // ── Generate for role (multi-CV curation) ─────────────────
  async function generate(form: { role: string; company: string; job_description: string } = genForm) {
    if (!form.role || !form.job_description) return
    setGenerating(true)
    setError(null)
    setGenModal(false)
    if (pendingTailor.current) {
      // The job from Job Search, now with the pasted description.
      setTailoredFor({ ...pendingTailor.current, ...form })
      pendingTailor.current = null
    } else if (form === genForm) {
      // A manual run from the modal is not tied to a searched job.
      setTailoredFor(null)
    }
    try {
      const res = await fetch('/api/ai/cv-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: form.role, company: form.company, job_description: form.job_description }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      setMarkdown(json.cv_markdown)
      setSourcesUsed(json.sources_used ?? null)
      setTab('preview')
      // Refresh versions list to show the new AI-curated version
      const vRes = await fetch('/api/cv-versions')
      const vJson = await vRes.json()
      setVersions(vJson.data ?? [])
      globalMutate('/api/cv-versions', vJson, { revalidate: false })
      if (vJson.data?.[0]) setActiveId(vJson.data[0].id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
      setGenForm({ role: '', company: '', job_description: '' })
    }
  }

  // ── Save to profile ────────────────────────────────────────
  async function saveToProfile() {
    setSaved(false)
    try {
      const infoRes = await fetch('/api/personal-info')
      const { data: current } = await infoRes.json()
      const res = await fetch('/api/personal-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(current ?? {}), cv_markdown: markdown }),
      })
      const json = await res.json()
      // Keep the cache in sync so the personal-info page shows the new
      // cv_markdown immediately instead of the value from before this save.
      if (res.ok) globalMutate('/api/personal-info', json, { revalidate: false })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch { /* silent */ }
  }

  function copy() {
    navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Fires after React has painted the preview tab — guarantees [data-cv-preview] is in DOM
  useEffect(() => {
    if (!pendingPdf) return
    const el = document.querySelector('[data-cv-preview]') as HTMLElement | null
    if (!el) { setPendingPdf(false); setDownloading(false); return }

    ;(async () => {
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas'),
          import('jspdf'),
        ])
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        })

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()   // 210 mm
        const pageH = pdf.internal.pageSize.getHeight()  // 297 mm

        // The card element is captured at scale 2, so canvas.width = CSS px × 2.
        // Convert back to screen mm (96 dpi): CSS px → inches → mm.
        // This is the natural width of the card at screen resolution — text will match preview exactly.
        const naturalW = (canvas.width / 2) / 96 * 25.4  // ≈ 180 mm for a 680px card
        const xMargin  = (pageW - naturalW) / 2            // ≈ 15 mm side margins (centres on A4)

        // Page height in canvas pixels at the natural (96 dpi) scale
        const pxPerMm  = canvas.width / naturalW           // ≈ 7.56 canvas px per mm
        const pageHpx  = Math.floor(pageH * pxPerMm)       // ≈ 2244 px per A4 page

        // Card CSS padding-top = 52 px → 104 px at 2× scale.
        // Page 1: card's own padding is the header — start content at y=0.
        // Pages 2+: insert headerPx of white so all pages share the same header gap.
        const headerPx   = 104
        const footerPx   = 104
        const contentHpx = pageHpx - headerPx - footerPx

        const cuts = findSafeCuts(canvas, contentHpx)

        cuts.slice(0, -1).forEach((startPx, idx) => {
          if (idx > 0) pdf.addPage()
          const endPx  = Math.min(cuts[idx + 1], canvas.height)
          const sliceH = endPx - startPx

          const slice = document.createElement('canvas')
          slice.width  = canvas.width
          slice.height = pageHpx
          const ctx = slice.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, slice.width, slice.height)

          const yDst = idx === 0 ? 0 : headerPx
          ctx.drawImage(canvas, 0, startPx, canvas.width, sliceH, 0, yDst, canvas.width, sliceH)

          // xMargin centres the content; naturalW keeps text at preview size
          pdf.addImage(slice.toDataURL('image/jpeg', 0.97), 'JPEG', xMargin, 0, naturalW, pageH)
        })

        pdf.save('cv.pdf')
      } finally {
        setPendingPdf(false)
        setDownloading(false)
      }
    })()
  }, [pendingPdf])

  function downloadPdf() {
    if (downloading) return
    setDownloading(true)
    setTab('preview')   // ensure preview is rendered
    setPendingPdf(true) // effect fires after paint
  }

  // ATS-friendly export: browser print engine → real selectable text that
  // Applicant Tracking Systems can parse (the image PDF above reads as empty
  // to them). User picks "Save as PDF" in the print dialog.
  function downloadAtsPdf() {
    setTab('preview')
    const label = versions.find(v => v.id === activeId)?.label ?? 'CV'
    setTimeout(() => printElementAsPdf('[data-cv-preview]', label), 200)
  }

  if (pageLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: 'var(--c-text-muted)' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', overflow: 'hidden' }}>

      {/* ── Left: Versions sidebar ── */}
      <div style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--c-bg-2)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', marginBottom: 10 }}>CV Versions</h2>

          {/* Drop zone */}
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--c-violet)' : 'var(--c-border)'}`,
              borderRadius: 'var(--r-md)',
              padding: '12px 10px',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: isDragActive ? 'var(--c-violet-dim)' : 'var(--c-bg-3)',
              transition: 'all 0.15s',
            }}
          >
            <input {...getInputProps()} aria-label="Upload a CV (PDF)" />
            {uploading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--c-violet)' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 11 }}>Parsing…</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <Upload size={18} color={isDragActive ? 'var(--c-violet)' : 'var(--c-text-dim)'} />
                <span style={{ fontSize: 11, color: 'var(--c-text-muted)', fontWeight: 500 }}>
                  {isDragActive ? 'Drop to parse' : 'Upload CV (PDF)'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--c-text-dim)' }}>Drop or click · max 5 MB</span>
              </div>
            )}
          </div>

          {uploadErr && (
            <p style={{ fontSize: 11, color: 'var(--c-danger-text)', marginTop: 6, padding: '5px 8px', background: 'var(--c-danger-bg)', borderRadius: 4 }}>{uploadErr}</p>
          )}
        </div>

        {/* Versions list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--c-text-dim)', fontSize: 11 }}>
              Upload a CV to see versions here
            </div>
          ) : (
            versions.map(v => (
              <VersionItem
                key={v.id}
                v={v}
                active={activeId === v.id}
                loading={deletingId === v.id}
                onLoad={() => loadVersion(v.id)}
                onDelete={() => deleteVersion(v.id)}
              />
            ))
          )}
        </div>

        {/* Save current as version */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--c-border)', flexShrink: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Save current as version</p>
          <div style={{ display: 'flex', gap: 5 }}>
            <input
              ref={labelRef}
              placeholder="e.g. Final v2"
              aria-label="Name for the new CV version"
              style={{
                flex: 1, padding: '6px 9px', borderRadius: 'var(--r-md)',
                border: '1px solid var(--c-border)', background: 'var(--c-bg-3)',
                color: 'var(--c-text)', fontSize: 11, outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              onClick={saveAsVersion}
              disabled={savingVersion}
              aria-label="Save version"
              style={{
                padding: '6px 9px', borderRadius: 'var(--r-md)',
                background: 'var(--c-violet-fill)', border: 'none',
                color: '#fff', cursor: savingVersion ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            >
              {savingVersion ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Editor + toolbar ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10 }}>
          <div style={{ display: 'flex', background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 3 }}>
            <TabBtn active={tab === 'edit'}    icon={Edit3} label="Edit"    onClick={() => setTab('edit')} />
            <TabBtn active={tab === 'preview'} icon={Eye}   label="Preview" onClick={() => setTab('preview')} />
          </div>

          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <GhostBtn icon={copied ? Check : Copy} label={copied ? 'Copied!' : 'Copy'} active={copied} onClick={copy} />
            {/* Primary export: browser-print → real selectable text that ATS can parse. */}
            <GhostBtn icon={Download} label="Download PDF" primary active={false} onClick={downloadAtsPdf}
              title="ATS-safe: exports real, selectable text that Applicant Tracking Systems can read" />
            {/* Secondary: rasterised image PDF — pixel-perfect but UNREADABLE to ATS. */}
            <GhostBtn icon={downloading ? Loader2 : ImageDown} label={downloading ? 'Rendering…' : 'Save as Image'} active={false} onClick={downloadPdf} spin={downloading}
              title="Image PDF — pixel-perfect but NOT machine-readable. Only use for printing or portfolios, never for ATS applications." />
            <GhostBtn icon={saved  ? Check : FileText} label={saved ? 'Saved!' : 'Save to Profile'} active={saved} onClick={saveToProfile} />
            <button onClick={() => setGenModal(true)} disabled={generating} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 'var(--r-md)',
              background: generating ? 'var(--c-bg-4)' : 'var(--c-violet-fill)',
              border: 'none', color: generating ? 'var(--c-text-dim)' : '#fff',
              fontSize: 12, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', opacity: generating ? 0.7 : 1,
            }}>
              {generating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
              {generating ? 'Curating…' : 'Generate for Role'}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ padding: '9px 20px', background: 'var(--c-danger-bg)', borderBottom: '1px solid var(--c-danger-border)', color: 'var(--c-danger-text)', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{error}</span>
            {error.toLowerCase().includes('profile') && (
              <Link href="/personal-info" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-danger-text)', fontWeight: 600, fontSize: 11, textDecoration: 'underline' }}>
                Go to Personal Info <ArrowRight size={10} />
              </Link>
            )}
          </div>
        )}

        {/* Which job this CV was tailored to, with the way back */}
        {tailoredFor && (
          <div className="fade-up" style={{
            padding: '9px 20px', borderBottom: '1px solid var(--c-border)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'var(--c-violet-dim)', fontSize: 12,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--c-violet)', fontWeight: 600, minWidth: 0 }}>
              {generating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} /> : <Sparkles size={13} style={{ flexShrink: 0 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {generating ? 'Tailoring your CV for ' : 'Tailored for '}
                {tailoredFor.role}{tailoredFor.company ? ` · ${tailoredFor.company}` : ''}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              {tailoredFor.jobUrl && (
                <a href={tailoredFor.jobUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-text-muted)', fontWeight: 600, textDecoration: 'none' }}>
                  <ExternalLink size={11} /> View posting{tailoredFor.source ? ` on ${tailoredFor.source}` : ''}
                </a>
              )}
              <Link href="/job-search" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-text-muted)', fontWeight: 600, textDecoration: 'none' }}>
                <ArrowLeft size={11} /> Back to job search
              </Link>
              {!generating && (
                <button type="button" aria-label="Dismiss" onClick={() => setTailoredFor(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--c-text-dim)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                  <X size={12} />
                </button>
              )}
            </span>
          </div>
        )}

        {/* Edit / Preview panel */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* While curating, the old CV stays visible but dimmed under a
              progress card, so the swap to the new one reads as a result. */}
          {generating && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'color-mix(in srgb, var(--c-bg) 72%, transparent)', backdropFilter: 'blur(2px)',
            }}>
              <div className="fade-up" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)',
                padding: '24px 30px', maxWidth: 360, boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-violet)' }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)' }}>Curating your CV</p>
                <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                  Reading all your CVs and profile, then picking what matters for
                  {tailoredFor ? ` ${tailoredFor.role}${tailoredFor.company ? ` at ${tailoredFor.company}` : ''}` : ' this role'}.
                  This usually takes 10–30 seconds.
                </p>
              </div>
            </div>
          )}
          {tab === 'edit' ? (
            <textarea
              aria-label="CV markdown editor"
              value={markdown}
              onChange={e => setMarkdown(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%', height: '100%',
                padding: '22px 26px',
                background: 'var(--c-bg)', border: 'none', outline: 'none',
                color: 'var(--c-text)', fontSize: 13, lineHeight: 1.7,
                fontFamily: 'var(--font-mono)', resize: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <div style={{ height: '100%', overflowY: 'auto', padding: '32px 24px', background: 'var(--c-bg)' }}>
              <CVPreview markdown={markdown} />
            </div>
          )}
        </div>
      </div>

      {/* Sources banner */}
      {sourcesUsed !== null && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: 'var(--c-violet-fill)', color: '#fff', borderRadius: 'var(--r-md)', padding: '9px 16px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, zIndex: 100, boxShadow: '0 4px 20px rgba(124,92,252,0.35)', animation: 'fadeUp 0.3s ease' }}>
          <Sparkles size={13} />
          Curated from {sourcesUsed} CV source{sourcesUsed !== 1 ? 's' : ''}
          <button type="button" aria-label="Dismiss" onClick={() => setSourcesUsed(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.7, padding: 2 }}><X size={12} /></button>
        </div>
      )}

      {/* ── Generate for Role Modal ── */}
      {genModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeGenModal}>
          <div ref={genRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Generate CV for role" style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: 28, width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>Generate CV for Role</h2>
                <p style={{ fontSize: 12, color: 'var(--c-text-dim)', lineHeight: 1.5 }}>
                  The AI reads ALL {versions.length > 0 ? `${versions.length} uploaded CV${versions.length !== 1 ? 's' : ''}` : 'your profile data'} and curates the most relevant one for this specific role — ATS-optimised with the job's exact keywords.
                </p>
              </div>
              <button aria-label="Close" onClick={closeGenModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4, flexShrink: 0 }}><X size={18} /></button>
            </div>

            {versions.length === 0 && (
              <div style={{ background: 'var(--c-gold-dim)', border: '1px solid rgba(212,160,23,0.25)', borderRadius: 'var(--r-md)', padding: '9px 12px', marginTop: 12, fontSize: 12, color: 'var(--c-gold-text)' }}>
                No CVs uploaded yet — the AI will use your Personal Info profile. Upload past CVs for better curation.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <GenField label="Role *" htmlFor="gr-role">
                  <input id="gr-role" value={genForm.role} onChange={e => setGenForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Fullstack Engineer" autoFocus style={genInp} />
                </GenField>
                <GenField label="Company (optional)" htmlFor="gr-co">
                  <input id="gr-co" value={genForm.company} onChange={e => setGenForm(f => ({ ...f, company: e.target.value }))} placeholder="e.g. Andela" style={genInp} />
                </GenField>
              </div>
              <GenField label="Job Description *" htmlFor="gr-jd">
                <textarea id="gr-jd" value={genForm.job_description} onChange={e => setGenForm(f => ({ ...f, job_description: e.target.value }))}
                  placeholder="Paste the full job description — the AI uses its exact keywords to pass ATS filters…"
                  rows={10} style={{ ...genInp, resize: 'vertical', lineHeight: 1.65 }} />
              </GenField>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeGenModal} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button type="button" onClick={() => generate()} disabled={!genForm.role || !genForm.job_description} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 'var(--r-md)',
                background: genForm.role && genForm.job_description ? 'var(--c-violet-fill)' : 'var(--c-bg-4)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: genForm.role && genForm.job_description ? 'pointer' : 'default', fontFamily: 'var(--font-body)',
              }}>
                <Sparkles size={13} /> Curate CV
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────

function TabBtn({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 11px', borderRadius: 6, border: 'none',
      background: active ? 'var(--c-bg-4)' : 'transparent',
      color: active ? 'var(--c-text)' : 'var(--c-text-muted)',
      fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s',
    }}>
      <Icon size={12} /> {label}
    </button>
  )
}

function GhostBtn({ icon: Icon, label, active, onClick, spin, primary, title }: { icon: React.ElementType; label: string; active: boolean; onClick: () => void; spin?: boolean; primary?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '7px 12px', borderRadius: 'var(--r-md)',
      background: primary ? 'var(--c-violet-dim)' : 'var(--c-bg-3)',
      border: `1px solid ${primary ? 'var(--c-border-hot)' : 'var(--c-border)'}`,
      color: primary ? 'var(--c-violet)' : active ? 'var(--c-teal)' : 'var(--c-text-muted)',
      fontSize: 12, fontWeight: primary ? 600 : 500, cursor: 'pointer',
      fontFamily: 'var(--font-body)', transition: 'all 0.2s',
    }}>
      <Icon size={12} style={spin ? { animation: 'spin 1s linear infinite' } : undefined} /> {label}
    </button>
  )
}

const genInp: React.CSSProperties = {
  width: '100%', padding: '8px 11px',
  background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-md)', color: 'var(--c-text)',
  fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)',
  boxSizing: 'border-box',
}

function GenField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
